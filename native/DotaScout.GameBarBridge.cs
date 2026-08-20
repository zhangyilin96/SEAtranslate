using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;

internal sealed class BridgeLine
{
    public string language { get; set; }
    public string text { get; set; }
}

internal sealed class BridgeState
{
    public string type { get; set; }
    public int version { get; set; }
    public long sequence { get; set; }
    public long sentAt { get; set; }
    public bool visible { get; set; }
    public double opacity { get; set; }
    public BridgeLine[] lines { get; set; }
}

internal sealed class GameBarBridge : IDisposable
{
    public const string PipeName = "LOCAL\\DotaScout.GameBarWidget.v1";
    private const string PipeLeafName = "DotaScout.GameBarWidget.v1";
    private const string WidgetPackageFamilyName = "DotaScout.GameBarWidget.Poc_x1vqwb1368zjj";
    private const int MaxWidgetConnections = 8;

    private sealed class WidgetConnection : IDisposable
    {
        private readonly object writeSync = new object();
        private int disposed;

        public readonly NamedPipeServerStream Pipe;
        public readonly StreamReader Reader;
        public readonly StreamWriter Writer;

        public WidgetConnection(NamedPipeServerStream pipe)
        {
            Pipe = pipe;
            Reader = new StreamReader(pipe, Encoding.UTF8, false, 4096, true);
            Writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
        }

        public void Send(string value)
        {
            lock (writeSync)
            {
                if (Pipe.IsConnected) Writer.WriteLine(value);
            }
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref disposed, 1) != 0) return;
            lock (writeSync)
            {
                try { Writer.Dispose(); }
                catch (IOException) { }
                catch (ObjectDisposedException) { }
                try { Reader.Dispose(); }
                catch (IOException) { }
                catch (ObjectDisposedException) { }
                try { Pipe.Dispose(); }
                catch (IOException) { }
                catch (ObjectDisposedException) { }
            }
        }
    }

    private readonly object sync = new object();
    private readonly AutoResetEvent connectionSlotAvailable = new AutoResetEvent(false);
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 16384 };
    private readonly Action<string> publish;
    private readonly string serverPipeName;
    private readonly List<WidgetConnection> connections = new List<WidgetConnection>();
    private volatile bool stopping;
    private NamedPipeServerStream pendingServer;
    private BridgeState latest;

    public GameBarBridge(Action<string> publishEvent, string pipeLeafName = PipeLeafName)
    {
        publish = publishEvent;
        serverPipeName = GetWidgetServerPipeName(pipeLeafName);
    }

    public void Start()
    {
        var thread = new Thread(AcceptLoop) { IsBackground = true, Name = "DotaScoutGameBarPipe" };
        thread.Start();
    }

    public bool AcceptDesktopState(string value, out string error)
    {
        try
        {
            var candidate = json.Deserialize<BridgeState>(value);
            latest = Normalize(candidate);
            error = null;
            Send(latest);
            return true;
        }
        catch (Exception exception)
        {
            error = exception.Message;
            Publish(new Dictionary<string, object> {
                { "type", "bridge-error" },
                { "error", error }
            });
            return false;
        }
    }

    private BridgeState Normalize(BridgeState candidate)
    {
        if (candidate == null || !String.Equals(candidate.type, "state", StringComparison.Ordinal))
            throw new InvalidDataException("Only state messages are accepted.");
        if (candidate.version != 1) throw new InvalidDataException("Unsupported bridge protocol version.");
        if (candidate.sequence < 0) throw new InvalidDataException("Invalid sequence.");

        var source = candidate.lines ?? new BridgeLine[0];
        var normalized = new List<BridgeLine>();
        var start = Math.Max(0, source.Length - 3);
        for (var index = start; index < source.Length; index++)
        {
            var line = source[index];
            if (line == null) continue;
            var language = (line.language ?? "").Trim().ToUpperInvariant();
            var text = (line.text ?? "").Trim();
            if (language.Length > 8) language = language.Substring(0, 8);
            if (text.Length > 240) text = text.Substring(0, 240);
            if (text.Length == 0) continue;
            normalized.Add(new BridgeLine { language = language.Length == 0 ? "AUTO" : language, text = text });
        }

        return new BridgeState {
            type = "state",
            version = 1,
            sequence = candidate.sequence,
            sentAt = candidate.sentAt > 0 ? candidate.sentAt : UnixMilliseconds(),
            visible = candidate.visible,
            opacity = Math.Max(0.2, Math.Min(1.0, candidate.opacity)),
            lines = normalized.ToArray()
        };
    }

    private void AcceptLoop()
    {
        while (!stopping)
        {
            if (!WaitForConnectionSlot()) break;
            NamedPipeServerStream next = null;
            try
            {
                next = CreatePipe();
                lock (sync) pendingServer = next;
                next.WaitForConnection();
                if (stopping) break;

                var connection = new WidgetConnection(next);
                BridgeState initial;
                int connectionCount;
                lock (sync)
                {
                    if (ReferenceEquals(pendingServer, next)) pendingServer = null;
                    connections.Add(connection);
                    initial = latest;
                    connectionCount = connections.Count;
                    PublishConnectionState(true, connectionCount);
                }
                next = null;
                var thread = new Thread(() => HandleConnection(connection, initial)) {
                    IsBackground = true,
                    Name = "DotaScoutGameBarClient"
                };
                thread.Start();
            }
            catch (Exception exception)
            {
                if (!stopping)
                {
                    Publish(new Dictionary<string, object> {
                        { "type", "bridge-error" },
                        { "error", exception.Message }
                    });
                }
            }
            finally
            {
                lock (sync)
                {
                    if (ReferenceEquals(pendingServer, next)) pendingServer = null;
                }
                if (next != null) next.Dispose();
            }
        }
    }

    private bool WaitForConnectionSlot()
    {
        while (!stopping)
        {
            lock (sync)
            {
                if (connections.Count < MaxWidgetConnections) return true;
            }
            connectionSlotAvailable.WaitOne(500);
        }
        return false;
    }

    private void HandleConnection(WidgetConnection connection, BridgeState initial)
    {
        int connectionCount;
        try
        {
            if (initial != null) connection.Send(json.Serialize(initial));
            string response;
            while (!stopping && connection.Pipe.IsConnected && (response = connection.Reader.ReadLine()) != null)
            {
                PublishWidgetResponse(response);
            }
        }
        catch (Exception exception)
        {
            if (!stopping && !(exception is IOException) && !(exception is ObjectDisposedException))
            {
                Publish(new Dictionary<string, object> {
                    { "type", "bridge-error" },
                    { "error", exception.Message }
                });
            }
        }
        finally
        {
            lock (sync)
            {
                connections.Remove(connection);
                connectionCount = connections.Count;
                if (!stopping) PublishConnectionState(connectionCount > 0, connectionCount);
            }
            connection.Dispose();
            connectionSlotAvailable.Set();
        }
    }

    private void PublishConnectionState(bool connected, int connectionCount)
    {
        Publish(new Dictionary<string, object> {
            { "type", "connection" },
            { "connected", connected },
            { "clientCount", connectionCount },
            { "at", UnixMilliseconds() }
        });
    }

    private NamedPipeServerStream CreatePipe()
    {
        var security = new PipeSecurity();
        security.SetAccessRuleProtection(true, false);
        var readWrite = PipeAccessRights.ReadWrite | PipeAccessRights.CreateNewInstance;
        security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.WorldSid, null), readWrite, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier("S-1-15-2-1"), readWrite, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(DeriveWidgetPackageSid(), readWrite, AccessControlType.Allow));
        return new NamedPipeServerStream(
            serverPipeName,
            PipeDirection.InOut,
            MaxWidgetConnections,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous,
            16384,
            16384,
            security);
    }

    private static SecurityIdentifier DeriveWidgetPackageSid()
    {
        IntPtr sid;
        var result = DeriveAppContainerSidFromAppContainerName(WidgetPackageFamilyName, out sid);
        if (result != 0 || sid == IntPtr.Zero)
            throw new InvalidOperationException("Unable to derive the Game Bar Widget package SID (HRESULT 0x" + result.ToString("X8") + ").");
        try
        {
            return new SecurityIdentifier(sid);
        }
        finally
        {
            FreeSid(sid);
        }
    }

    public static string GetWidgetServerPipeName()
    {
        return GetWidgetServerPipeName(PipeLeafName);
    }

    internal static string GetWidgetServerPipeName(string pipeLeafName)
    {
        if (String.IsNullOrWhiteSpace(pipeLeafName) || pipeLeafName.IndexOfAny(new[] { '\\', '/' }) >= 0)
            throw new ArgumentException("Invalid pipe leaf name.", "pipeLeafName");
        IntPtr sid;
        var result = DeriveAppContainerSidFromAppContainerName(WidgetPackageFamilyName, out sid);
        if (result != 0 || sid == IntPtr.Zero)
            throw new InvalidOperationException("Unable to derive the Game Bar Widget package SID (HRESULT 0x" + result.ToString("X8") + ").");
        try
        {
            uint required;
            GetAppContainerNamedObjectPath(IntPtr.Zero, sid, 0, null, out required);
            if (required == 0) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            var path = new StringBuilder((int)required);
            if (!GetAppContainerNamedObjectPath(IntPtr.Zero, sid, required, path, out required))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            return "Sessions\\" + Process.GetCurrentProcess().SessionId + "\\" + path + "\\" + pipeLeafName;
        }
        finally
        {
            FreeSid(sid);
        }
    }

    [DllImport("userenv.dll", CharSet = CharSet.Unicode)]
    private static extern int DeriveAppContainerSidFromAppContainerName(string appContainerName, out IntPtr sid);

    [DllImport("advapi32.dll")]
    private static extern IntPtr FreeSid(IntPtr sid);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetAppContainerNamedObjectPath(
        IntPtr token,
        IntPtr appContainerSid,
        uint objectPathLength,
        StringBuilder objectPath,
        out uint returnLength);

    private void Send(BridgeState state)
    {
        WidgetConnection[] snapshot;
        lock (sync) snapshot = connections.ToArray();
        var value = json.Serialize(state);
        foreach (var connection in snapshot)
        {
            try
            {
                connection.Send(value);
            }
            catch (IOException)
            {
                // The accept loop reports the disconnect and waits for the widget to reconnect.
            }
            catch (ObjectDisposedException) { }
        }
    }

    private void PublishWidgetResponse(string value)
    {
        try
        {
            var response = json.Deserialize<Dictionary<string, object>>(value);
            object type;
            if (!response.TryGetValue("type", out type)) return;
            var name = Convert.ToString(type);
            if (name != "ack" && name != "widget-status") return;
            response["bridgeReceivedAt"] = UnixMilliseconds();
            Publish(response);
        }
        catch (Exception exception)
        {
            Publish(new Dictionary<string, object> {
                { "type", "bridge-error" },
                { "error", "Invalid widget response: " + exception.Message }
            });
        }
    }

    private void Publish(object value)
    {
        publish(json.Serialize(value));
    }

    private static long UnixMilliseconds()
    {
        return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds;
    }

    public void Dispose()
    {
        stopping = true;
        connectionSlotAvailable.Set();
        WidgetConnection[] snapshot;
        lock (sync)
        {
            if (pendingServer != null) pendingServer.Dispose();
            pendingServer = null;
            snapshot = connections.ToArray();
            connections.Clear();
        }
        foreach (var connection in snapshot) connection.Dispose();
    }
}

internal static class Program
{
    private static readonly object outputSync = new object();

    private static void Output(string value)
    {
        lock (outputSync)
        {
            Console.Out.WriteLine(value);
            Console.Out.Flush();
        }
    }

    private static void RunSelfTestClient(string pipeName, ManualResetEvent release, Action<string> reportFailure)
    {
        try
        {
            var serializer = new JavaScriptSerializer();
            using (var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous))
            {
                pipe.Connect(3000);
                var reader = new StreamReader(pipe, Encoding.UTF8, false, 4096, true);
                var writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
                var received = serializer.Deserialize<BridgeState>(reader.ReadLine());
                if (received.lines.Length != 3 || received.lines[0].text != "two" || received.lines[2].text != "four")
                    throw new InvalidDataException("Recent-three normalization failed.");
                writer.WriteLine("{\"type\":\"ack\",\"version\":1,\"sequence\":7,\"appliedAt\":123}");
                release.WaitOne(4000);
            }
        }
        catch (Exception exception)
        {
            reportFailure(exception.Message);
        }
    }

    private static int SelfTest()
    {
        var serializer = new JavaScriptSerializer();
        var ack = new ManualResetEvent(false);
        var releaseClients = new ManualResetEvent(false);
        var failureSync = new object();
        var ackCount = 0;
        var testPipeLeafName = "DotaScout.GameBarWidget.selftest." + Process.GetCurrentProcess().Id;
        var testPipeName = GameBarBridge.GetWidgetServerPipeName(testPipeLeafName);
        string failure = null;
        using (var bridge = new GameBarBridge(value => {
            Output(value);
            if (value.Contains("\"type\":\"ack\"") && Interlocked.Increment(ref ackCount) >= 2) ack.Set();
        }, testPipeLeafName))
        {
            bridge.Start();
            Action<string> reportFailure = value => {
                lock (failureSync)
                {
                    if (failure == null) failure = value;
                }
                ack.Set();
            };
            var firstClient = new Thread(() => RunSelfTestClient(testPipeName, releaseClients, reportFailure)) { IsBackground = true };
            var secondClient = new Thread(() => RunSelfTestClient(testPipeName, releaseClients, reportFailure)) { IsBackground = true };
            firstClient.Start();
            secondClient.Start();

            Thread.Sleep(100);
            string error;
            bridge.AcceptDesktopState("{\"type\":\"state\",\"version\":1,\"sequence\":7,\"sentAt\":100,\"visible\":true,\"opacity\":0.75,\"lines\":[{\"language\":\"TH\",\"text\":\"one\"},{\"language\":\"ID\",\"text\":\"two\"},{\"language\":\"MS\",\"text\":\"three\"},{\"language\":\"EN\",\"text\":\"four\"}]}", out error);
            if (!ack.WaitOne(4000)) failure = "Timed out waiting for bridge acknowledgement.";
            releaseClients.Set();
            firstClient.Join(1000);
            secondClient.Join(1000);

            Thread.Sleep(100);
            var burstClients = new List<NamedPipeClientStream>();
            try
            {
                for (var index = 0; index < 8; index++)
                {
                    var client = new NamedPipeClientStream(".", testPipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
                    client.Connect(3000);
                    burstClients.Add(client);
                }
            }
            catch (Exception exception)
            {
                failure = "Full-capacity connection failed: " + exception.Message;
            }
            finally
            {
                foreach (var client in burstClients) client.Dispose();
            }

            Thread.Sleep(200);
            try
            {
                using (var recovery = new NamedPipeClientStream(".", testPipeName, PipeDirection.InOut, PipeOptions.Asynchronous))
                {
                    recovery.Connect(3000);
                    var reader = new StreamReader(recovery, Encoding.UTF8, false, 4096, true);
                    var received = serializer.Deserialize<BridgeState>(reader.ReadLine());
                    if (received == null || received.sequence != 7)
                        failure = "Bridge did not recover after full-capacity disconnect.";
                }
            }
            catch (Exception exception)
            {
                failure = "Full-capacity recovery failed: " + exception.Message;
            }
        }

        if (failure != null)
        {
            Output(serializer.Serialize(new Dictionary<string, object> { { "ok", false }, { "error", failure } }));
            return 1;
        }
        Output("{\"ok\":true,\"pipe\":\"LOCAL\\\\DotaScout.GameBarWidget.v1\",\"recentThree\":true,\"ack\":true,\"multipleClients\":true,\"fullCapacityRecovery\":true}");
        return 0;
    }

    public static int Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        if (args.Length == 1 && args[0] == "--self-test") return SelfTest();

        using (var bridge = new GameBarBridge(Output))
        {
            bridge.Start();
            Output("{\"type\":\"bridge-ready\",\"version\":1,\"pipe\":\"LOCAL\\\\DotaScout.GameBarWidget.v1\"}");
            string line;
            while ((line = Console.In.ReadLine()) != null)
            {
                string error;
                bridge.AcceptDesktopState(line, out error);
            }
        }
        return 0;
    }
}

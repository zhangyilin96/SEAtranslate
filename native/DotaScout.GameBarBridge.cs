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

    private readonly object sync = new object();
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 16384 };
    private readonly Action<string> publish;
    private volatile bool stopping;
    private NamedPipeServerStream pipe;
    private StreamWriter writer;
    private BridgeState latest;

    public GameBarBridge(Action<string> publishEvent)
    {
        publish = publishEvent;
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
            NamedPipeServerStream next = null;
            try
            {
                next = CreatePipe();
                next.WaitForConnection();
                if (stopping) break;

                var nextWriter = new StreamWriter(next, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
                var reader = new StreamReader(next, Encoding.UTF8, false, 4096, true);
                lock (sync)
                {
                    pipe = next;
                    writer = nextWriter;
                }
                Publish(new Dictionary<string, object> {
                    { "type", "connection" },
                    { "connected", true },
                    { "at", UnixMilliseconds() }
                });
                if (latest != null) Send(latest);

                string response;
                while (!stopping && next.IsConnected && (response = reader.ReadLine()) != null)
                {
                    PublishWidgetResponse(response);
                }
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
                    if (ReferenceEquals(pipe, next))
                    {
                        writer = null;
                        pipe = null;
                    }
                }
                if (next != null) next.Dispose();
                if (!stopping)
                {
                    Publish(new Dictionary<string, object> {
                        { "type", "connection" },
                        { "connected", false },
                        { "at", UnixMilliseconds() }
                    });
                }
            }
        }
    }

    private static NamedPipeServerStream CreatePipe()
    {
        var security = new PipeSecurity();
        security.SetAccessRuleProtection(true, false);
        var readWrite = PipeAccessRights.ReadWrite | PipeAccessRights.CreateNewInstance;
        security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.WorldSid, null), readWrite, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier("S-1-15-2-1"), readWrite, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(DeriveWidgetPackageSid(), readWrite, AccessControlType.Allow));
        return new NamedPipeServerStream(
            GetWidgetServerPipeName(),
            PipeDirection.InOut,
            1,
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
            return "Sessions\\" + Process.GetCurrentProcess().SessionId + "\\" + path + "\\" + PipeLeafName;
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
        lock (sync)
        {
            if (writer == null || pipe == null || !pipe.IsConnected) return;
            try
            {
                writer.WriteLine(json.Serialize(state));
            }
            catch (IOException)
            {
                // The accept loop reports the disconnect and waits for the widget to reconnect.
            }
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
        lock (sync)
        {
            if (pipe != null) pipe.Dispose();
            pipe = null;
            writer = null;
        }
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

    private static int SelfTest()
    {
        var serializer = new JavaScriptSerializer();
        var ack = new ManualResetEvent(false);
        string failure = null;
        using (var bridge = new GameBarBridge(value => {
            Output(value);
            if (value.Contains("\"type\":\"ack\"")) ack.Set();
        }))
        {
            bridge.Start();
            var client = new Thread(() => {
                try
                {
                    using (var pipe = new NamedPipeClientStream(".", GameBarBridge.GetWidgetServerPipeName(), PipeDirection.InOut, PipeOptions.Asynchronous))
                    {
                        pipe.Connect(3000);
                        var reader = new StreamReader(pipe, Encoding.UTF8, false, 4096, true);
                        var writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
                        var received = serializer.Deserialize<BridgeState>(reader.ReadLine());
                        if (received.lines.Length != 3 || received.lines[0].text != "two" || received.lines[2].text != "four")
                            throw new InvalidDataException("Recent-three normalization failed.");
                        writer.WriteLine("{\"type\":\"ack\",\"version\":1,\"sequence\":7,\"appliedAt\":123}");
                    }
                }
                catch (Exception exception)
                {
                    failure = exception.Message;
                    ack.Set();
                }
            }) { IsBackground = true };
            client.Start();

            Thread.Sleep(100);
            string error;
            bridge.AcceptDesktopState("{\"type\":\"state\",\"version\":1,\"sequence\":7,\"sentAt\":100,\"visible\":true,\"opacity\":0.75,\"lines\":[{\"language\":\"TH\",\"text\":\"one\"},{\"language\":\"ID\",\"text\":\"two\"},{\"language\":\"MS\",\"text\":\"three\"},{\"language\":\"EN\",\"text\":\"four\"}]}", out error);
            if (!ack.WaitOne(4000)) failure = "Timed out waiting for bridge acknowledgement.";
        }

        if (failure != null)
        {
            Output(serializer.Serialize(new Dictionary<string, object> { { "ok", false }, { "error", failure } }));
            return 1;
        }
        Output("{\"ok\":true,\"pipe\":\"LOCAL\\\\DotaScout.GameBarWidget.v1\",\"recentThree\":true,\"ack\":true}");
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

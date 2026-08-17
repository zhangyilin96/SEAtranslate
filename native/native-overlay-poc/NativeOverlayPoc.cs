using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using SharpDX;
using SharpDX.Direct3D;
using SharpDX.DirectWrite;
using SharpDX.Mathematics.Interop;
using D2D = SharpDX.Direct2D1;
using D3D11 = SharpDX.Direct3D11;
using DComp = SharpDX.DirectComposition;
using DXGI = SharpDX.DXGI;

namespace DotaScout.NativeOverlayPoc
{
    internal static class Bootstrap
    {
        [STAThread]
        private static int Main(string[] args)
        {
            AppDomain.CurrentDomain.AssemblyResolve += ResolveEmbeddedAssembly;
            try
            {
                return NativeOverlayApplication.Run(args);
            }
            catch (Exception error)
            {
                NativeMethods.MessageBox(IntPtr.Zero,
                    "Native Overlay PoC 启动失败。\n\n" + error.Message +
                    "\n\n请查看 EXE 同目录 logs 文件夹。",
                    "Dota Scout Native Overlay", 0x10);
                return 1;
            }
        }

        private static Assembly ResolveEmbeddedAssembly(object sender, ResolveEventArgs args)
        {
            string simpleName = new AssemblyName(args.Name).Name + ".dll";
            Assembly owner = Assembly.GetExecutingAssembly();
            using (Stream stream = owner.GetManifestResourceStream(simpleName))
            {
                if (stream == null) return null;
                byte[] bytes = new byte[stream.Length];
                int offset = 0;
                while (offset < bytes.Length)
                {
                    int read = stream.Read(bytes, offset, bytes.Length - offset);
                    if (read == 0) break;
                    offset += read;
                }
                return Assembly.Load(bytes);
            }
        }
    }

    internal sealed class NativeOverlayApplication : IDisposable
    {
        private const int HotkeyToggle = 4101;
        private const int HotkeyExit = 4102;
        private const int HotkeyOpacityDown = 4103;
        private const int HotkeyOpacityUp = 4104;
        private const uint ModAlt = 0x0001;
        private const uint ModControl = 0x0002;
        private const uint ModShift = 0x0004;
        private const uint ModNoRepeat = 0x4000;
        private const uint VkF9 = 0x78;
        private const uint VkF10 = 0x79;
        private const uint VkF11 = 0x7A;
        private const uint VkF12 = 0x7B;
        private const int BaseWidth = 520;
        private const int BaseHeight = 148;
        private const int MarginDip = 20;

        private readonly DiagnosticLog log;
        private readonly bool selfTest;
        private readonly string scenarioOverride;
        private int backgroundOpacityPercent;
        private readonly NativeMethods.WindowProcedure windowProcedure;
        private readonly string className;
        private IntPtr window;
        private IntPtr instance;
        private OverlayRenderer renderer;
        private bool visible;
        private bool toggleHotkeyRegistered;
        private bool exitHotkeyRegistered;
        private bool opacityDownHotkeyRegistered;
        private bool opacityUpHotkeyRegistered;
        private PerformanceDiagnostics performance;
        private uint currentDpi = 96;
        private int pixelWidth;
        private int pixelHeight;
        private int selfTestFailures;

        private NativeOverlayApplication(bool runSelfTest, string scenario, int opacityPercent)
        {
            selfTest = runSelfTest;
            scenarioOverride = scenario;
            backgroundOpacityPercent = Math.Max(0, Math.Min(100, opacityPercent));
            log = new DiagnosticLog();
            windowProcedure = WindowProc;
            className = "DotaScoutNativeOverlay_" + Process.GetCurrentProcess().Id.ToString(CultureInfo.InvariantCulture);
        }

        public static int Run(string[] args)
        {
            bool runSelfTest = false;
            string scenario = null;
            int opacityPercent = 38;
            foreach (string argument in args)
            {
                if (String.Equals(argument, "--self-test", StringComparison.OrdinalIgnoreCase)) runSelfTest = true;
                if (argument.StartsWith("--scenario=", StringComparison.OrdinalIgnoreCase)) scenario = argument.Substring("--scenario=".Length);
                if (argument.StartsWith("--opacity=", StringComparison.OrdinalIgnoreCase))
                {
                    int parsed;
                    if (Int32.TryParse(argument.Substring("--opacity=".Length), NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed))
                        opacityPercent = Math.Max(0, Math.Min(100, parsed));
                }
            }

            bool createdNew;
            using (Mutex mutex = new Mutex(true, "DotaScout.NativeDCompOverlayPoc.Singleton", out createdNew))
            {
                if (!createdNew)
                {
                    NativeMethods.MessageBox(IntPtr.Zero, "Native Overlay PoC 已经在运行。", "Dota Scout Native Overlay", 0x40);
                    return 0;
                }

                using (NativeOverlayApplication application = new NativeOverlayApplication(runSelfTest, scenario, opacityPercent))
                {
                    return application.Execute();
                }
            }
        }

        private int Execute()
        {
            ConfigureDpiAwareness();
            CreateOverlayWindow();
            renderer = new OverlayRenderer(log, window, pixelWidth, pixelHeight, currentDpi, backgroundOpacityPercent);
            RegisterHotkeys();
            ShowOverlay("STARTUP");
            performance = new PerformanceDiagnostics(log, renderer);
            performance.Start();

            if (selfTest)
            {
                RunSelfTest();
                return selfTestFailures == 0 ? 0 : 2;
            }

            NativeMethods.MSG message;
            while (NativeMethods.GetMessage(out message, IntPtr.Zero, 0, 0) > 0)
            {
                NativeMethods.TranslateMessage(ref message);
                NativeMethods.DispatchMessage(ref message);
            }
            return 0;
        }

        private void ConfigureDpiAwareness()
        {
            bool configured = false;
            try { configured = NativeMethods.SetProcessDpiAwarenessContext(new IntPtr(-4)); }
            catch (EntryPointNotFoundException) { }
            if (!configured)
            {
                try { configured = NativeMethods.SetProcessDPIAware(); }
                catch (EntryPointNotFoundException) { }
            }
            log.Write("DPI_AWARENESS", "requested=PER_MONITOR_AWARE_V2 result=" + Bool(configured));
        }

        private void CreateOverlayWindow()
        {
            instance = NativeMethods.GetModuleHandle(null);
            NativeMethods.WNDCLASSEX windowClass = new NativeMethods.WNDCLASSEX();
            windowClass.cbSize = (uint)Marshal.SizeOf(typeof(NativeMethods.WNDCLASSEX));
            windowClass.style = 0x0002 | 0x0001;
            windowClass.lpfnWndProc = windowProcedure;
            windowClass.hInstance = instance;
            // A class cursor would replace Dota's cursor while the pointer crosses this HWND.
            // The production overlay is fully input-transparent, so it intentionally owns no cursor.
            windowClass.hCursor = IntPtr.Zero;
            windowClass.lpszClassName = className;
            ushort atom = NativeMethods.RegisterClassEx(ref windowClass);
            if (atom == 0) throw new InvalidOperationException("RegisterClassEx failed: " + Marshal.GetLastWin32Error());

            IntPtr monitor = NativeMethods.MonitorFromWindow(NativeMethods.GetForegroundWindow(), 2);
            currentDpi = NativeMethods.GetMonitorDpi(monitor);
            pixelWidth = ScaleDip(BaseWidth, currentDpi);
            pixelHeight = ScaleDip(BaseHeight, currentDpi);
            NativeMethods.RECT monitorRect = NativeMethods.GetMonitorRectangle(monitor, false);
            int margin = ScaleDip(MarginDip, currentDpi);
            int x = monitorRect.Right - pixelWidth - margin;
            int y = monitorRect.Top + margin;

            uint extendedStyle = NativeMethods.WS_EX_TOPMOST |
                                 NativeMethods.WS_EX_LAYERED |
                                 NativeMethods.WS_EX_TOOLWINDOW |
                                 NativeMethods.WS_EX_NOACTIVATE |
                                 NativeMethods.WS_EX_TRANSPARENT |
                                 NativeMethods.WS_EX_NOREDIRECTIONBITMAP;
            window = NativeMethods.CreateWindowEx(
                extendedStyle,
                className,
                "Dota Scout Native Overlay PoC",
                NativeMethods.WS_POPUP,
                x, y, pixelWidth, pixelHeight,
                IntPtr.Zero, IntPtr.Zero, instance, IntPtr.Zero);
            if (window == IntPtr.Zero) throw new InvalidOperationException("CreateWindowEx failed: " + Marshal.GetLastWin32Error());

            log.Write("WINDOW_CREATED",
                "hwnd=" + Hex(window) +
                " dpi=" + currentDpi.ToString(CultureInfo.InvariantCulture) +
                " pixels=" + pixelWidth + "x" + pixelHeight +
                " styles=TOPMOST|LAYERED|TOOLWINDOW|NOACTIVATE|TRANSPARENT|NOREDIRECTIONBITMAP" +
                " inputMode=FULL_PASSTHROUGH classCursor=NONE");
        }

        private void RegisterHotkeys()
        {
            toggleHotkeyRegistered = NativeMethods.RegisterHotKey(window, HotkeyToggle, ModControl | ModShift | ModNoRepeat, VkF9);
            exitHotkeyRegistered = NativeMethods.RegisterHotKey(window, HotkeyExit, ModControl | ModShift | ModNoRepeat, VkF10);
            opacityDownHotkeyRegistered = NativeMethods.RegisterHotKey(window, HotkeyOpacityDown, ModControl | ModShift | ModNoRepeat, VkF11);
            opacityUpHotkeyRegistered = NativeMethods.RegisterHotKey(window, HotkeyOpacityUp, ModControl | ModShift | ModNoRepeat, VkF12);
            log.Write("HOTKEY_REGISTER",
                "toggle=Ctrl+Shift+F9:" + (toggleHotkeyRegistered ? "PASS" : "FAIL") +
                " exit=Ctrl+Shift+F10:" + (exitHotkeyRegistered ? "PASS" : "FAIL") +
                " opacityDown=Ctrl+Shift+F11:" + (opacityDownHotkeyRegistered ? "PASS" : "FAIL") +
                " opacityUp=Ctrl+Shift+F12:" + (opacityUpHotkeyRegistered ? "PASS" : "FAIL"));
            if (!toggleHotkeyRegistered)
                throw new InvalidOperationException("Ctrl+Shift+F9 注册失败，可能被其他程序占用。");
        }

        private IntPtr WindowProc(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam)
        {
            if (performance != null) performance.CountMessage(message);
            if (message == NativeMethods.WM_HOTKEY)
            {
                int id = wParam.ToInt32();
                if (id == HotkeyToggle)
                {
                    log.Write("HOTKEY_RECEIVED", "accelerator=Ctrl+Shift+F9");
                    if (visible) HideOverlay("HOTKEY"); else ShowOverlay("HOTKEY");
                    return IntPtr.Zero;
                }
                if (id == HotkeyExit)
                {
                    log.Write("HOTKEY_RECEIVED", "accelerator=Ctrl+Shift+F10 action=EXIT");
                    NativeMethods.DestroyWindow(window);
                    return IntPtr.Zero;
                }
                if (id == HotkeyOpacityDown)
                {
                    SetBackgroundOpacity(backgroundOpacityPercent - 10, "HOTKEY_DOWN");
                    return IntPtr.Zero;
                }
                if (id == HotkeyOpacityUp)
                {
                    SetBackgroundOpacity(backgroundOpacityPercent + 10, "HOTKEY_UP");
                    return IntPtr.Zero;
                }
            }
            else if (message == NativeMethods.WM_NCHITTEST)
            {
                return new IntPtr(NativeMethods.HTTRANSPARENT);
            }
            else if (message == NativeMethods.WM_MOUSEACTIVATE)
            {
                // This should be unreachable with LAYERED|TRANSPARENT. If Windows asks anyway,
                // never activate the overlay and never change the foreground application.
                return new IntPtr(NativeMethods.MA_NOACTIVATE);
            }
            else if (message == NativeMethods.WM_SETCURSOR)
            {
                // Preserve Dota's cursor if a stale hit-test reaches this HWND.
                return new IntPtr(1);
            }
            else if (message == NativeMethods.WM_DPICHANGED)
            {
                currentDpi = (uint)(wParam.ToInt64() & 0xFFFF);
                NativeMethods.RECT suggested = (NativeMethods.RECT)Marshal.PtrToStructure(lParam, typeof(NativeMethods.RECT));
                pixelWidth = suggested.Right - suggested.Left;
                pixelHeight = suggested.Bottom - suggested.Top;
                SetOverlayWindowPos(new IntPtr(-1), suggested.Left, suggested.Top, pixelWidth, pixelHeight,
                    NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_SHOWWINDOW);
                if (renderer != null) renderer.Resize(pixelWidth, pixelHeight, currentDpi);
                log.Write("DPI_CHANGED", "dpi=" + currentDpi + " bounds=" + RectText(suggested));
                return IntPtr.Zero;
            }
            else if (message == NativeMethods.WM_ERASEBKGND)
            {
                return new IntPtr(1);
            }
            else if (message == NativeMethods.WM_DESTROY)
            {
                NativeMethods.PostQuitMessage(0);
                return IntPtr.Zero;
            }
            return NativeMethods.DefWindowProc(hwnd, message, wParam, lParam);
        }

        private void SetBackgroundOpacity(int percent, string reason)
        {
            backgroundOpacityPercent = Math.Max(0, Math.Min(100, percent));
            renderer.SetBackgroundOpacity(backgroundOpacityPercent);
            renderer.Render();
            renderer.Commit();
            log.Write("OPACITY_CHANGED", "reason=" + reason + " backgroundOpacityPercent=" + backgroundOpacityPercent);
            WriteDiagnosticSnapshot("OPACITY_" + reason);
        }

        private void ShowOverlay(string reason)
        {
            RepositionToForegroundMonitor();
            renderer.Render();
            NativeMethods.ShowWindow(window, NativeMethods.SW_SHOWNOACTIVATE);
            SetOverlayWindowPos(new IntPtr(-1), 0, 0, 0, 0,
                NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE | NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_SHOWWINDOW);
            renderer.Commit();
            visible = true;
            WriteDiagnosticSnapshot("SHOW_" + reason);
        }

        private void HideOverlay(string reason)
        {
            NativeMethods.ShowWindow(window, NativeMethods.SW_HIDE);
            visible = false;
            WriteDiagnosticSnapshot("HIDE_" + reason);
        }

        private void RepositionToForegroundMonitor()
        {
            IntPtr foreground = NativeMethods.GetForegroundWindow();
            IntPtr monitor = NativeMethods.MonitorFromWindow(foreground, 2);
            uint newDpi = NativeMethods.GetMonitorDpi(monitor);
            int newWidth = ScaleDip(BaseWidth, newDpi);
            int newHeight = ScaleDip(BaseHeight, newDpi);
            NativeMethods.RECT monitorRect = NativeMethods.GetMonitorRectangle(monitor, false);
            int margin = ScaleDip(MarginDip, newDpi);
            int x = monitorRect.Right - newWidth - margin;
            int y = monitorRect.Top + margin;
            SetOverlayWindowPos(new IntPtr(-1), x, y, newWidth, newHeight,
                NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_SHOWWINDOW);
            if (newWidth != pixelWidth || newHeight != pixelHeight || newDpi != currentDpi)
            {
                pixelWidth = newWidth;
                pixelHeight = newHeight;
                currentDpi = newDpi;
                if (renderer != null) renderer.Resize(pixelWidth, pixelHeight, currentDpi);
            }
        }

        private bool SetOverlayWindowPos(IntPtr insertAfter, int x, int y, int width, int height, uint flags)
        {
            if (performance != null) performance.CountSetWindowPos();
            return NativeMethods.SetWindowPos(window, insertAfter, x, y, width, height, flags);
        }

        private void WriteDiagnosticSnapshot(string action)
        {
            NativeMethods.RECT bounds;
            NativeMethods.GetWindowRect(window, out bounds);
            IntPtr foreground = NativeMethods.GetForegroundWindow();
            long style = NativeMethods.GetWindowLongPtr(window, NativeMethods.GWL_EXSTYLE).ToInt64();
            string foregroundTitle = NativeMethods.GetWindowTitle(foreground);
            DisplayModeInfo mode = DisplayModeDetector.Detect(scenarioOverride);
            int overlayZ = NativeMethods.GetZIndex(window);
            int foregroundZ = NativeMethods.GetZIndex(foreground);
            bool aboveForeground = overlayZ >= 0 && foregroundZ >= 0 && overlayZ < foregroundZ;
            bool actuallyVisible = NativeMethods.IsWindowVisible(window);

            string detail =
                "action=" + action +
                " scenario=" + mode.Mode +
                " scenarioSource=" + mode.Source +
                " hwnd=" + Hex(window) +
                " visible=" + Bool(actuallyVisible) +
                " bounds=" + RectText(bounds) +
                " dpi=" + currentDpi +
                " topmost=" + Bool((style & NativeMethods.WS_EX_TOPMOST) != 0) +
                " noactivate=" + Bool((style & NativeMethods.WS_EX_NOACTIVATE) != 0) +
                " clickthrough=" + Bool((style & NativeMethods.WS_EX_TRANSPARENT) != 0) +
                " layered=" + Bool((style & NativeMethods.WS_EX_LAYERED) != 0) +
                " mouseCapture=" + Hex(NativeMethods.GetCapture()) +
                " backgroundOpacityPercent=" + backgroundOpacityPercent +
                " foregroundHwnd=" + Hex(foreground) +
                " foregroundTitle=\"" + Escape(foregroundTitle) + "\"" +
                " overlayZ=" + overlayZ +
                " foregroundZ=" + foregroundZ +
                " aboveForeground=" + Bool(aboveForeground) +
                " renderer=" + renderer.Technology +
                " USER_VISIBLE=WAITING_FOR_USER_TEST";
            log.Write("OVERLAY_SNAPSHOT", detail);
            log.WriteStateJson(new DiagnosticState
            {
                Action = action,
                Scenario = mode.Mode,
                ScenarioSource = mode.Source,
                Hwnd = Hex(window),
                Visible = actuallyVisible,
                Bounds = bounds,
                Dpi = currentDpi,
                Topmost = (style & NativeMethods.WS_EX_TOPMOST) != 0,
                NoActivate = (style & NativeMethods.WS_EX_NOACTIVATE) != 0,
                ClickThrough = (style & NativeMethods.WS_EX_TRANSPARENT) != 0,
                Layered = (style & NativeMethods.WS_EX_LAYERED) != 0,
                MouseCapture = Hex(NativeMethods.GetCapture()),
                BackgroundOpacityPercent = backgroundOpacityPercent,
                ForegroundHwnd = Hex(foreground),
                ForegroundTitle = foregroundTitle,
                OverlayZ = overlayZ,
                ForegroundZ = foregroundZ,
                AboveForeground = aboveForeground,
                Renderer = renderer.Technology
            });
        }

        private void RunSelfTest()
        {
            log.Write("SELF_TEST_BEGIN", "USER_VISIBLE=WAITING_FOR_USER_TEST");
            Assert("DPI_AWARE", currentDpi >= 96, "dpi=" + currentDpi);
            Assert("WINDOW_CREATED", window != IntPtr.Zero, "hwnd=" + Hex(window));
            Assert("D3D11_DEVICE", renderer.DeviceReady, renderer.Technology);
            Assert("DIRECTCOMPOSITION", renderer.CompositionReady, renderer.Technology);
            Assert("PRESENT", renderer.PresentCount > 0, "presentCount=" + renderer.PresentCount);
            Assert("HOTKEY_REGISTER_TOGGLE", toggleHotkeyRegistered, "Ctrl+Shift+F9");
            Assert("HOTKEY_REGISTER_EXIT", exitHotkeyRegistered, "Ctrl+Shift+F10");

            long style = NativeMethods.GetWindowLongPtr(window, NativeMethods.GWL_EXSTYLE).ToInt64();
            Assert("TOPMOST_STYLE", (style & NativeMethods.WS_EX_TOPMOST) != 0, "exstyle=0x" + style.ToString("X"));
            Assert("NOACTIVATE_STYLE", (style & NativeMethods.WS_EX_NOACTIVATE) != 0, "exstyle=0x" + style.ToString("X"));
            Assert("CLICK_THROUGH_STYLE", (style & NativeMethods.WS_EX_TRANSPARENT) != 0, "exstyle=0x" + style.ToString("X"));
            Assert("LAYERED_STYLE", (style & NativeMethods.WS_EX_LAYERED) != 0, "exstyle=0x" + style.ToString("X"));
            Assert("NO_MOUSE_CAPTURE", NativeMethods.GetCapture() == IntPtr.Zero, "capture=" + Hex(NativeMethods.GetCapture()));
            IntPtr hit = NativeMethods.SendMessage(window, NativeMethods.WM_NCHITTEST, IntPtr.Zero, IntPtr.Zero);
            Assert("HIT_TEST_TRANSPARENT", hit.ToInt32() == NativeMethods.HTTRANSPARENT, "result=" + hit.ToInt32());
            IntPtr mouseActivate = NativeMethods.SendMessage(window, NativeMethods.WM_MOUSEACTIVATE, IntPtr.Zero, IntPtr.Zero);
            Assert("MOUSE_NO_ACTIVATE", mouseActivate.ToInt32() == NativeMethods.MA_NOACTIVATE, "result=" + mouseActivate.ToInt32());
            NativeMethods.RECT hitBounds;
            NativeMethods.GetWindowRect(window, out hitBounds);
            NativeMethods.POINT hitPoint = new NativeMethods.POINT
            {
                X = hitBounds.Left + (hitBounds.Right - hitBounds.Left) / 2,
                Y = hitBounds.Top + (hitBounds.Bottom - hitBounds.Top) / 2
            };
            IntPtr systemHitTarget = NativeMethods.WindowFromPoint(hitPoint);
            Assert("SYSTEM_POINT_TARGET_BYPASSES_OVERLAY", systemHitTarget != window,
                "point=" + hitPoint.X + "," + hitPoint.Y + " target=" + Hex(systemHitTarget) + " overlay=" + Hex(window));

            HideOverlay("SELF_TEST");
            Assert("HIDE", !NativeMethods.IsWindowVisible(window), "visible=" + Bool(NativeMethods.IsWindowVisible(window)));
            ShowOverlay("SELF_TEST");
            Assert("SHOW", NativeMethods.IsWindowVisible(window), "visible=" + Bool(NativeMethods.IsWindowVisible(window)));

            NativeMethods.SendMessage(window, NativeMethods.WM_HOTKEY, new IntPtr(HotkeyToggle), IntPtr.Zero);
            Assert("HOTKEY_HANDLER_HIDE", !NativeMethods.IsWindowVisible(window), "Ctrl+Shift+F9 handler visible=" + Bool(NativeMethods.IsWindowVisible(window)));
            NativeMethods.SendMessage(window, NativeMethods.WM_HOTKEY, new IntPtr(HotkeyToggle), IntPtr.Zero);
            Assert("HOTKEY_HANDLER_SHOW", NativeMethods.IsWindowVisible(window), "Ctrl+Shift+F9 handler visible=" + Bool(NativeMethods.IsWindowVisible(window)));
            SetBackgroundOpacity(0, "SELF_TEST_ZERO");
            Assert("OPACITY_ZERO", renderer.BackgroundOpacityPercent == 0, "opacity=" + renderer.BackgroundOpacityPercent);
            SetBackgroundOpacity(100, "SELF_TEST_FULL");
            Assert("OPACITY_FULL", renderer.BackgroundOpacityPercent == 100, "opacity=" + renderer.BackgroundOpacityPercent);
            SetBackgroundOpacity(38, "SELF_TEST_DEFAULT");
            if (performance != null) performance.Snapshot("SELF_TEST");
            log.Write("SELF_TEST_END", "result=" + (selfTestFailures == 0 ? "PASS" : "FAIL") + " failures=" + selfTestFailures + " USER_VISIBLE=WAITING_FOR_USER_TEST");
        }

        private void Assert(string name, bool passed, string detail)
        {
            if (!passed) selfTestFailures++;
            log.Write("SELF_TEST", "name=" + name + " result=" + (passed ? "PASS" : "FAIL") + " detail=" + detail);
        }

        public void Dispose()
        {
            if (window != IntPtr.Zero)
            {
                if (toggleHotkeyRegistered) NativeMethods.UnregisterHotKey(window, HotkeyToggle);
                if (exitHotkeyRegistered) NativeMethods.UnregisterHotKey(window, HotkeyExit);
                if (opacityDownHotkeyRegistered) NativeMethods.UnregisterHotKey(window, HotkeyOpacityDown);
                if (opacityUpHotkeyRegistered) NativeMethods.UnregisterHotKey(window, HotkeyOpacityUp);
            }
            if (performance != null) { performance.Snapshot("PROCESS_EXIT"); performance.Dispose(); performance = null; }
            if (renderer != null) { renderer.Dispose(); renderer = null; }
            if (window != IntPtr.Zero) { NativeMethods.DestroyWindow(window); window = IntPtr.Zero; }
            if (instance != IntPtr.Zero) NativeMethods.UnregisterClass(className, instance);
            log.Dispose();
        }

        private static int ScaleDip(int dip, uint dpi) { return (int)Math.Round(dip * dpi / 96.0); }
        private static string Bool(bool value) { return value ? "true" : "false"; }
        private static string Hex(IntPtr value) { return "0x" + unchecked((ulong)value.ToInt64()).ToString("X"); }
        private static string RectText(NativeMethods.RECT rect) { return rect.Left + "," + rect.Top + "," + (rect.Right - rect.Left) + "," + (rect.Bottom - rect.Top); }
        private static string Escape(string value) { return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\""); }
    }

    internal sealed class OverlayRenderer : IDisposable
    {
        private readonly DiagnosticLog log;
        private readonly IntPtr hwnd;
        private D3D11.Device d3dDevice;
        private DXGI.Device dxgiDevice;
        private DXGI.Factory2 dxgiFactory;
        private DXGI.SwapChain1 swapChain;
        private D2D.Factory1 d2dFactory;
        private D2D.Device d2dDevice;
        private D2D.DeviceContext d2dContext;
        private D2D.Bitmap1 targetBitmap;
        private D2D.SolidColorBrush backgroundBrush;
        private D2D.SolidColorBrush borderBrush;
        private D2D.SolidColorBrush titleBrush;
        private D2D.SolidColorBrush detailBrush;
        private Factory directWriteFactory;
        private TextFormat titleFormat;
        private TextFormat labelFormat;
        private DComp.Device compositionDevice;
        private DComp.Target compositionTarget;
        private DComp.Visual compositionVisual;
        private int width;
        private int height;
        private uint dpi;
        private int backgroundOpacityPercent;

        public bool DeviceReady { get; private set; }
        public bool CompositionReady { get; private set; }
        public int PresentCount { get; private set; }
        public int RenderCount { get; private set; }
        public int BackgroundOpacityPercent { get { return backgroundOpacityPercent; } }
        public string Technology { get { return "Win32+D3D11+DXGI_FLIP_SEQUENTIAL+Direct2D+DirectWrite+DirectComposition"; } }

        public OverlayRenderer(DiagnosticLog diagnosticLog, IntPtr window, int pixelWidth, int pixelHeight, uint windowDpi, int opacityPercent)
        {
            log = diagnosticLog;
            hwnd = window;
            width = pixelWidth;
            height = pixelHeight;
            dpi = windowDpi;
            backgroundOpacityPercent = Math.Max(0, Math.Min(100, opacityPercent));
            Initialize();
        }

        private void Initialize()
        {
            d3dDevice = new D3D11.Device(DriverType.Hardware, D3D11.DeviceCreationFlags.BgraSupport);
            dxgiDevice = d3dDevice.QueryInterface<DXGI.Device>();
            dxgiFactory = dxgiDevice.Adapter.GetParent<DXGI.Factory2>();
            DeviceReady = true;

            DXGI.SwapChainDescription1 description = new DXGI.SwapChainDescription1();
            description.Width = width;
            description.Height = height;
            description.Format = DXGI.Format.B8G8R8A8_UNorm;
            description.Stereo = false;
            description.SampleDescription = new DXGI.SampleDescription(1, 0);
            description.Usage = DXGI.Usage.RenderTargetOutput;
            description.BufferCount = 2;
            description.Scaling = DXGI.Scaling.Stretch;
            description.SwapEffect = DXGI.SwapEffect.FlipSequential;
            description.AlphaMode = DXGI.AlphaMode.Premultiplied;
            description.Flags = DXGI.SwapChainFlags.None;
            swapChain = new DXGI.SwapChain1(dxgiFactory, d3dDevice, ref description, null);

            d2dFactory = new D2D.Factory1(D2D.FactoryType.SingleThreaded);
            d2dDevice = new D2D.Device(d2dFactory, dxgiDevice);
            d2dContext = new D2D.DeviceContext(d2dDevice, D2D.DeviceContextOptions.None);
            CreateTargetBitmap();

            directWriteFactory = new Factory(FactoryType.Shared);
            titleFormat = new TextFormat(directWriteFactory, "Segoe UI", FontWeight.Bold, FontStyle.Normal, FontStretch.Normal, 24.0f);
            labelFormat = new TextFormat(directWriteFactory, "Consolas", FontWeight.Normal, FontStyle.Normal, FontStretch.Normal, 11.0f);
            CreateBackgroundBrush();
            borderBrush = new D2D.SolidColorBrush(d2dContext, new RawColor4(0.82f, 1.0f, 0.22f, 1.0f));
            titleBrush = new D2D.SolidColorBrush(d2dContext, new RawColor4(0.96f, 0.98f, 0.96f, 1.0f));
            detailBrush = new D2D.SolidColorBrush(d2dContext, new RawColor4(0.63f, 0.69f, 0.71f, 1.0f));

            compositionDevice = new DComp.Device(dxgiDevice);
            compositionTarget = DComp.Target.FromHwnd(compositionDevice, hwnd, true);
            compositionVisual = new DComp.Visual(compositionDevice);
            compositionVisual.Content = swapChain;
            compositionTarget.Root = compositionVisual;
            compositionDevice.Commit();
            CompositionReady = true;
            log.Write("RENDERER_INITIALIZED", "technology=" + Technology + " size=" + width + "x" + height + " dpi=" + dpi +
                " alphaMode=PREMULTIPLIED clearAlpha=0 backgroundOpacityPercent=" + backgroundOpacityPercent + " renderPolicy=EVENT_DRIVEN");
        }

        private void CreateBackgroundBrush()
        {
            if (backgroundBrush != null) { backgroundBrush.Dispose(); backgroundBrush = null; }
            float alpha = backgroundOpacityPercent / 100.0f;
            backgroundBrush = new D2D.SolidColorBrush(d2dContext, new RawColor4(0.025f, 0.04f, 0.055f, alpha));
        }

        public void SetBackgroundOpacity(int opacityPercent)
        {
            backgroundOpacityPercent = Math.Max(0, Math.Min(100, opacityPercent));
            CreateBackgroundBrush();
        }

        private void CreateTargetBitmap()
        {
            if (targetBitmap != null) { d2dContext.Target = null; targetBitmap.Dispose(); targetBitmap = null; }
            using (DXGI.Surface surface = swapChain.GetBackBuffer<DXGI.Surface>(0))
            {
                D2D.PixelFormat pixelFormat = new D2D.PixelFormat(DXGI.Format.B8G8R8A8_UNorm, D2D.AlphaMode.Premultiplied);
                D2D.BitmapProperties1 properties = new D2D.BitmapProperties1(pixelFormat, dpi, dpi, D2D.BitmapOptions.Target | D2D.BitmapOptions.CannotDraw);
                targetBitmap = new D2D.Bitmap1(d2dContext, surface, properties);
            }
            d2dContext.Target = targetBitmap;
            d2dContext.TextAntialiasMode = D2D.TextAntialiasMode.Grayscale;
        }

        public void Render()
        {
            RenderCount++;
            float dipWidth = width * 96.0f / dpi;
            float dipHeight = height * 96.0f / dpi;
            RawRectangleF full = new RawRectangleF(1, 1, dipWidth - 1, dipHeight - 1);
            d2dContext.BeginDraw();
            d2dContext.Clear(new RawColor4(0, 0, 0, 0));
            d2dContext.FillRectangle(full, backgroundBrush);
            d2dContext.DrawRectangle(full, borderBrush, 1.5f);
            d2dContext.DrawText("NATIVE OVERLAY POC", labelFormat, new RawRectangleF(18, 12, dipWidth - 18, 35), borderBrush);
            d2dContext.DrawText("DOTA SCOUT NATIVE TEST", titleFormat, new RawRectangleF(18, 38, dipWidth - 18, 78), titleBrush);
            d2dContext.DrawText("D3D11 · DIRECTCOMPOSITION · INPUT PASSTHROUGH", labelFormat,
                new RawRectangleF(18, 89, dipWidth - 18, 112), detailBrush);
            d2dContext.DrawText("F9 SHOW/HIDE · F10 EXIT · F11/F12 OPACITY " + backgroundOpacityPercent + "%", labelFormat,
                new RawRectangleF(18, 115, dipWidth - 18, dipHeight - 8), detailBrush);
            d2dContext.EndDraw();
            swapChain.Present(1, DXGI.PresentFlags.None);
            PresentCount++;
        }

        public void Commit()
        {
            compositionDevice.Commit();
        }

        public void Resize(int pixelWidth, int pixelHeight, uint newDpi)
        {
            if (pixelWidth <= 0 || pixelHeight <= 0) return;
            width = pixelWidth;
            height = pixelHeight;
            dpi = newDpi;
            d2dContext.Target = null;
            if (targetBitmap != null) { targetBitmap.Dispose(); targetBitmap = null; }
            swapChain.ResizeBuffers(2, width, height, DXGI.Format.B8G8R8A8_UNorm, DXGI.SwapChainFlags.None);
            CreateTargetBitmap();
            Render();
            compositionDevice.Commit();
            log.Write("RENDERER_RESIZED", "size=" + width + "x" + height + " dpi=" + dpi);
        }

        public void Dispose()
        {
            if (compositionVisual != null) compositionVisual.Dispose();
            if (compositionTarget != null) compositionTarget.Dispose();
            if (compositionDevice != null) compositionDevice.Dispose();
            if (labelFormat != null) labelFormat.Dispose();
            if (titleFormat != null) titleFormat.Dispose();
            if (directWriteFactory != null) directWriteFactory.Dispose();
            if (detailBrush != null) detailBrush.Dispose();
            if (titleBrush != null) titleBrush.Dispose();
            if (borderBrush != null) borderBrush.Dispose();
            if (backgroundBrush != null) backgroundBrush.Dispose();
            if (targetBitmap != null) targetBitmap.Dispose();
            if (d2dContext != null) d2dContext.Dispose();
            if (d2dDevice != null) d2dDevice.Dispose();
            if (d2dFactory != null) d2dFactory.Dispose();
            if (swapChain != null) swapChain.Dispose();
            if (dxgiFactory != null) dxgiFactory.Dispose();
            if (dxgiDevice != null) dxgiDevice.Dispose();
            if (d3dDevice != null) d3dDevice.Dispose();
        }
    }

    internal sealed class PerformanceDiagnostics : IDisposable
    {
        private readonly DiagnosticLog log;
        private readonly OverlayRenderer renderer;
        private readonly Process process;
        private readonly object sampleGate = new object();
        private readonly System.Collections.Generic.List<PerformanceCounter> gpuCounters =
            new System.Collections.Generic.List<PerformanceCounter>();
        private Timer timer;
        private DateTime lastSampleUtc;
        private TimeSpan lastCpuTime;
        private long messageCount;
        private long mouseMoveCount;
        private long setWindowPosCount;
        private long lastMessageCount;
        private long lastMouseMoveCount;
        private long lastSetWindowPosCount;
        private int lastRenderCount;
        private int lastPresentCount;
        private int sampling;
        private bool gpuAvailable;

        public PerformanceDiagnostics(DiagnosticLog diagnosticLog, OverlayRenderer overlayRenderer)
        {
            log = diagnosticLog;
            renderer = overlayRenderer;
            process = Process.GetCurrentProcess();
        }

        public void Start()
        {
            process.Refresh();
            lastSampleUtc = DateTime.UtcNow;
            lastCpuTime = process.TotalProcessorTime;
            lastRenderCount = renderer.RenderCount;
            lastPresentCount = renderer.PresentCount;
            InitializeGpuCounters();
            timer = new Timer(SampleTimer, null, 5000, 5000);
            log.Write("PERF_POLICY",
                "renderLoop=NONE eventDriven=true periodicSampleSeconds=5" +
                " renderOnMouseMove=false setWindowPosOnMouseMove=false presentOnMouseMove=false" +
                " gpuCounter=" + (gpuAvailable ? "GPU_ENGINE" : "UNAVAILABLE"));
        }

        public void CountMessage(uint message)
        {
            Interlocked.Increment(ref messageCount);
            if (message == NativeMethods.WM_MOUSEMOVE ||
                message == NativeMethods.WM_NCMOUSEMOVE ||
                message == NativeMethods.WM_POINTERUPDATE)
                Interlocked.Increment(ref mouseMoveCount);
        }

        public void CountSetWindowPos()
        {
            Interlocked.Increment(ref setWindowPosCount);
        }

        private void SampleTimer(object state)
        {
            if (Interlocked.Exchange(ref sampling, 1) != 0) return;
            try { Snapshot("PERIODIC"); }
            catch (Exception error) { log.Write("PERF_SAMPLE_FAILED", "error=" + error.Message); }
            finally { Interlocked.Exchange(ref sampling, 0); }
        }

        public void Snapshot(string reason)
        {
            lock (sampleGate)
            {
                DateTime now = DateTime.UtcNow;
                process.Refresh();
                TimeSpan cpuNow = process.TotalProcessorTime;
                double seconds = Math.Max(0.001, (now - lastSampleUtc).TotalSeconds);
                double cpuPercent = Math.Max(0,
                    (cpuNow - lastCpuTime).TotalSeconds / (seconds * Math.Max(1, Environment.ProcessorCount)) * 100.0);

                long messages = Interlocked.Read(ref messageCount);
                long mouseMoves = Interlocked.Read(ref mouseMoveCount);
                long setPositions = Interlocked.Read(ref setWindowPosCount);
                int renders = renderer.RenderCount;
                int presents = renderer.PresentCount;
                double? gpuPercent = ReadGpuUsage();

                log.Write("PERF_SNAPSHOT",
                    "reason=" + reason +
                    " intervalSeconds=" + seconds.ToString("0.000", CultureInfo.InvariantCulture) +
                    " cpuPercent=" + cpuPercent.ToString("0.00", CultureInfo.InvariantCulture) +
                    " gpuPercent=" + (gpuPercent.HasValue ? gpuPercent.Value.ToString("0.00", CultureInfo.InvariantCulture) : "UNAVAILABLE") +
                    " messagePerSecond=" + ((messages - lastMessageCount) / seconds).ToString("0.00", CultureInfo.InvariantCulture) +
                    " mouseMovePerSecond=" + ((mouseMoves - lastMouseMoveCount) / seconds).ToString("0.00", CultureInfo.InvariantCulture) +
                    " renderPerSecond=" + ((renders - lastRenderCount) / seconds).ToString("0.00", CultureInfo.InvariantCulture) +
                    " presentPerSecond=" + ((presents - lastPresentCount) / seconds).ToString("0.00", CultureInfo.InvariantCulture) +
                    " setWindowPosPerSecond=" + ((setPositions - lastSetWindowPosCount) / seconds).ToString("0.00", CultureInfo.InvariantCulture) +
                    " totals=messages:" + messages + ",mouseMoves:" + mouseMoves + ",renders:" + renders + ",presents:" + presents + ",setWindowPos:" + setPositions);

                lastSampleUtc = now;
                lastCpuTime = cpuNow;
                lastMessageCount = messages;
                lastMouseMoveCount = mouseMoves;
                lastSetWindowPosCount = setPositions;
                lastRenderCount = renders;
                lastPresentCount = presents;
            }
        }

        private void InitializeGpuCounters()
        {
            try
            {
                PerformanceCounterCategory category = new PerformanceCounterCategory("GPU Engine");
                string processToken = "pid_" + process.Id.ToString(CultureInfo.InvariantCulture) + "_";
                foreach (string instance in category.GetInstanceNames())
                {
                    if (instance.IndexOf(processToken, StringComparison.OrdinalIgnoreCase) < 0) continue;
                    PerformanceCounter counter = new PerformanceCounter("GPU Engine", "Utilization Percentage", instance, true);
                    counter.NextValue();
                    gpuCounters.Add(counter);
                }
                gpuAvailable = gpuCounters.Count > 0;
            }
            catch (Exception error)
            {
                gpuAvailable = false;
                log.Write("GPU_COUNTER_UNAVAILABLE", "reason=" + error.Message);
            }
        }

        private double? ReadGpuUsage()
        {
            if (!gpuAvailable) return null;
            double sum = 0;
            bool sampled = false;
            foreach (PerformanceCounter counter in gpuCounters)
            {
                try { sum += Math.Max(0, counter.NextValue()); sampled = true; }
                catch { }
            }
            return sampled ? (double?)sum : null;
        }

        public void Dispose()
        {
            if (timer != null) { timer.Dispose(); timer = null; }
            foreach (PerformanceCounter counter in gpuCounters) counter.Dispose();
            gpuCounters.Clear();
            process.Dispose();
        }
    }

    internal sealed class DiagnosticLog : IDisposable
    {
        private readonly object gate = new object();
        private readonly StreamWriter writer;
        private readonly string statePath;
        public string LogPath { get; private set; }

        public DiagnosticLog()
        {
            string root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string logs = Path.Combine(root, "logs");
            Directory.CreateDirectory(logs);
            string stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);
            LogPath = Path.Combine(logs, "native-overlay-" + stamp + ".log");
            statePath = Path.Combine(logs, "native-overlay-latest.json");
            writer = new StreamWriter(LogPath, false, new UTF8Encoding(false));
            writer.AutoFlush = true;
            Write("PROCESS_START", "pid=" + Process.GetCurrentProcess().Id + " electronRendering=false gameInjection=false gameHook=false gameProcessRead=false");
        }

        public void Write(string eventName, string detail)
        {
            lock (gate)
            {
                writer.WriteLine("[" + DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture) + "] " + eventName + " " + detail);
            }
        }

        public void WriteStateJson(DiagnosticState state)
        {
            string json = "{\n" +
                "  \"updatedAt\": \"" + DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture) + "\",\n" +
                "  \"action\": \"" + Json(state.Action) + "\",\n" +
                "  \"scenario\": \"" + Json(state.Scenario) + "\",\n" +
                "  \"scenarioSource\": \"" + Json(state.ScenarioSource) + "\",\n" +
                "  \"renderer\": \"" + Json(state.Renderer) + "\",\n" +
                "  \"electronParticipatesInOverlayRendering\": false,\n" +
                "  \"gameInjection\": false,\n" +
                "  \"gameHook\": false,\n" +
                "  \"gameProcessRead\": false,\n" +
                "  \"hwnd\": \"" + Json(state.Hwnd) + "\",\n" +
                "  \"visible\": " + Lower(state.Visible) + ",\n" +
                "  \"bounds\": { \"x\": " + state.Bounds.Left + ", \"y\": " + state.Bounds.Top + ", \"width\": " + (state.Bounds.Right - state.Bounds.Left) + ", \"height\": " + (state.Bounds.Bottom - state.Bounds.Top) + " },\n" +
                "  \"dpi\": " + state.Dpi + ",\n" +
                "  \"topmost\": " + Lower(state.Topmost) + ",\n" +
                "  \"noActivate\": " + Lower(state.NoActivate) + ",\n" +
                "  \"clickThroughStyle\": " + Lower(state.ClickThrough) + ",\n" +
                "  \"layeredStyle\": " + Lower(state.Layered) + ",\n" +
                "  \"mouseCapture\": \"" + Json(state.MouseCapture) + "\",\n" +
                "  \"backgroundOpacityPercent\": " + state.BackgroundOpacityPercent + ",\n" +
                "  \"clickThroughUserVerified\": \"WAITING_FOR_USER_TEST\",\n" +
                "  \"foregroundHwnd\": \"" + Json(state.ForegroundHwnd) + "\",\n" +
                "  \"foregroundTitle\": \"" + Json(state.ForegroundTitle) + "\",\n" +
                "  \"overlayZIndex\": " + state.OverlayZ + ",\n" +
                "  \"foregroundZIndex\": " + state.ForegroundZ + ",\n" +
                "  \"aboveForeground\": " + Lower(state.AboveForeground) + ",\n" +
                "  \"userVisible\": \"WAITING_FOR_USER_TEST\",\n" +
                "  \"windowed\": \"WAITING_FOR_USER_TEST\",\n" +
                "  \"borderless\": \"WAITING_FOR_USER_TEST\",\n" +
                "  \"exclusiveFullscreen\": \"WAITING_FOR_USER_TEST\"\n" +
                "}\n";
            File.WriteAllText(statePath, json, new UTF8Encoding(false));
        }

        public void Dispose()
        {
            if (writer != null) writer.Dispose();
        }

        private static string Json(string value) { return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n"); }
        private static string Lower(bool value) { return value ? "true" : "false"; }
    }

    internal sealed class DiagnosticState
    {
        public string Action;
        public string Scenario;
        public string ScenarioSource;
        public string Renderer;
        public string Hwnd;
        public bool Visible;
        public NativeMethods.RECT Bounds;
        public uint Dpi;
        public bool Topmost;
        public bool NoActivate;
        public bool ClickThrough;
        public bool Layered;
        public string MouseCapture;
        public int BackgroundOpacityPercent;
        public string ForegroundHwnd;
        public string ForegroundTitle;
        public int OverlayZ;
        public int ForegroundZ;
        public bool AboveForeground;
    }

    internal sealed class DisplayModeInfo
    {
        public string Mode;
        public string Source;
    }

    internal static class DisplayModeDetector
    {
        public static DisplayModeInfo Detect(string scenarioOverride)
        {
            if (!String.IsNullOrWhiteSpace(scenarioOverride))
                return new DisplayModeInfo { Mode = Normalize(scenarioOverride), Source = "command-line" };

            foreach (string path in CandidateConfigPaths())
            {
                try
                {
                    if (!File.Exists(path)) continue;
                    string text = File.ReadAllText(path);
                    string fullscreen = Capture(text, "setting\\.fullscreen");
                    string borderless = Capture(text, "setting\\.nowindowborder");
                    if (fullscreen == "1") return new DisplayModeInfo { Mode = "Exclusive Fullscreen", Source = path };
                    if (fullscreen == "0" && borderless == "1") return new DisplayModeInfo { Mode = "Borderless", Source = path };
                    if (fullscreen == "0" && borderless == "0") return new DisplayModeInfo { Mode = "Windowed", Source = path };
                }
                catch { }
            }
            return new DisplayModeInfo { Mode = "Unknown", Source = "no-dota-config-found" };
        }

        private static string Capture(string text, string key)
        {
            Match match = Regex.Match(text, "\"" + key + "\"\\s+\"([01])\"", RegexOptions.IgnoreCase);
            return match.Success ? match.Groups[1].Value : null;
        }

        private static string Normalize(string value)
        {
            if (value.Equals("windowed", StringComparison.OrdinalIgnoreCase)) return "Windowed";
            if (value.Equals("borderless", StringComparison.OrdinalIgnoreCase)) return "Borderless";
            if (value.Equals("exclusive", StringComparison.OrdinalIgnoreCase) || value.Equals("exclusiveFullscreen", StringComparison.OrdinalIgnoreCase)) return "Exclusive Fullscreen";
            return "Unknown";
        }

        private static string[] CandidateConfigPaths()
        {
            System.Collections.Generic.List<string> result = new System.Collections.Generic.List<string>();
            string[] roots = new string[]
            {
                @"C:\steam\userdata",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Steam", "userdata")
            };
            foreach (string root in roots)
            {
                try
                {
                    if (!Directory.Exists(root)) continue;
                    foreach (string account in Directory.GetDirectories(root))
                        result.Add(Path.Combine(account, "570", "local", "cfg", "video.txt"));
                }
                catch { }
            }
            return result.ToArray();
        }
    }

    internal static class NativeMethods
    {
        public const uint WS_POPUP = 0x80000000;
        public const uint WS_EX_TOPMOST = 0x00000008;
        public const uint WS_EX_TRANSPARENT = 0x00000020;
        public const uint WS_EX_LAYERED = 0x00080000;
        public const uint WS_EX_TOOLWINDOW = 0x00000080;
        public const uint WS_EX_NOACTIVATE = 0x08000000;
        public const uint WS_EX_NOREDIRECTIONBITMAP = 0x00200000;
        public const int GWL_EXSTYLE = -20;
        public const int SW_HIDE = 0;
        public const int SW_SHOWNOACTIVATE = 4;
        public const uint SWP_NOSIZE = 0x0001;
        public const uint SWP_NOMOVE = 0x0002;
        public const uint SWP_NOACTIVATE = 0x0010;
        public const uint SWP_SHOWWINDOW = 0x0040;
        public const uint WM_DESTROY = 0x0002;
        public const uint WM_MOUSEACTIVATE = 0x0021;
        public const uint WM_SETCURSOR = 0x0020;
        public const uint WM_ERASEBKGND = 0x0014;
        public const uint WM_NCHITTEST = 0x0084;
        public const uint WM_HOTKEY = 0x0312;
        public const uint WM_DPICHANGED = 0x02E0;
        public const uint WM_MOUSEMOVE = 0x0200;
        public const uint WM_NCMOUSEMOVE = 0x00A0;
        public const uint WM_POINTERUPDATE = 0x0245;
        public const int HTTRANSPARENT = -1;
        public const int MA_NOACTIVATE = 3;
        private const uint GW_HWNDNEXT = 2;

        [UnmanagedFunctionPointer(CallingConvention.Winapi)]
        public delegate IntPtr WindowProcedure(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct WNDCLASSEX
        {
            public uint cbSize;
            public uint style;
            public WindowProcedure lpfnWndProc;
            public int cbClsExtra;
            public int cbWndExtra;
            public IntPtr hInstance;
            public IntPtr hIcon;
            public IntPtr hCursor;
            public IntPtr hbrBackground;
            public string lpszMenuName;
            public string lpszClassName;
            public IntPtr hIconSm;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT { public int X; public int Y; }

        [StructLayout(LayoutKind.Sequential)]
        public struct MSG
        {
            public IntPtr hwnd;
            public uint message;
            public IntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public POINT point;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct MONITORINFOEX
        {
            public int cbSize;
            public RECT rcMonitor;
            public RECT rcWork;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
            public string szDevice;
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern ushort RegisterClassEx(ref WNDCLASSEX windowClass);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool UnregisterClass(string className, IntPtr instance);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr CreateWindowEx(uint extendedStyle, string className, string windowName, uint style,
            int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr parameter);
        [DllImport("user32.dll")]
        public static extern IntPtr DefWindowProc(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")]
        public static extern bool DestroyWindow(IntPtr hwnd);
        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hwnd, int command);
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll")]
        public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
        [DllImport("user32.dll")]
        public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFOEX info);
        [DllImport("shcore.dll")]
        private static extern int GetDpiForMonitor(IntPtr monitor, int dpiType, out uint dpiX, out uint dpiY);
        [DllImport("user32.dll")]
        public static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")]
        public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool RegisterHotKey(IntPtr hwnd, int id, uint modifiers, uint virtualKey);
        [DllImport("user32.dll")]
        public static extern bool UnregisterHotKey(IntPtr hwnd, int id);
        [DllImport("user32.dll")]
        public static extern int GetMessage(out MSG message, IntPtr hwnd, uint minFilter, uint maxFilter);
        [DllImport("user32.dll")]
        public static extern bool TranslateMessage(ref MSG message);
        [DllImport("user32.dll")]
        public static extern IntPtr DispatchMessage(ref MSG message);
        [DllImport("user32.dll")]
        public static extern void PostQuitMessage(int exitCode);
        [DllImport("user32.dll")]
        public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")]
        public static extern IntPtr GetCapture();
        [DllImport("user32.dll")]
        public static extern IntPtr WindowFromPoint(POINT point);
        [DllImport("user32.dll")]
        private static extern IntPtr GetTopWindow(IntPtr hwnd);
        [DllImport("user32.dll")]
        private static extern IntPtr GetWindow(IntPtr hwnd, uint command);
        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
        private static extern IntPtr GetWindowLongPtr64(IntPtr hwnd, int index);
        [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
        private static extern IntPtr GetWindowLongPtr32(IntPtr hwnd, int index);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        public static extern IntPtr GetModuleHandle(string moduleName);
        [DllImport("user32.dll")]
        public static extern IntPtr LoadCursor(IntPtr instance, IntPtr cursorName);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int MessageBox(IntPtr hwnd, string text, string caption, uint type);

        public static IntPtr GetWindowLongPtr(IntPtr hwnd, int index)
        {
            return IntPtr.Size == 8 ? GetWindowLongPtr64(hwnd, index) : GetWindowLongPtr32(hwnd, index);
        }

        public static uint GetMonitorDpi(IntPtr monitor)
        {
            uint x, y;
            try { if (GetDpiForMonitor(monitor, 0, out x, out y) == 0 && x >= 96) return x; }
            catch (DllNotFoundException) { }
            catch (EntryPointNotFoundException) { }
            return 96;
        }

        public static RECT GetMonitorRectangle(IntPtr monitor, bool workArea)
        {
            MONITORINFOEX info = new MONITORINFOEX();
            info.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
            if (!GetMonitorInfo(monitor, ref info)) throw new InvalidOperationException("GetMonitorInfo failed");
            return workArea ? info.rcWork : info.rcMonitor;
        }

        public static string GetWindowTitle(IntPtr hwnd)
        {
            StringBuilder text = new StringBuilder(512);
            GetWindowText(hwnd, text, text.Capacity);
            return text.ToString();
        }

        public static int GetZIndex(IntPtr target)
        {
            int index = 0;
            IntPtr current = GetTopWindow(IntPtr.Zero);
            while (current != IntPtr.Zero && index < 5000)
            {
                if (current == target) return index;
                current = GetWindow(current, GW_HWNDNEXT);
                index++;
            }
            return -1;
        }
    }
}

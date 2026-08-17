using System;
using System.Runtime.InteropServices;

internal static class Program
{
    private const int GWL_EXSTYLE = -20;
    private const long WS_EX_TOPMOST = 0x00000008L;
    private const long WS_EX_TRANSPARENT = 0x00000020L;
    private const long WS_EX_TOOLWINDOW = 0x00000080L;
    private const long WS_EX_LAYERED = 0x00080000L;
    private const long WS_EX_NOACTIVATE = 0x08000000L;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const uint GW_HWNDNEXT = 2;
    private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    private static extern IntPtr GetTopWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern IntPtr GetWindow(IntPtr hWnd, uint command);
    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern IntPtr GetWindowLongPtr32(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int index, IntPtr value);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr32(IntPtr hWnd, int index, IntPtr value);

    private static IntPtr GetWindowLongPtr(IntPtr hWnd, int index)
    {
        return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, index) : GetWindowLongPtr32(hWnd, index);
    }

    private static IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value)
    {
        return IntPtr.Size == 8 ? SetWindowLongPtr64(hWnd, index, value) : SetWindowLongPtr32(hWnd, index, value);
    }

    private static IntPtr ParseHandle(string value)
    {
        ulong raw;
        if (!UInt64.TryParse(value, out raw)) throw new ArgumentException("Invalid HWND");
        return new IntPtr(unchecked((long)raw));
    }

    private static int ZIndexOf(IntPtr target)
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

    private static string Bool(bool value) { return value ? "true" : "false"; }
    private static string Hex(IntPtr value) { return "0x" + unchecked((ulong)value.ToInt64()).ToString("X"); }

    private static string Inspect(IntPtr overlay, IntPtr dota, bool setWindowPosResult, int lastError)
    {
        RECT rect;
        GetWindowRect(overlay, out rect);
        long style = GetWindowLongPtr(overlay, GWL_EXSTYLE).ToInt64();
        int overlayIndex = ZIndexOf(overlay);
        int dotaIndex = dota == IntPtr.Zero ? -1 : ZIndexOf(dota);
        bool aboveDota = dota == IntPtr.Zero || (overlayIndex >= 0 && dotaIndex >= 0 && overlayIndex < dotaIndex);
        return "{" +
            "\"ok\":" + Bool(IsWindow(overlay)) + "," +
            "\"setWindowPos\":" + Bool(setWindowPosResult) + "," +
            "\"lastError\":" + lastError + "," +
            "\"hwnd\":\"" + Hex(overlay) + "\"," +
            "\"foregroundHwnd\":\"" + Hex(GetForegroundWindow()) + "\"," +
            "\"visible\":" + Bool(IsWindowVisible(overlay)) + "," +
            "\"topmostStyle\":" + Bool((style & WS_EX_TOPMOST) != 0) + "," +
            "\"noActivateStyle\":" + Bool((style & WS_EX_NOACTIVATE) != 0) + "," +
            "\"transparentStyle\":" + Bool((style & WS_EX_TRANSPARENT) != 0) + "," +
            "\"layeredStyle\":" + Bool((style & WS_EX_LAYERED) != 0) + "," +
            "\"toolWindowStyle\":" + Bool((style & WS_EX_TOOLWINDOW) != 0) + "," +
            "\"overlayZIndex\":" + overlayIndex + "," +
            "\"dotaZIndex\":" + dotaIndex + "," +
            "\"aboveDota\":" + Bool(aboveDota) + "," +
            "\"bounds\":{\"x\":" + rect.Left + ",\"y\":" + rect.Top + ",\"width\":" + (rect.Right - rect.Left) + ",\"height\":" + (rect.Bottom - rect.Top) + "}" +
            "}";
    }

    public static int Main(string[] args)
    {
        try
        {
            if (args.Length < 2) throw new ArgumentException("Usage: enforce|inspect OVERLAY_HWND [DOTA_HWND]");
            IntPtr overlay = ParseHandle(args[1]);
            IntPtr dota = args.Length >= 3 ? ParseHandle(args[2]) : IntPtr.Zero;
            bool positioned = true;
            int lastError = 0;
            if (String.Equals(args[0], "enforce", StringComparison.OrdinalIgnoreCase))
            {
                long style = GetWindowLongPtr(overlay, GWL_EXSTYLE).ToInt64();
                style |= WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT | WS_EX_LAYERED;
                SetWindowLongPtr(overlay, GWL_EXSTYLE, new IntPtr(style));
                ShowWindow(overlay, 4); // SW_SHOWNOACTIVATE
                positioned = SetWindowPos(overlay, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
                if (!positioned) lastError = Marshal.GetLastWin32Error();
            }
            Console.WriteLine(Inspect(overlay, dota, positioned, lastError));
            return positioned ? 0 : 2;
        }
        catch (Exception error)
        {
            Console.WriteLine("{\"ok\":false,\"error\":\"" + error.Message.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}");
            return 1;
        }
    }
}

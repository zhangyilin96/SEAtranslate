using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

internal static class PublicWindowInspector
{
    private const int GwlStyle = -16;
    private const int GwlExStyle = -20;
    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr parameter);

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr64(IntPtr hwnd, int index);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] private static extern IntPtr GetWindowLongPtr32(IntPtr hwnd, int index);

    private static IntPtr GetWindowLongPtr(IntPtr hwnd, int index)
    {
        return IntPtr.Size == 8 ? GetWindowLongPtr64(hwnd, index) : GetWindowLongPtr32(hwnd, index);
    }

    public static int Main(string[] args)
    {
        HashSet<uint> targets = new HashSet<uint>();
        foreach (Process process in Process.GetProcessesByName("HeyboxChat")) targets.Add((uint)process.Id);
        EnumWindows(delegate(IntPtr hwnd, IntPtr ignored)
        {
            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            if (!targets.Contains(pid)) return true;
            StringBuilder title = new StringBuilder(512);
            StringBuilder className = new StringBuilder(256);
            Rect rect;
            GetWindowText(hwnd, title, title.Capacity);
            GetClassName(hwnd, className, className.Capacity);
            GetWindowRect(hwnd, out rect);
            long style = GetWindowLongPtr(hwnd, GwlStyle).ToInt64();
            long exStyle = GetWindowLongPtr(hwnd, GwlExStyle).ToInt64();
            Console.WriteLine("pid={0} hwnd=0x{1:X} visible={2} class=\"{3}\" title=\"{4}\" bounds={5},{6},{7},{8} style=0x{9:X} exstyle=0x{10:X}",
                pid, hwnd.ToInt64(), IsWindowVisible(hwnd), className, title,
                rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top, style, exStyle);
            return true;
        }, IntPtr.Zero);
        return 0;
    }
}

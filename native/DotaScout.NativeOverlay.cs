using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

internal sealed class NativeOverlayForm : Form
{
    private const int WS_EX_TRANSPARENT = 0x20;
    private const int WS_EX_TOOLWINDOW = 0x80;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    private readonly string statusPath;
    private readonly Timer topmostTimer;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);

    public NativeOverlayForm(string statusPath)
    {
        this.statusPath = statusPath;
        Text = "Dota Scout Native Overlay Test";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        Size = new Size(320, 120);
        BackColor = Color.FromArgb(8, 12, 16);
        Opacity = 0.92;
        DoubleBuffered = true;
        var area = Screen.PrimaryScreen.WorkingArea;
        Location = new Point(area.Right - Width - 18, area.Top + 18);
        topmostTimer = new Timer { Interval = 500 };
        topmostTimer.Tick += delegate { EnforceTopmost(); };
        Shown += delegate { EnforceTopmost(); topmostTimer.Start(); WriteStatus(true); };
        FormClosed += delegate { topmostTimer.Stop(); WriteStatus(false); };
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
            return cp;
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.Clear(Color.FromArgb(8, 12, 16));
        using (var border = new Pen(Color.FromArgb(216, 255, 70), 2f)) e.Graphics.DrawRectangle(border, 1, 1, Width - 3, Height - 3);
        using (var label = new Font("Consolas", 9f, FontStyle.Bold))
        using (var title = new Font("Segoe UI", 20f, FontStyle.Bold))
        using (var lime = new SolidBrush(Color.FromArgb(216, 255, 70)))
        using (var white = new SolidBrush(Color.White))
        using (var muted = new SolidBrush(Color.FromArgb(155, 165, 170)))
        {
            e.Graphics.DrawString("NATIVE OVERLAY POC", label, lime, 16, 13);
            e.Graphics.DrawString("DOTA SCOUT TEST", title, white, 14, 35);
            e.Graphics.DrawString("TOPMOST · NOACTIVATE · CLICK-THROUGH", label, muted, 16, 81);
        }
    }

    private void EnforceTopmost()
    {
        SetWindowPos(Handle, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }

    private void WriteStatus(bool running)
    {
        try
        {
            if (String.IsNullOrWhiteSpace(statusPath)) return;
            Directory.CreateDirectory(Path.GetDirectoryName(statusPath));
            string json = "{" +
                "\"running\":" + (running ? "true" : "false") + "," +
                "\"hwnd\":\"0x" + unchecked((ulong)Handle.ToInt64()).ToString("X") + "\"," +
                "\"visible\":" + (Visible ? "true" : "false") + "," +
                "\"bounds\":{\"x\":" + Left + ",\"y\":" + Top + ",\"width\":" + Width + ",\"height\":" + Height + "}," +
                "\"updatedAt\":\"" + DateTime.UtcNow.ToString("o") + "\"" +
                "}";
            File.WriteAllText(statusPath, json);
        }
        catch { }
    }
}

internal static class NativeOverlayProgram
{
    [STAThread]
    public static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new NativeOverlayForm(args.Length > 0 ? args[0] : String.Empty));
    }
}

using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

internal static class Program
{
    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    private static int Positive(string value, string name)
    {
        int parsed;
        if (!Int32.TryParse(value, out parsed) || parsed <= 0) throw new ArgumentException(name + " must be positive");
        return parsed;
    }

    private static void WritePng(Bitmap bitmap)
    {
        using (MemoryStream memory = new MemoryStream())
        {
            bitmap.Save(memory, ImageFormat.Png);
            byte[] bytes = memory.ToArray();
            Stream output = Console.OpenStandardOutput();
            output.Write(bytes, 0, bytes.Length);
            output.Flush();
        }
    }

    public static int Main(string[] args)
    {
        try
        {
            if (args.Length < 5) throw new ArgumentException("Usage: X Y WIDTH HEIGHT MAX_WIDTH");
            SetProcessDPIAware();
            int x = Int32.Parse(args[0]);
            int y = Int32.Parse(args[1]);
            int width = Positive(args[2], "WIDTH");
            int height = Positive(args[3], "HEIGHT");
            int maxWidth = Positive(args[4], "MAX_WIDTH");
            int outputWidth = Math.Min(width, maxWidth);
            int outputHeight = Math.Max(1, (int)Math.Round(height * (outputWidth / (double)width)));

            using (Bitmap captured = new Bitmap(width, height, PixelFormat.Format32bppArgb))
            {
                using (Graphics graphics = Graphics.FromImage(captured))
                {
                    graphics.CopyFromScreen(x, y, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
                }

                if (outputWidth == width)
                {
                    WritePng(captured);
                }
                else
                {
                    using (Bitmap resized = new Bitmap(outputWidth, outputHeight, PixelFormat.Format32bppArgb))
                    {
                        using (Graphics graphics = Graphics.FromImage(resized))
                        {
                            graphics.CompositingMode = CompositingMode.SourceCopy;
                            graphics.InterpolationMode = InterpolationMode.HighQualityBilinear;
                            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                            graphics.DrawImage(captured, 0, 0, outputWidth, outputHeight);
                        }
                        WritePng(resized);
                    }
                }
            }
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }
}

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Gaming.XboxGameBar;
using Windows.Foundation;
using Windows.Data.Json;
using Windows.UI.Core;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Media;
using Windows.UI.Xaml.Navigation;

namespace DotaScout.GameBarWidget
{
    public sealed partial class WidgetPage : Page
    {
        private const string PipeName = "LOCAL\\DotaScout.GameBarWidget.v1";
        private const double DesiredWindowHeight = 200;
        private const double DefaultWindowWidth = 520;
        private const double MinWindowWidth = 420;
        private const double MaxWindowWidth = 700;
        private readonly object pipeSync = new object();
        private readonly SemaphoreSlim writeGate = new SemaphoreSlim(1, 1);
        private CancellationTokenSource bridgeCancellation;
        private XboxGameBarWidget widget;
        private NamedPipeClientStream activePipe;
        private StreamWriter pipeWriter;
        private string bridgeError;
        private bool desktopVisible = true;
        private double desktopOpacity = 0.9;
        private long lastSequence;

        public WidgetPage()
        {
            InitializeComponent();
        }

        protected override void OnNavigatedTo(NavigationEventArgs args)
        {
            widget = args.Parameter as XboxGameBarWidget;
            SubscribeWidgetEvents();
            _ = EnsureReadableWindowSizeAsync();
            bridgeCancellation = new CancellationTokenSource();
            _ = RunBridgeLoopAsync(bridgeCancellation.Token);
        }

        protected override void OnNavigatedFrom(NavigationEventArgs args)
        {
            StopBridge();
            UnsubscribeWidgetEvents();
            base.OnNavigatedFrom(args);
        }

        internal void StopBridge()
        {
            bridgeCancellation?.Cancel();
            NamedPipeClientStream pipe;
            lock (pipeSync)
            {
                pipe = activePipe;
                activePipe = null;
                pipeWriter = null;
            }
            pipe?.Dispose();
        }

        private void SubscribeWidgetEvents()
        {
            if (widget == null) return;
            widget.PinnedChanged += WidgetStateChanged;
            widget.ClickThroughEnabledChanged += WidgetStateChanged;
            widget.VisibleChanged += WidgetStateChanged;
            widget.RequestedOpacityChanged += WidgetStateChanged;
            widget.GameBarDisplayModeChanged += WidgetStateChanged;
            widget.WindowStateChanged += WidgetStateChanged;
            ApplyOpacity();
        }

        private void UnsubscribeWidgetEvents()
        {
            if (widget == null) return;
            widget.PinnedChanged -= WidgetStateChanged;
            widget.ClickThroughEnabledChanged -= WidgetStateChanged;
            widget.VisibleChanged -= WidgetStateChanged;
            widget.RequestedOpacityChanged -= WidgetStateChanged;
            widget.GameBarDisplayModeChanged -= WidgetStateChanged;
            widget.WindowStateChanged -= WidgetStateChanged;
        }

        private async Task EnsureReadableWindowSizeAsync()
        {
            if (widget == null) return;
            widget.MinWindowSize = new Size(MinWindowWidth, DesiredWindowHeight);
            widget.MaxWindowSize = new Size(MaxWindowWidth, DesiredWindowHeight);
            widget.HorizontalResizeSupported = true;
            widget.VerticalResizeSupported = false;

            var currentWidth = widget.WindowBounds.Width;
            if (currentWidth <= 0) currentWidth = DefaultWindowWidth;
            currentWidth = Math.Max(MinWindowWidth, Math.Min(MaxWindowWidth, currentWidth));
            try { await widget.TryResizeWindowAsync(new Size(currentWidth, DesiredWindowHeight)); }
            catch { /* The manifest minimum still protects the three-line layout. */ }
        }

        private async void WidgetStateChanged(XboxGameBarWidget sender, object args)
        {
            JsonObject status = null;
            await Dispatcher.RunAsync(CoreDispatcherPriority.Normal, () =>
            {
                ApplyOpacity();
                UpdateConnectionLabel(true);
                status = BuildStatus("widget-status");
            });
            if (status != null) await SendAsync(status);
        }

        private async Task RunBridgeLoopAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                NamedPipeClientStream connectionPipe = null;
                try
                {
                    using (var pipe = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous))
                    {
                        connectionPipe = pipe;
                        lock (pipeSync) activePipe = pipe;
                        await pipe.ConnectAsync(2000);
                        using (var reader = new StreamReader(pipe, Encoding.UTF8, false, 4096, true))
                        using (var writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true })
                        {
                            pipeWriter = writer;
                            bridgeError = null;
                            await Dispatcher.RunAsync(CoreDispatcherPriority.Normal, () => UpdateConnectionLabel(true));
                            await SendAsync(BuildStatus("widget-status"));

                            while (!cancellationToken.IsCancellationRequested && pipe.IsConnected)
                            {
                                var message = await reader.ReadLineAsync();
                                if (message == null) break;
                                await ApplyStateAsync(message);
                            }
                        }
                    }
                }
                catch (Exception exception)
                {
                    bridgeError = "IPC 0x" + exception.HResult.ToString("X8") + " · " + exception.Message;
                }
                finally
                {
                    lock (pipeSync)
                    {
                        if (ReferenceEquals(activePipe, connectionPipe)) activePipe = null;
                        pipeWriter = null;
                    }
                    await Dispatcher.RunAsync(CoreDispatcherPriority.Normal, () => UpdateConnectionLabel(false));
                }

                if (!cancellationToken.IsCancellationRequested)
                {
                    try { await Task.Delay(750, cancellationToken); }
                    catch (TaskCanceledException) { }
                }
            }
        }

        private async Task ApplyStateAsync(string message)
        {
            JsonObject state;
            if (!JsonObject.TryParse(message, out state)) return;
            if (state.GetNamedString("type", "") != "state" || (int)state.GetNamedNumber("version", 0) != 1) return;

            var sequence = (long)state.GetNamedNumber("sequence", 0);
            var sentAt = (long)state.GetNamedNumber("sentAt", 0);
            var visible = state.GetNamedBoolean("visible", true);
            var opacity = Math.Max(0.2, Math.Min(1.0, state.GetNamedNumber("opacity", 0.9)));
            var lines = new List<Tuple<string, string>>();
            var values = state.GetNamedArray("lines", new JsonArray());
            var start = Math.Max(0, values.Count - 3);
            for (var index = start; index < values.Count; index++)
            {
                var item = values[index].GetObject();
                var language = item.GetNamedString("language", "AUTO").Trim().ToUpperInvariant();
                var text = item.GetNamedString("text", "").Trim();
                if (text.Length > 0) lines.Add(Tuple.Create(language, text));
            }

            await Dispatcher.RunAsync(CoreDispatcherPriority.Normal, () =>
            {
                desktopVisible = visible;
                desktopOpacity = opacity;
                lastSequence = sequence;
                RenderLines(lines);
                ApplyOpacity();
                UpdateConnectionLabel(true);
            });

            var acknowledgement = BuildStatus("ack");
            acknowledgement["sequence"] = JsonValue.CreateNumberValue(sequence);
            acknowledgement["sentAt"] = JsonValue.CreateNumberValue(sentAt);
            acknowledgement["appliedAt"] = JsonValue.CreateNumberValue(UnixMilliseconds());
            acknowledgement["lineCount"] = JsonValue.CreateNumberValue(lines.Count);
            await SendAsync(acknowledgement);
        }

        private void RenderLines(IReadOnlyList<Tuple<string, string>> lines)
        {
            LinesPanel.Children.Clear();
            if (lines.Count == 0)
            {
                LinesPanel.Children.Add(new TextBlock {
                    Text = "等待 Desktop 测试消息…",
                    FontFamily = new FontFamily("Segoe UI"),
                    FontSize = 17,
                    Foreground = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 164, 176, 192))
                });
                return;
            }

            foreach (var line in lines)
            {
                var row = new Grid { Height = 34 };
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                var text = new TextBlock {
                    Text = line.Item2,
                    FontFamily = new FontFamily("Segoe UI"),
                    FontSize = 17,
                    FontWeight = Windows.UI.Text.FontWeights.SemiBold,
                    Foreground = new SolidColorBrush(Windows.UI.Colors.White),
                    TextTrimming = TextTrimming.CharacterEllipsis,
                    VerticalAlignment = VerticalAlignment.Center
                };
                Grid.SetColumn(text, 0);
                row.Children.Add(text);
                LinesPanel.Children.Add(row);
            }
        }

        private void ApplyOpacity()
        {
            var requested = widget == null ? 1.0 : widget.RequestedOpacity;
            if (requested > 1.0) requested /= 100.0;
            requested = Math.Max(0.0, Math.Min(1.0, requested));
            ContentPanel.Visibility = desktopVisible ? Visibility.Visible : Visibility.Collapsed;
            ContentPanel.Opacity = desktopVisible ? desktopOpacity * requested : 0.0;
        }

        private void UpdateConnectionLabel(bool connected)
        {
            if (!connected)
            {
                ConnectionText.Text = bridgeError ?? "WAITING FOR DESKTOP";
                return;
            }
            var pin = widget != null && widget.Pinned ? "PINNED" : "NOT PINNED";
            var click = widget != null && widget.ClickThroughEnabled ? "CLICK-THROUGH" : "INTERACTIVE";
            ConnectionText.Text = pin + " · " + click;
        }

        private JsonObject BuildStatus(string type)
        {
            var requested = widget == null ? 1.0 : widget.RequestedOpacity;
            return new JsonObject {
                ["type"] = JsonValue.CreateStringValue(type),
                ["version"] = JsonValue.CreateNumberValue(1),
                ["sequence"] = JsonValue.CreateNumberValue(lastSequence),
                ["pinned"] = JsonValue.CreateBooleanValue(widget != null && widget.Pinned),
                ["clickThrough"] = JsonValue.CreateBooleanValue(widget != null && widget.ClickThroughEnabled),
                ["gameBarVisible"] = JsonValue.CreateBooleanValue(widget == null || widget.Visible),
                ["desktopVisible"] = JsonValue.CreateBooleanValue(desktopVisible),
                ["desktopOpacity"] = JsonValue.CreateNumberValue(desktopOpacity),
                ["requestedOpacity"] = JsonValue.CreateNumberValue(requested),
                ["displayMode"] = JsonValue.CreateStringValue(widget == null ? "Standalone" : widget.GameBarDisplayMode.ToString()),
                ["windowState"] = JsonValue.CreateStringValue(widget == null ? "Standalone" : widget.WindowState.ToString())
            };
        }

        private async Task SendAsync(JsonObject value)
        {
            var writer = pipeWriter;
            if (writer == null) return;
            await writeGate.WaitAsync();
            try
            {
                if (ReferenceEquals(writer, pipeWriter)) await writer.WriteLineAsync(value.Stringify());
            }
            catch (IOException) { }
            catch (ObjectDisposedException) { }
            finally { writeGate.Release(); }
        }

        private static long UnixMilliseconds()
        {
            return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds;
        }
    }
}

using System;
using Microsoft.Gaming.XboxGameBar;
using Windows.ApplicationModel.Activation;
using Windows.UI;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Media;

namespace DotaScout.GameBarWidget
{
    sealed class App : Application
    {
        private XboxGameBarWidget widget;

        [MTAThread]
        public static void Main(string[] args)
        {
            Application.Start(_ => new App());
        }

        protected override void OnActivated(IActivatedEventArgs args)
        {
            var widgetArgs = args as XboxGameBarWidgetActivatedEventArgs;
            if (widgetArgs == null || !widgetArgs.IsLaunchActivation)
            {
                return;
            }

            var frame = new Frame();
            frame.Content = CreateContent();
            Window.Current.Content = frame;

            widget = new XboxGameBarWidget(
                widgetArgs,
                Window.Current.CoreWindow,
                frame);

            Window.Current.Activate();
        }

        protected override void OnLaunched(LaunchActivatedEventArgs args)
        {
            var frame = new Frame();
            frame.Content = CreateContent();
            Window.Current.Content = frame;
            Window.Current.Activate();
        }

        private static UIElement CreateContent()
        {
            var grid = new Grid
            {
                Background = new SolidColorBrush(Color.FromArgb(180, 12, 18, 29))
            };

            grid.Children.Add(new TextBlock
            {
                Text = "DOTA SCOUT GAME BAR TEST",
                FontSize = 26,
                FontWeight = Windows.UI.Text.FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Colors.White),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            });

            return grid;
        }

    }
}

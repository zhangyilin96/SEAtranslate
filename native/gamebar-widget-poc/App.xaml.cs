using System;
using Microsoft.Gaming.XboxGameBar;
using Windows.ApplicationModel.Activation;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Navigation;

namespace DotaScout.GameBarWidget
{
    sealed partial class App : Application
    {
        private XboxGameBarWidget widget;

        public App()
        {
            InitializeComponent();
        }

        protected override void OnActivated(IActivatedEventArgs args)
        {
            XboxGameBarWidgetActivatedEventArgs widgetArgs = null;

            if (args.Kind == ActivationKind.Protocol)
            {
                var protocolArgs = args as IProtocolActivatedEventArgs;
                if (protocolArgs?.Uri?.Scheme == "ms-gamebarwidget")
                {
                    widgetArgs = args as XboxGameBarWidgetActivatedEventArgs;
                }
            }

            if (widgetArgs == null || !widgetArgs.IsLaunchActivation)
            {
                return;
            }

            var rootFrame = new Frame();
            rootFrame.NavigationFailed += OnNavigationFailed;
            Window.Current.Content = rootFrame;

            widget = new XboxGameBarWidget(
                widgetArgs,
                Window.Current.CoreWindow,
                rootFrame);

            rootFrame.Navigate(typeof(WidgetPage), widget);
            Window.Current.Closed += OnWidgetWindowClosed;
            Window.Current.Activate();
        }

        protected override void OnLaunched(LaunchActivatedEventArgs args)
        {
            var rootFrame = Window.Current.Content as Frame ?? new Frame();
            Window.Current.Content = rootFrame;

            if (rootFrame.Content == null)
            {
                rootFrame.Navigate(typeof(WidgetPage));
            }

            Window.Current.Activate();
        }

        private void OnNavigationFailed(object sender, NavigationFailedEventArgs args)
        {
            throw new InvalidOperationException("Failed to load " + args.SourcePageType.FullName);
        }

        private void OnWidgetWindowClosed(object sender, Windows.UI.Core.CoreWindowEventArgs args)
        {
            widget = null;
            Window.Current.Closed -= OnWidgetWindowClosed;
        }
    }
}

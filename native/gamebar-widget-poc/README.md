# Dota Scout Xbox Game Bar Widget PoC

Minimal, isolated Xbox Game Bar widget used to validate Game Bar as the overlay
host for Dota Scout and the first Desktop-to-Widget text communication link.

Without a Desktop connection the widget displays a waiting state. The Desktop
test control sends the first fixed message:

```text
[TH]
别打，等我。
```

## Desktop communication

`DotaScout.GameBarBridge.exe` is a small full-trust helper started by the
Electron Desktop process. It owns
`\\.\pipe\LOCAL\DotaScout.GameBarWidget.v1`; the UWP widget connects as the
client. Messages are versioned, newline-delimited JSON full-state snapshots and
are restricted to `visible`, `opacity`, and at most three language/text lines.
The widget returns an acknowledgement with applied time plus Game Bar pinned,
click-through, visibility, opacity, display-mode, and window-state metadata.

This follows Microsoft's documented Game Bar communication model for an
unpackaged Win32 desktop process. The pipe ACL grants the current Desktop user,
the Windows app-package group, and the widget's exact package SID. On current
Windows builds, the bridge resolves the widget's AppContainer named-object path
before creating the server while the widget continues to use the logical
`LOCAL\DotaScout.GameBarWidget.v1` name. Both directions use UTF-8. The bridge
does not accept commands, file paths, scripts, OCR images, or Dota state.

Scope boundaries:

- no OCR, translation-provider, Match Scout, network access, or game-state access;
- no Dota DLL, injection, hook, process memory access, or automation;
- the widget is hosted by Xbox Game Bar as a UWP XAML view;
- pinning and Game Bar's built-in click-through capability are enabled in the
  package manifest.

The production-sized test layout reserves a fixed 200-DIP height for the header
and three translation lines. Game Bar's public API can read the current bounds,
resize the widget, or center it, but it cannot assign an arbitrary screen X/Y
position. To reposition, open Game Bar, temporarily disable click-through, drag
the widget once, then re-enable click-through before returning to Dota.

Build with `scripts/build-gamebar-widget-poc.ps1`. The project deliberately uses
the standard UWP XAML/MSBuild pipeline from the Visual Studio Build Tools UWP
workload. This keeps XAML initialization and package metadata aligned with the
official Xbox Game Bar widget sample instead of hand-compiling an AppContainer
executable.

Local installation requires either Windows Developer Mode or an MSIX code
signing certificate trusted by Windows. The build script does not modify the
Windows trust store or enable Developer Mode. For a signed local test package,
`scripts/install-gamebar-widget-test-package.ps1` validates the exact temporary
signer and expected package family, installs the package, and removes that
certificate from the machine trust stores in the same elevated transaction.

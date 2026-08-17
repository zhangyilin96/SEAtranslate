# Dota Scout Xbox Game Bar Widget PoC

Minimal, isolated Xbox Game Bar widget used only to test whether Game Bar is a
suitable overlay host for Dota Scout.

The widget displays exactly:

```text
DOTA SCOUT GAME BAR TEST
```

Scope boundaries:

- no OCR, translation, Match Scout, network access, or game-state access;
- no Dota DLL, injection, hook, process memory access, or automation;
- the widget is hosted by Xbox Game Bar as a UWP XAML view;
- pinning and Game Bar's built-in click-through capability are enabled in the
  package manifest.

Build with `scripts/build-gamebar-widget-poc.ps1`. The script uses Microsoft
NuGet packages and the inbox C# compiler, so Visual Studio is not required.

Local installation requires either Windows Developer Mode or an MSIX code
signing certificate trusted by Windows. The build script does not modify the
Windows trust store or enable Developer Mode.

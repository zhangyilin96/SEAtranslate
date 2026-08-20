# Xbox Game Bar Widget PoC test results

Initial test date: 2026-08-17; current update: 2026-08-20

Test host:

- Windows 11
- Dota 2 process: `dota2.exe`
- Initial evidence package: `DotaScout.GameBarWidget.Poc` 0.1.4.0, x64
- Current layout candidate installed: `DotaScout.GameBarWidget.Poc` 0.2.2.0, x64
- Widget content: `DOTA SCOUT GAME BAR TEST`

These results separate captured live evidence from perceptual user testing. A
status is only marked PASS when that exact behavior was exercised during the
test. Documentation-based expectations are not treated as test results.

## Build and package

| Check | Result | Evidence |
| --- | --- | --- |
| Standard UWP XAML build | PASS | Visual Studio UWP MSBuild completed with 0 warnings and 0 errors. |
| MSIX signature | PASS | Windows Authenticode verification returned `Valid`. |
| Package install | PASS | Package 0.1.4.0 installed for x64 with status `Ok`. |
| Current package crash check | PASS | No Application Error event for package version 0.1.4.0 was recorded during the completed test session. Earlier 0.1.1-0.1.3 development failures are not counted as current-package results. |

## Dota rendering tests

| Check | Result | Evidence |
| --- | --- | --- |
| Widget launch and render | PASS | The exact test text rendered in Xbox Game Bar. |
| Pinned widget | PASS | The widget remained visible after dismissing the Game Bar control layer. |
| Dota Windowed visibility | PASS | Live Dota capture showed the pinned widget above the windowed game. |
| Dota Borderless visibility | PASS | Live Dota capture showed the pinned widget above the borderless game. |
| Dota Exclusive Fullscreen visibility | PASS (captured live evidence) | After Dota was switched through its own settings to Exclusive Fullscreen and applied, live Dota capture still showed the pinned widget. This is not a documentation inference. |
| Exclusive Fullscreen user-eyeball confirmation | PASS | On 2026-08-20 the user confirmed the pinned widget was stably visible in fullscreen. |

## Interaction tests

| Check | Result | Evidence |
| --- | --- | --- |
| Pinned click-through, default Game Bar state | FAIL | Before Game Bar click-through was enabled, the overlay region was owned by `GameBar.exe`. |
| Pinned click-through, Game Bar click-through enabled | PASS | After enabling Game Bar's click-through control, the same coordinates were delivered to `dota2.exe`; the underlying Dota UI responded. |
| Dota focus while clicking through | PASS (automated target test) | Clicks in the widget area were delivered to Dota and did not reopen the Game Bar control layer. |
| Mouse stutter or latency | PASS AFTER FIX | On 2026-08-20 the user reported that the stutter was gone after Desktop automatic OCR and frequent process polling were isolated from the IPC path. |
| Three-line content fit | FIX CANDIDATE AWAITING RETEST | User screenshot showed the third line clipped at the 0.2.1.0 lower edge. Version 0.2.2.0 requests a fixed 200-DIP height and uses bounded 34-DIP rows. |
| Reposition while click-through is active | HOST LIMITATION | Click-through deliberately sends mouse input to Dota, so the widget cannot be dragged in that state. Public Widget API supports resize, bounds inspection, and centering, but not arbitrary X/Y placement. |

## Safety and restoration

- The widget did not inject or load a Dota DLL, hook Dota, read process memory,
  run OCR, translate text, or access Match Scout data.
- Dota's display configuration was restored after testing to its original
  `Borderless Window` mode with `Use current monitor resolution` selected.
- The temporary test certificate was scoped to the exact development
  thumbprint. After testing, that thumbprint was removed and verified absent
  from CurrentUser `My`, `Root`, and `TrustedPeople`, and LocalMachine `Root`
  and `TrustedPeople` (all counts were zero).

## PoC conclusion

Xbox Game Bar successfully hosted this minimal Dota Scout overlay in the tested
Windowed, Borderless, and Exclusive Fullscreen configurations. Click-through
worked only after Game Bar's click-through mode was enabled. The user has now
confirmed physical-screen visibility, click-through, and normal Dota operation.
Perceptual mouse smoothness passed after the Desktop performance isolation fix.
The remaining gate is the user's visual confirmation that version 0.2.2.0 shows
all three translation lines without clipping.

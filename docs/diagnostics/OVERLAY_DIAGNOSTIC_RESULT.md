# Dota Scout External Overlay Diagnosis

测试日期：2026-08-17

测试机器：Windows 11，3840×2160，225% DPI

## 结论

热键不是断点。External Overlay 的最终真实结果：

| 场景 | Overlay | 结论 |
| --- | --- | --- |
| Desktop | visible | PASS |
| Dota Windowed | visible、above Dota | PASS |
| Dota Borderless | Native PoC visible | PASS，但曾有透明度、click-through 和鼠标轻微卡顿问题 |
| Dota Exclusive Fullscreen | 用户不可见 | FAIL |

External HWND 不再作为首选最终游戏 Overlay Host，只保留 Debug、fallback 和 Desktop preview。Native 修复版的自动结构检查不能替代真人游戏输入与鼠标体感测试。

## 技术边界

Electron 与 Native PoC 都保持独立进程，不注入 Dota、不 Hook、不读取游戏内存。Native PoC 使用 Per-Monitor-V2 DPI-aware Win32 HWND、D3D11、DXGI composition swap chain 与 DirectComposition，并通过 `WS_EX_TRANSPARENT`、`WS_EX_NOACTIVATE`、`WM_NCHITTEST=HTTRANSPARENT` 和 `WM_MOUSEACTIVATE=MA_NOACTIVATE` 实现输入穿透。

真正的 legacy Exclusive Fullscreen 不可靠地合成普通 DWM HWND。项目不会为解决该限制引入 Dota DLL 注入或 Present/Swapchain Hook。

## 当前路线

Xbox Game Bar Widget 已成为首选 Overlay Candidate；External Native Overlay 为 fallback。Game Bar 的独立实测记录见 `native/gamebar-widget-poc/TEST_RESULTS.md`。

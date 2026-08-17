# Dota Scout / SEA Translate 项目状态

> 更新：2026-08-17
>
> 当前主线：Dota 2 SEA 实时聊天翻译助手（Live Translate）
>
> 当前 Overlay 首选候选：Xbox Game Bar Widget，尚未达到 Production Ready

## 产品方向

最高优先级是 Live Translate。Match Scout、Player DNA、Coach 和玩家评分分析暂时暂停。现阶段不新增功能，先完成 Game Bar 用户实机确认，再决定正式 Overlay Host。

## Hotkey 实测

Global Shortcut：**PASS**。

`Ctrl+Shift+F7` 与 `Ctrl+Shift+F8` 已在桌面、Dota 主菜单和真实 Bot 比赛中收到事件。快捷键不是当前核心问题。正式记录见 `docs/diagnostics/HOTKEY_DIAGNOSTIC_RESULT.md`。

## Native External Overlay

| 场景 | 结果 |
| --- | --- |
| Desktop visible / hotkey | PASS / PASS |
| Dota Windowed visible / above Dota | PASS / PASS |
| Dota Borderless visible / hotkey | PASS / PASS |
| Dota Exclusive Fullscreen visible | FAIL |

Borderless 路线曾出现透明度、click-through 和鼠标轻微卡顿问题。修复版结构与自动运行时检查通过，但产品级鼠标体感仍需真人复测。External HWND 不再是首选最终 Overlay Host，只保留为 Debug、fallback 和 Desktop preview。源码位于 `native/native-overlay-poc/`。

## Heybox / 小黑盒公开观察

仅通过公开进程模块观察到 `heybox-overlay-x64.dll` 位于 `dota2.exe`，同时存在 `GameOverlayRenderer64.dll` 和 `nvspcap64.dll`。没有反编译、复制、调用其 DLL 或分析私有实现。

## In-Process Overlay 合规 Gate

结论：**HIGH RISK / DO NOT ENTER DOTA**。

没有找到 Valve 对任意第三方自有 DLL 加载进 `dota2.exe` 并 Hook DXGI/D3D11 的明确公开安全港。禁止开发 Dota loader、injector 或 hook。自有 DX11 Renderer 未来只能在项目自己的 Harness 中研究；当前不是主线。完整研究见 `IN_PROCESS_OVERLAY_RESEARCH.md`。

## 当前 Dota Renderer

- 当前被测试实例：DX11 **CONFIRMED**。
- Present / Swapchain model：**UNKNOWN**。
- PresentMon ETW 因 Windows 权限不足没有得到结果，不推测或伪造结论。

## Xbox Game Bar Widget PoC

测试环境：Windows 11、Dota 2、`DotaScout.GameBarWidget.Poc` 0.1.4.0 x64。Widget 显示 `DOTA SCOUT GAME BAR TEST`。

| 检查 | 结果 |
| --- | --- |
| Build | PASS |
| MSIX signature（临时信任测试期间） | PASS |
| Package install | PASS |
| Current package crash check | PASS |
| Widget launch / render | PASS |
| Pinned widget | PASS |
| Dota Windowed visibility | PASS |
| Dota Borderless visibility | PASS |
| Dota Exclusive Fullscreen visibility | PASS（captured live evidence） |
| Exclusive Fullscreen 用户肉眼确认 | WAITING FOR USER TEST |
| Pinned click-through 默认状态 | FAIL |
| 开启 Game Bar click-through 后 | PASS |
| Dota focus while clicking through | PASS |
| Mouse perceptual stutter / latency | WAITING FOR USER TEST |

自动画面证据与用户肉眼可见是两个独立状态。用户确认前不得写成 Production Ready。完整记录见 `native/gamebar-widget-poc/TEST_RESULTS.md`。

Game Bar Widget 没有注入 Dota、向 `dota2.exe` 加载自有 DLL、Hook Dota、读取 Dota 内存，也没有接入 OCR、翻译或 Match Scout。测试结束后 Dota 已恢复为原始 Borderless Window；临时测试证书指纹已从 CurrentUser 与 LocalMachine 相关证书库删除并核对为零。

## Overlay 技术决策

1. Xbox Game Bar Widget：当前首选候选。
2. External Native Overlay：fallback / debug / desktop preview。
3. DX11 Harness：未来技术研究，当前暂停。
4. In-Process Dota Overlay：冻结，禁止进入 Dota。

## 当前可运行代码

- Electron / Desktop 主程序：`electron/`、`src/`，构建命令见 `README.md`。
- Native Overlay PoC：`native/native-overlay-poc/`，构建脚本 `scripts/build-native-dcomp-overlay.ps1`。
- Xbox Game Bar Widget PoC：`native/gamebar-widget-poc/`，构建脚本 `scripts/build-gamebar-widget-poc.ps1`。

生成的 EXE、MSIX、证书、日志、截图、`node_modules`、`bin/obj` 和其他构建产物不会进入 Git。

## 不可跨越的边界

不读取 Dota 内存，不注入 DLL，不 Hook 游戏函数，不读取战争迷雾、隐藏物品或隐藏冷却，不自动操作，不使用未知玩家身份伪装可靠数据。

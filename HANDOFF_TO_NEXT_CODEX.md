# Handoff to the next Codex

## 先读

1. `PROJECT_STATUS.md`
2. `NEXT_STEPS.md`
3. `IN_PROCESS_OVERLAY_RESEARCH.md`
4. `native/gamebar-widget-poc/TEST_RESULTS.md`
5. `docs/diagnostics/HOTKEY_DIAGNOSTIC_RESULT.md`
6. `docs/diagnostics/OVERLAY_DIAGNOSTIC_RESULT.md`

不要一上来大规模重构。当前主线是 Dota 2 SEA Live Translate；Game Bar 是首选 Overlay Candidate，但仍等待用户对 Exclusive Fullscreen 肉眼显示和鼠标流畅度的最终确认。

## 目录结构

| 路径 | 用途 | 状态 |
| --- | --- | --- |
| `src/` | React UI、Match Scout 历史代码、Live Translate、OCR、输出翻译 | 主程序源码；Match Scout 等非主线功能暂停 |
| `electron/` | Desktop 主进程、窗口、快捷键、截图与本机桥接 | 可运行的 Desktop 主程序 |
| `native/DotaScout.Win32Helper.cs` | Electron 使用的 Win32 helper | 当前 Desktop 诊断依赖 |
| `native/native-overlay-poc/` | 独立 Win32 + D3D11 + DirectComposition Overlay | 实验代码；fallback/debug，不是当前主线 |
| `native/gamebar-widget-poc/` | Xbox Game Bar UWP XAML Widget | 当前首选 Overlay PoC |
| `scripts/` | Desktop helper、Native Overlay、Game Bar 构建与临时证书测试脚本 | 构建工具 |
| `docs/diagnostics/` | 已归档的正式诊断结论 | 事实依据 |
| `IN_PROCESS_OVERLAY_RESEARCH.md` | VAC / 合规 Gate 与 renderer 研究 | 必须遵守 `DO NOT ENTER DOTA` |
| `PLAYER_ID_RESEARCH.md` | 当前比赛玩家身份来源研究 | Match Scout 暂停时仅供历史参考 |
| `LIVE_TRANSLATE_REAL_DOTA_TEST.md` | Live Translate 真实测试记录 | 后续分层验收参考 |

`outputs/`、`release/`、`dist/`、`node_modules/`、`bin/obj`、EXE、DLL、PDB、MSIX、日志、截图和测试证书都是本地产物，Git 会忽略。

## 构建

### Desktop

```text
pnpm install
pnpm test
pnpm build
pnpm desktop:package
```

### Native Overlay PoC

```text
powershell -ExecutionPolicy Bypass -File scripts/build-native-dcomp-overlay.ps1
```

技术：Win32 HWND、D3D11、DXGI flip-sequential composition swap chain、Direct2D/DirectWrite、DirectComposition。快捷键见 `native/native-overlay-poc/README.md`。

### Xbox Game Bar Widget PoC

```text
powershell -ExecutionPolicy Bypass -File scripts/build-gamebar-widget-poc.ps1
```

需要 Visual Studio Build Tools 的 UWP workload。Widget 是标准 UWP XAML，由 Xbox Game Bar 托管；Electron 不参与其 Overlay 渲染。测试用 MSIX 侧载需要临时受信开发证书或 Developer Mode，任何测试证书都不得提交到 Git。

## 当前能运行与实验性质

- Desktop 源码、测试和 production build 可运行；普通用户构建产物不进 Git。
- Native Overlay PoC 可构建为独立测试 EXE，但 Exclusive Fullscreen 不可见，且 Borderless 产品手感仍需真人复测。
- Game Bar Widget 0.1.4.0 已完成构建和三种 Dota 显示模式测试。Windowed、Borderless、captured Exclusive 均可见；Game Bar click-through 开启后穿透通过。用户肉眼 Exclusive 与鼠标体感仍待确认。
- In-Process Dota Overlay 只完成研究 Gate，没有也不得存在 Dota loader、injector 或 hook 实现。

## 后续唯一允许的主线

严格执行 `NEXT_STEPS.md`：先用户确认 Game Bar，再做 Desktop 到 Widget 的最小文本 IPC，之后才把既有 Capture/OCR/去重/语言识别/翻译链接入。

## 可选研究任务

可以研究开源项目 LunaTranslator 与 MORT，重点只看：OCR region selection、fixed-region capture、window binding、OCR trigger、text change detection、deduplication、translation provider abstraction、low-latency translation pipeline、overlay presentation。

不要研究、复制或实现游戏注入、Hook、进程内 Overlay 路线。

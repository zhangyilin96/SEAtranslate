# Handoff to the next Codex

## 先读

1. `PROJECT_STATUS.md`
2. `NEXT_STEPS.md`
3. `IN_PROCESS_OVERLAY_RESEARCH.md`
4. `native/gamebar-widget-poc/TEST_RESULTS.md`
5. `docs/diagnostics/HOTKEY_DIAGNOSTIC_RESULT.md`
6. `docs/diagnostics/OVERLAY_DIAGNOSTIC_RESULT.md`
7. `OPEN_SOURCE_TRANSLATOR_RESEARCH.md`
8. `LIVE_TRANSLATE_OPERATION_GUIDE.md`

不要一上来大规模重构。当前主线是 Dota 2 SEA Live Translate；Game Bar Host 的全屏可见、click-through、Dota focus、性能修复和三行布局均已由用户确认。真实 OCR 翻译第一版已接入，当前只等待用户在真实 Dota 中验收识别率、翻译、延迟和鼠标体感。

## 目录结构

| 路径 | 用途 | 状态 |
| --- | --- | --- |
| `src/` | React UI、Match Scout 历史代码、Live Translate、OCR、输出翻译 | 主程序源码；Match Scout 等非主线功能暂停 |
| `electron/` | Desktop 主进程、窗口、快捷键、截图与本机桥接 | 可运行的 Desktop 主程序 |
| `native/DotaScout.Win32Helper.cs` | Electron 使用的 Win32 helper | 当前 Desktop 诊断依赖 |
| `native/native-overlay-poc/` | 独立 Win32 + D3D11 + DirectComposition Overlay | 实验代码；fallback/debug，不是当前主线 |
| `native/gamebar-widget-poc/` | Xbox Game Bar UWP XAML Widget | 当前主 Overlay Host；Host Gate 已通过 |
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
- Game Bar Widget 0.2.2.0 已完成三种 Dota 显示模式、用户肉眼 Exclusive、click-through、Dota focus、性能隔离和固定三行布局验收。
- Desktop → Widget IPC 已完成；提交 `794bc63` 接入真实 OCR 翻译链，Gate 修复 `9e27857` 已让真实新聊天产生反应，颜色分离修复 `fca3224` 已让 `back` 正确显示。提交 `d425a29` 进一步支持冒号优先/多玩家色辅助切分、假昵称过滤、重复昵称校正、翻译前语言判断、英语 OCR 快速主路径/泰文按需回退、并行网络翻译和保留重复次数的本地 Dota 短指令。Widget 0.2.3.0 已签名安装并隐藏语言标签；安装用临时证书已核对无残留。最新 4K 截图离线验证、46 项常驻测试和 production build 通过；真实 Dota 仍待用户验收。
- In-Process Dota Overlay 只完成研究 Gate，没有也不得存在 Dota loader、injector 或 hook 实现。

## 后续唯一允许的主线

严格执行 `NEXT_STEPS.md`：本地 OCR 诊断采样和连续 2–3 帧共识已经接入，当前唯一任务是在真实 Dota 中用 `--ocr-diagnostics` 采集并标注指定短句，确认稳定发布、真实重复 `back`、`farm → 刷钱`、Widget 最近三条、端到端延迟和鼠标体感。得到同一批真实样本的 Tesseract 基线之前，不扩词典、不替换正式 OCR 引擎，也不扩展其他产品功能。

## 可选研究任务

LunaTranslator 与 MORT 的合规研究已经完成，见 `OPEN_SOURCE_TRANSLATOR_RESEARCH.md`。后续只在真实验收暴露明确问题时回看相关设计，不要无目的扩大研究。

不要研究、复制或实现游戏注入、Hook、进程内 Overlay 路线。

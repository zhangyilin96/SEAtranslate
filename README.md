# Dota Scout

Dota Scout 是 Windows Dota 2 Companion 的本地验证版本。当前重点是功能真实性：没有可靠数据来源时不展示 LIVE 结果，Demo 和手动 Debug 永远明确标注。

## 普通用户启动

双击项目根目录的 `Dota Scout.exe`。这是独立 Windows x64 便携程序，不需要 Node.js、npm、pnpm 或 PowerShell。重复启动只保留一个实例。

程序尚未购买代码签名证书，Windows SmartScreen 可能提示“未知发布者”。

## 当前真实状态

### Match Scout

- 启动后默认显示“等待比赛”，不会自动加载十名演示玩家。
- 当前独立版本只能检测 Dota 2 进程，尚不能可靠取得普通天梯当前十人的 Account ID。
- “扫描当前比赛”明确 disabled 并标记“技术验证中”。
- Demo 必须显式点击进入，页面永久显示 `DEMO / SAMPLE MATCH`。
- 手动十人输入只位于 `Settings → Developer / Debug`，结果标记 `DEBUG / MANUAL INPUT`。
- 技术调研见 `PLAYER_ID_RESEARCH.md`。目前最值得继续验证的是 Overwolf GEP 在 Strategy Time 后提供的 roster；当前尚未集成。

### Windows Overlay

- 当前阶段只诊断极简 `DOTA SCOUT TEST`；OCR、翻译与 Match Scout 串联暂停。
- Electron BrowserWindow 已实现 always-on-top、半透明、不可聚焦和鼠标穿透，并增加 Win32 `SetWindowPos(HWND_TOPMOST, SWP_NOACTIVATE)` helper。
- 最终 portable 包已修复 Overlay 本地页面加载和首帧状态竞态，Desktop 实测 PASS。
- Windowed 实测 PASS；Borderless 在当前 4K / 225% DPI 环境中只出现裁切/未完整渲染区域，产品级 FAIL；Exclusive Fullscreen 的独立 HWND 状态 PASS，但用户画面可见 FAIL。
- 用户可见、自动截图、窗口状态与 Dota 焦点是四个独立状态；不会再用 `isVisible=true` 冒充游戏内可见。
- 当前诊断热键为 Ctrl+Shift+F7（显示/隐藏）和 Ctrl+Shift+F8（选择 OCR 区域）。两组热键已在桌面、Dota 主菜单和真实 Bot 比赛中收到事件；完整结果见 `outputs/HOTKEY_DIAGNOSTIC_RESULT.md`。
- Overlay 完整结论见 `outputs/OVERLAY_DIAGNOSTIC_RESULT.md`。

### OCR 与 Live Translate

- 选择聊天区域采用两阶段交互：拖动框选 → 保持矩形 → 再次单击矩形或点击确认按钮保存；ESC 取消，重新拖动可调整。
- Settings 显示显示器、X、Y、Width、Height 与保存区域预览。
- “测试 OCR”会真实截图该区域一次，分开显示截图和 OCR 原文。
- 实时链路为：截图 → Tesseract.js OCR → 去重 → 自动语言检测 → 翻译 → Dota 术语修正 → 最近三条 Overlay。
- OCR 模型：英语、泰语、马来语、印尼语；首次使用需联网下载模型。
- 翻译默认使用实验性免 Key 通道；可选 Google Cloud Translation Key。
- OCR/翻译代码保留，但按当前阶段要求暂停继续开发与游戏内串联。Overlay 至少达到稳定 Borderless PASS 前，不恢复实时模式验收。

## 数据边界

- 只读取 OpenDota 公开历史数据，以及用户主动确认、在屏幕上可见的区域。
- 不读取 Dota 内存，不注入游戏，不 Hook，不读取战争迷雾、隐藏物品或隐藏技能冷却，不执行游戏操作。
- 基础 OpenDota 数据没有回放时间线时，对线能力显示不可用，不伪造分数。

## 开发与打包

普通用户无需以下工具。重新构建：

```text
pnpm install
pnpm test
pnpm build
pnpm desktop:package
```

最终便携版生成到 `release/Dota Scout.exe` 并复制到项目根目录。

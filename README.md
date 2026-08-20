# Dota Scout / SEA Translate

Dota Scout / SEA Translate 是 Windows Dota 2 SEA 实时聊天翻译助手。当前最高优先级是 Live Translate；Match Scout、Player DNA、Coach 与玩家评分分析暂停。没有可靠数据来源时不展示 LIVE 结果，Demo 和手动 Debug 永远明确标注。

当前 Overlay 首选候选是 Xbox Game Bar Widget。Windowed、Borderless、Exclusive Fullscreen、用户肉眼可见、click-through、Dota focus 与性能隔离复测均已通过；三行显示高度修复仍等待用户确认，因此尚未标记为 Production Ready。完整状态见 `PROJECT_STATUS.md`，下一阶段严格按 `NEXT_STEPS.md` 执行。

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

### Overlay 技术状态

- Xbox Game Bar Widget 是当前首选候选；PoC 位于 `native/gamebar-widget-poc/`。
- External Native Overlay 保留为 fallback、Debug 和 Desktop preview；PoC 位于 `native/native-overlay-poc/`。
- 自有 DX11 Harness 当前暂停；In-Process Dota loader、injector、Hook 路线冻结且禁止实现。
- 用户可见、自动画面证据、窗口状态与 Dota 焦点是独立状态，不会互相冒充。
- Ctrl+Shift+F7 / F8 已在桌面、Dota 主菜单和真实 Bot 比赛中收到事件；完整结果见 `docs/diagnostics/HOTKEY_DIAGNOSTIC_RESULT.md`。
- External Overlay 完整结论见 `docs/diagnostics/OVERLAY_DIAGNOSTIC_RESULT.md`；Game Bar 结果见 `native/gamebar-widget-poc/TEST_RESULTS.md`。

### OCR 与 Live Translate

- 选择聊天区域采用两阶段交互：拖动框选 → 保持矩形 → 再次单击矩形或点击确认按钮保存；ESC 取消，重新拖动可调整。
- Settings 显示显示器、X、Y、Width、Height 与保存区域预览。
- “测试 OCR”会真实截图该区域一次，分开显示截图和 OCR 原文。
- 实时链路为：截图 → Tesseract.js OCR → 去重 → 自动语言检测 → 翻译 → Dota 术语修正 → 最近三条 Overlay。
- OCR 模型：英语、泰语、马来语、印尼语；首次使用需联网下载模型。
- 翻译默认使用实验性免 Key 通道；可选 Google Cloud Translation Key。
- OCR/翻译代码保留，但暂停新增功能与游戏内串联。Desktop → Game Bar 最小文本通信链已完成；先确认 Widget 三行布局，再进入翻译链路。

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

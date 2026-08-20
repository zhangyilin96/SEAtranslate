# Dota Scout / SEA Translate

Dota Scout / SEA Translate 是 Windows Dota 2 SEA 实时聊天翻译助手。当前最高优先级是 Live Translate；Match Scout、Player DNA、Coach 与玩家评分分析暂停。没有可靠数据来源时不展示 LIVE 结果，Demo 和手动 Debug 永远明确标注。

当前 Overlay 主路线是 Xbox Game Bar Widget。Windowed、Borderless、Exclusive Fullscreen、用户肉眼可见、click-through、Dota focus、性能隔离和三行布局均已通过用户实测。真实 OCR 翻译链已经接入，但尚待真实 Dota 聊天验收，因此整个 Live Translate 产品仍不是 Production Ready。完整状态见 `PROJECT_STATUS.md`，操作步骤见 `LIVE_TRANSLATE_OPERATION_GUIDE.md`。

## 普通用户启动

双击项目根目录的 `Dota Scout Live Translate.exe`。这是独立 Windows x64 便携程序，不需要 Node.js、npm、pnpm 或 PowerShell。重复启动只保留一个实例。

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
- 实时链路为：低分辨率区域变化检测 → 稳定后截图 → Tesseract.js 单词位置 OCR → 蓝色说话人/右侧白色消息分离 → 有序新行检测 → TTL 去重 → 自动语言检测 → 翻译 → Dota 术语修正 → Game Bar 最近三条。
- OCR 模型：英语、泰语、马来语、印尼语；首次使用需联网下载模型。
- 翻译默认使用实验性免 Key 通道；可选 Google Cloud Translation Key。
- 实时翻译默认由用户手动开启，设置会保存；只在 Dota 处于前台且已经保存固定区域时运行。
- 首次 OCR 只建立当前聊天基线，不翻译进入游戏前已存在的文字；之后只发布新增内容。
- 当前代码和自动测试已完成，真实 Dota OCR 准确率、端到端延迟和开启后的鼠标体感仍待用户验收。

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

构建脚本生成 `release/Dota Scout.exe` 并复制到项目根目录。当前用户验收包会另存为 `Dota Scout Live Translate.exe`，避免与先前性能修复版混淆。

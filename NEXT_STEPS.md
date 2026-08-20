# Dota Scout / SEA Translate 下一阶段

> 当前主线：Live Translate。以下步骤必须按顺序执行，不要提前展开新架构或新功能。

## 2026-08-20 当前 Gate

Desktop → Game Bar Widget 最小 IPC 已完成。用户已确认全屏稳定可见、鼠标穿透、Dota 操作、性能修复和 0.2.2.0 固定三行布局均正常。

变化 Gate 修复后用户确认新聊天已有反应，但蓝色游戏 ID、战队标签与白色消息被错误混合翻译。颜色感知修复版现保留整行截图来识别说话人，只翻译蓝色昵称右侧的白字，并为 `back / w8 / gogogo` 增加本地即时翻译；用户截图离线验证与 37 项常驻自动测试通过。**当前唯一下一步是用户运行新修复版复测**：框选完整聊天行，依次发送 `back`、`w8`、`gogogo`，确认 Widget 显示 `Kiseki: 撤 / 等一下 / 上`。得到结果前不要继续扩展 OCR 或更换翻译架构。

## STEP 1：用户本人确认 Game Bar

- Exclusive Fullscreen 中肉眼实际可见。
- 鼠标移动无感知卡顿或延迟。
- pinned 与 click-through 的实际使用体验正常。
- Dota 保持焦点，Overlay 不影响游戏操作。

任一项失败都先记录真实结果，不得把 Game Bar 标记为 Production Ready。

## STEP 2：最小通信链

如果 STEP 1 通过，建立：

`Dota Scout Desktop → IPC / App Communication → Xbox Game Bar Widget`

第一阶段只发送固定测试文本，例如：

```text
[TH]
别打，等我。
```

只验证：实时显示、最近三条、show/hide、opacity、pinned、click-through，以及不影响 Dota focus。

## STEP 3：接入 Live Translate（代码完成，待真实验收）

通信链通过后再串联：

`固定聊天区域 Capture → OCR → Text Change Detection → Deduplicate → Language Detection → Dota-specific Translation → Game Bar Widget`

每层保留独立测试与真实输入输出，不用 Mock 结果冒充已完成能力。

当前实现只读取用户框选的屏幕区域，不进入 Dota 进程。首次扫描建立基线；画面稳定变化才触发 OCR；最近三条中文翻译通过已验证 IPC 发布到 Widget。

## STEP 4：未来的中文输出翻译

增加：`中文输入 → Dota 简短英文翻译`。

示例：

```text
我还有20秒BKB，不要打
→
Don't fight. BKB in 20s.
```

## 暂停路线

- Match Scout、Player DNA、Coach、玩家评分。
- DX11 Harness Stage B。
- Native HWND Overlay 产品化优化。
- Dota In-Process DLL、loader、injector、DXGI/D3D Hook。
- OCR 与翻译扩展功能，直到 STEP 3 真实验收完成。

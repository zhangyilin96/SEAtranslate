# Dota Scout / SEA Translate 下一阶段

> 当前主线：Live Translate。以下步骤必须按顺序执行，不要提前展开新架构或新功能。

## 2026-08-20 当前 Gate

Desktop → Game Bar Widget 最小 IPC 已完成。用户已确认全屏稳定可见、鼠标穿透、Dota 操作、性能修复和 0.2.2.0 固定三行布局均正常。

第二轮实测暴露多玩家颜色、假昵称、重复 `go` 语义丢失和延迟问题。新候选支持冒号优先/多玩家色辅助的行切分、后台预判 EN/TH/MS/ID、英语 OCR 快速主路径与泰文按需回退、并行网络翻译和本地 Dota 短指令；Widget 0.2.3.0 已安装并隐藏语言标签，临时证书已核对无残留。后续 `IPC 0x80131505` 被确认是旧 Widget 页面占住单实例管道；新 Desktop Bridge 已改为 8 个并发连接，双客户端自测和真实 Widget 连接均通过。Widget 0.2.4.0 的主动断开候选已构建但未安装，当前运行组合是新 Desktop + 已安装的 0.2.3.0。最新复测又确认 Desktop 每次失去 Dota 前台时会重建 OCR 基线，导致切回后的第一条聊天可能被吞掉；修复版会跨前台暂停保留基线和去重状态，只在用户重新框选区域时清空。随后实时日志证明 OCR 已识别并翻译出三条，但翻译期间失去焦点会在发布前丢弃整批结果；最终修复改为已完成批次只受应用销毁或重新框选影响，焦点变化不再阻止发送。**当前唯一下一步是用户切回 Dota、等待约 3 秒后发送一条新的 `gogogo`**，确认显示 `Kiseki: 上上上`。得到结果前不要继续扩展 OCR 或翻译功能。

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

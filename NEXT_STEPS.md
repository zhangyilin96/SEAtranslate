# Dota Scout / SEA Translate 下一阶段

> 当前主线：Live Translate。以下步骤必须按顺序执行，不要提前展开新架构或新功能。

## 2026-08-20 当前 Gate

Desktop → Game Bar Widget 最小 IPC 已完成。用户已确认全屏稳定可见、鼠标穿透、Dota 操作、性能修复和 0.2.2.0 固定三行布局均正常。

真实验收已证明 Game Bar Host 与 IPC 可用，当前主要瓶颈已经转为 OCR 稳定性和 Dota 语义。2026-08-20 最新候选允许按聊天滚动顺序确认的真实新行重复发送（修复第二次 `back` 被 TTL 误拦），`need farm` 等短句优先走本地 Dota 语义，并加入当前 127 名英雄的完整英文名、唯一缩写和常见 SEA 别名。`ES`、`VS`、`BM` 等一词多义缩写故意不猜，必须使用 `shaker/ember/earthspirit`、`venge/voidspirit` 等无歧义别名。

**当前唯一下一步：建立真实聊天 OCR 样本集并实现多帧共识。** 不再靠无限增加模糊词条掩盖 OCR 错字，也不提前开发其他产品功能。

### OCR 准确率改进方针（下一阶段）

1. 每次误识别保存“原始区域、二值化区域、TSV 单词/置信度、期望文本”到本地诊断样本；默认不上传，避免聊天隐私泄露。
2. 对同一聊天行采集连续 2–3 帧，按位置和编辑距离投票，只发布稳定候选；明确的新行可走快速路径，不能再让单帧噪声覆盖已有结果。
3. 针对 Dota 白色描边字比较现有 Tesseract、Windows OCR 和轻量本地 OCR 的准确率/耗时，再决定引擎，不先大规模重写。
4. 用 Dota 指令、物品、地图目标和英雄词典做受限纠错；只有高置信候选才能纠正，禁止把任意乱码强行猜成英雄名。
5. 保持屏幕固定区域读取，不注入、不 Hook、不读取 Dota 内存。

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

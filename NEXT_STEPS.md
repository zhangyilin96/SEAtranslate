# Dota Scout / SEA Translate 下一阶段

> 当前主线：Live Translate。以下步骤必须按顺序执行，不要提前展开新架构或新功能。

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

## STEP 3：接入 Live Translate

通信链通过后再串联：

`固定聊天区域 Capture → OCR → Text Change Detection → Deduplicate → Language Detection → Dota-specific Translation → Game Bar Widget`

每层保留独立测试与真实输入输出，不用 Mock 结果冒充已完成能力。

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
- OCR 与翻译新功能，直到 STEP 1 和 STEP 2 通过。

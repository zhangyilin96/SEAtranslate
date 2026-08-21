# Dota Scout Live Translate 操作说明

## 第一次使用

1. 双击项目根目录的 `Dota Scout Live Translate.exe`。
2. 左侧点击 `LIVE TRANSLATE / 聊天翻译`。
3. 点击 `Ctrl+Shift+F8 设置区域`，只框住 Dota 左下角聊天文字，不要框入小地图、技能栏或持续动画。
4. 点击框内或确认按钮保存，再点击 `开启实时翻译`。
5. 按 `Win+G` 打开 Xbox Game Bar，打开 Dota Scout Widget，调整位置并 Pin。
6. 位置满意后开启 Game Bar 自带的 Click-through，再回到 Dota。

首次 OCR 可能联网下载英语、泰语、马来语和印尼语模型。第一次扫描只建立已有聊天基线；请等待一条新聊天，中文翻译才会出现。Widget 始终只显示最近三条。

## 日常使用

启停设置会保存。以后启动 Dota Scout 后，只要实时翻译处于开启状态、固定区域仍有效且 Dota 在前台，后台就会自动监测；主控制窗口可以最小化。

Game Bar 的 Click-through 开启时无法拖动 Widget。需要改位置时，按 `Win+G`，先关闭 Click-through，拖动并固定位置，然后重新开启 Click-through。

## 本轮请记录的验收结果

- 英语、泰语、马来语或印尼语新聊天是否被识别。
- 中文是否显示在 Widget，最近三条是否正确滚动。
- 从新聊天出现到中文显示的大致秒数。
- 开启实时翻译后鼠标是否仍然流畅。
- 如失败，记下 LIVE TRANSLATE 页面的 Capture / OCR / Translate 耗时和红色错误文字。
- 修复版还会显示 `Probe #`、`OCR #`、`Lines` 和 `Δ`。至少发送一条新聊天后等待 8 秒，再切回控制页截图；`OCR #` 应从 1 增加。

出现明显卡顿时，立即在 LIVE TRANSLATE 页面点击 `暂停实时翻译`。该操作会关闭 OCR 工作窗口，但不会修改 Dota，也不会向 `dota2.exe` 加载任何模块。

## 本地 OCR 诊断样本

只有诊断误识别时才用 `--ocr-diagnostics` 启动程序。普通启动不会持续保存聊天截图，避免额外磁盘写入和隐私留存。

```text
"Dota Scout Live Translate.exe" --ocr-diagnostics
```

启用后，每次实际 OCR 会在 `%APPDATA%\Dota Scout\ocr-diagnostics\日期\时间戳-序号\` 保存：

- `original.png`：原始彩色聊天裁剪图
- `preprocessed.png`：送入 Tesseract 的预处理图
- `words.tsv`：Tesseract 单词、位置与置信度
- `candidate.json`：最终聊天候选与 OCR 引擎
- `expected.txt`：可选人工期望文本，默认留空，可在本机编辑

也可用环境变量 `DOTA_SCOUT_OCR_DIAGNOSTIC_DIR` 指向项目内的 `ocr-diagnostics/` 以便做离线对比；该目录已进入 `.gitignore`。样本只保存在本机，上传前必须检查并移除玩家 ID、战队标签和聊天隐私。

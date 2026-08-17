# Dota Scout 项目状态

> 更新：2026-08-17  
> 当前结论：热键 PASS；Windowed Overlay PASS，Borderless 与 Exclusive Fullscreen 的用户可见性仍 FAIL

## 已实现并验证

- Windows x64 单文件便携 EXE、单实例、中文启动错误与本地日志。
- 启动默认 0 名玩家，显示等待状态；没有 Demo 冒充 LIVE。
- Demo 仅显式加载并带 `DEMO / SAMPLE MATCH`；手动数据带 `DEBUG / MANUAL INPUT`。
- 手动十人输入已从正式主页移到折叠的 Developer / Debug。
- “扫描当前比赛”因十人身份来源未完成而 disabled。
- Dota 2 安装与进程检测；明确返回 `identityStatus: unavailable`。
- OpenDota 已知 ID 历史分析、五项指标、详情证据与不可用状态。
- Windows 桌面诊断窗：置顶、半透明、不抢焦点、鼠标穿透代码路径、Ctrl+Shift+F7 开关。
- Settings 分开显示用户肉眼可见、自动截图、窗口状态、Dota 焦点、输入穿透和热键诊断状态。
- 后台常驻、Dota 进程/前台检测、Ctrl+Shift+F7 / Ctrl+Shift+F8 / Alt+T 全局快捷键注册。
- Hotkey Diagnostic Mode：显示注册结果、分场景事件计数和最后事件；状态持久化到本机诊断 JSON。
- 实机验证：桌面、Dota 主菜单、真实 Bot 比赛中 F7/F8 各收到一次，注册与三阶段热键均 PASS。
- Overlay Diagnostic：极简 `DOTA SCOUT TEST`、完整 HWND/z-order/焦点/坐标/显示模式状态与手动诊断控制。
- Win32 helper：`SetWindowPos(HWND_TOPMOST)`、`SWP_NOACTIVATE`、窗口扩展样式与 Dota 相对 z-order 检查。
- Native Overlay PoC：独立 WinForms topmost/noactivate/click-through 测试窗，用于排除“只有 Electron 失败”。
- Windowed 实测：Overlay 可覆盖 Dota，Dota 保持前台，PASS。
- Portable 子窗口 URL 已改用规范 `file://` URL；修复 `ERR_FAILED ... index.html?mode=overlay`。
- Overlay 诊断 payload 在创建窗口前设置；修复首帧被旧翻译状态覆盖的竞态。
- 独立 OCR Worker、固定区域周期截图、去重、语言识别、术语修正与最近三条翻译数据流。
- Outgoing Translate 两阶段 Enter、ESC 取消、复制结果但不自动向 Dota 发送；指定示例输出已通过测试。
- OCR 两阶段选区：拖动后待确认、第二次点击矩形保存、ESC 取消、可重新拖动。
- Settings OCR 区域：显示器、像素坐标、尺寸、预览、重新选择、单次 OCR、清除。
- 单次 OCR 显示真实区域截图和真实识别文本。
- 实时翻译链路使用真实屏幕截图与 OCR 输入，无 Mock 翻译消息。

## 当前未实现 / 未验证

- 普通天梯当前十人的 Account ID 自动获取：未实现。
- Overwolf GEP roster：仅完成调研，未集成、未在真实对局测试。
- Valve GSI：未安装本机配置；普通玩家视角本身不足以提供十人身份。
- 真实 Dota 比赛中的自动十人 Scout Report：未实现。
- 自动识别成功率：没有可报告数据。
- Borderless：HWND visible/topmost、SetWindowPos、click-through 和 Dota 前台均 PASS，但当前 4K / 225% DPI 环境只显示裁切/未完整渲染区域，产品级 FAIL。
- Exclusive Fullscreen：Electron 与原生 Win32 PoC 都报告窗口 visible/topmost，但游戏画面用户可见 FAIL。
- 自动截图仍只是辅助；上述 FAIL 以用户最新实测和当前真实模式验收为准，不是只因截图缺层。
- 完全不影响英雄控制仍需要真人在局内做最终手感验收。
- click-through 与不聚焦已在窗口配置和运行时状态中验证；“完全不影响英雄控制”仍需要真人在局内复核。
- 泰语、马来语、印尼语真实 Dota 聊天样本的端到端准确率：未实测。
- 另一台干净 Windows 电脑：未实测。

## 技术研究结论

详见 `PLAYER_ID_RESEARCH.md`、`LIVE_TRANSLATE_REAL_DOTA_TEST.md` 和 `outputs/OVERLAY_DIAGNOSTIC_RESULT.md`。独立版的 Steam Web API/OpenDota、普通玩家 GSI、控制台日志与屏幕 OCR 都不能可靠返回十人 Account ID。Overlay 保留 Electron + Win32 路线；下一步若继续，应先做 DPI-aware Native D3D/DirectComposition Borderless PoC。Exclusive Fullscreen 的独立窗口受 flip/独占呈现边界限制；不会用注入/Hook 绕过。Overwolf 仍只保留未来备选，不自动迁移。

## 验证证据

- Vitest：核心指标、身份转换、术语去重和选区坐标测试。
- TypeScript + Vite production build。
- Electron 自动桌面验收：等待状态、Demo 标记、详情、真实 OpenDota、两阶段选区、保存区域、Settings 预览、真实 OCR、在线翻译、Overlay 状态。
- 真实 Dota 三模式：Windowed PASS；Borderless 用户可见 FAIL；Exclusive 用户可见 FAIL。窗口状态与用户可见性分开记录。
- 热键诊断：`HOTKEY_REGISTERED`、`HOTKEY_F7_RECEIVED`、`HOTKEY_F8_RECEIVED` 日志及 `outputs/HOTKEY_DIAGNOSTIC_RESULT.json`；完整结论见 `outputs/HOTKEY_DIAGNOSTIC_RESULT.md`。
- Dota 显示配置已在三模式测试后按 SHA-256 完整恢复为原始文件（fullscreen=1，nowindowborder=1；SHA-256 `4DBC60CCF4B041EC384298DB68D2AF997D4C8C84408FFBA6CD080CC13D8EEA0D`）。
- 自动验收记录输出在 `outputs/`。

## 明确不做

不读取内存，不注入 DLL，不 Hook 游戏函数，不读取战争迷雾、隐藏物品或隐藏冷却，不自动操作，不用非唯一玩家名伪装成可靠 Account ID。

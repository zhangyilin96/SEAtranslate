# Dota Scout 热键优先诊断结果

测试日期：2026-08-17

测试热键：`Ctrl+Shift+F7` / `Ctrl+Shift+F8`

| 项目 | 结果 |
| --- | --- |
| Hotkey Registration | PASS |
| Desktop Hotkey | PASS |
| Dota Menu Hotkey | PASS |
| Dota In-Match Hotkey | PASS |
| Ctrl+Shift+F7 Event Count | 3 |
| Ctrl+Shift+F8 Event Count | 3 |

两组 Electron 全局热键都在桌面、Dota 主菜单和真实 Bot 比赛画面中收到事件。当前问题不能再归因于“Dota 前台没有把热键交给 Dota Scout”。

| 场景 | F7 | F8 |
| --- | ---: | ---: |
| Desktop | 1 | 1 |
| Dota Menu | 1 | 1 |
| Dota In-Match | 1 | 1 |

注册状态：

- `Ctrl+Shift+F7`: REGISTERED
- `Ctrl+Shift+F8`: REGISTERED
- 没有产生 `HOTKEY_REGISTER_FAILED`

本轮保留 Electron Overlay，没有迁移 Overwolf、重写 OCR 或修改 Dota 显示模式。自动截图与用户实机肉眼可见继续作为独立状态记录。

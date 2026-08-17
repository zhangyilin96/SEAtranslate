# Live Translate 真实 Dota 验收报告

> 日期：2026-08-17  
> 结论：用户已确认 Electron Overlay 在真实 Dota 中肉眼可见；自动截图工具没有捕获该层。两者必须独立记录。

## 验收环境

- Windows，单显示器 3840 × 2160。
- 真实 `dota2.exe` 前台运行。
- Dota 原始显示配置：`fullscreen=1`、`nowindowborder=1`。
- 测试期间临时切换过无边框模式；结束后已用测试前备份恢复原文件，并核对 SHA-256 完全一致。

## 验收状态矩阵

| 验收维度 | 当前状态 | 证据与边界 |
| --- | --- | --- |
| 用户实际可见 | 已确认 | 用户在真实 Dota 画面中肉眼看到了悬浮窗；这是最高优先级证据。 |
| 自动截图可见 | 未捕获 | 外部截图没有 Overlay 层，只能说明该截图路径无法验证，不能反推用户不可见。 |
| Windows 窗口状态 | 已验证 | visible、always-on-top、non-focusable，click-through 已配置。 |
| Dota 是否失焦 | 已验证未失焦 | 探针显示 Overlay 显示、隐藏、恢复期间前台进程仍为 `dota2.exe`。 |
| Overlay 是否影响操作 | 部分验证 | focusable=false 和鼠标穿透已配置；英雄控制、施法、镜头等需要真人局内复核。 |
| Alt+F7 实际显示/隐藏 | 待真人复核 | 全局快捷键注册成功；当前自动 Windows 控制模块无法初始化，不能冒充已完成物理按键验收。 |

桌面环境下 Overlay、两阶段框选、固定区域截图、OCR、翻译、最近三条和 Outgoing Translate 均能自动验收。

## 截图工具限制

独占全屏和无边框测试中，Electron 的窗口状态正常，外部截图都没有 Overlay。结合用户肉眼确认，正确记录是：

> 截图工具无法捕获，但用户实机肉眼可见。

不能再把截图缺层自动转换成“游戏内不可用”。

## 技术结论

Electron 提供 `alwaysOnTop`、`moveAbove` 和全屏工作区可见性等窗口能力。当前实机反馈证明不能只用截图结果判断最终合成画面的用户可见性，因此保留现有 Electron 实现。

Overwolf 只作为未来跨机器兼容性备选；除非 Electron 在真实用户环境中出现稳定性问题，不会因为截图工具漏层自动切换架构。

## 下一轮真人复核

1. 保持用户当前 Dota 显示模式，不由程序修改配置。
2. Dota 前台按 Alt+F7，肉眼确认隐藏；再次按下确认出现。
3. 确认切换过程中 Dota 不失焦。
4. 鼠标划过 Overlay，确认点击仍到达游戏。
5. 复核镜头、技能、英雄控制不受影响。
6. 再测试 Alt+F8 区域选择和 Alt+T 输入层。

## 证据文件

- `outputs/v03-real-dota-probe.json`
- `outputs/v03-real-dota-external-screen.png`
- `outputs/v03-borderless-dota-probe.json`
- `outputs/v03-borderless-dota-external-screen.png`
- `outputs/v03-borderless-zorder-probe.json`
- `outputs/v03-borderless-zorder-external.png`
- `outputs/video-fullscreen-original.txt`

## 官方资料

- Electron BaseWindow API: https://www.electronjs.org/docs/latest/api/base-window
- Overwolf Electron Overlay Overview: https://dev.overwolf.com/ow-electron/reference/Overwolf-electron-APIs/overlay/Overview/
- Overwolf in-game overlay guidelines: https://dev.overwolf.com/ow-electron/guides/product-guidelines/app-screen-behavior/in-game-overlays/
- Overwolf manifest reference: https://dev.overwolf.com/ow-native/reference/manifest/manifest-json/
- Overwolf basic sample app: https://dev.overwolf.com/ow-native/getting-started/onboarding-resources/basic-sample-app/

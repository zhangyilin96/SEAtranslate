# Dota Scout / SEA Translate 项目状态

> 更新：2026-08-20
>
> 当前主线：Dota 2 SEA 实时聊天翻译助手（Live Translate）
>
> 当前 Overlay 主路线：Xbox Game Bar Widget；Host 验收通过，真实翻译链待用户验收

## 产品方向

最高优先级是 Live Translate。Match Scout、Player DNA、Coach 和玩家评分分析暂时暂停。Game Bar Host 的可见性、输入、性能与三行布局 Gate 已通过；当前只验收真实 OCR 翻译链，不扩展其他产品功能。

## Hotkey 实测

Global Shortcut：**PASS**。

`Ctrl+Shift+F7` 与 `Ctrl+Shift+F8` 已在桌面、Dota 主菜单和真实 Bot 比赛中收到事件。快捷键不是当前核心问题。正式记录见 `docs/diagnostics/HOTKEY_DIAGNOSTIC_RESULT.md`。

## Native External Overlay

| 场景 | 结果 |
| --- | --- |
| Desktop visible / hotkey | PASS / PASS |
| Dota Windowed visible / above Dota | PASS / PASS |
| Dota Borderless visible / hotkey | PASS / PASS |
| Dota Exclusive Fullscreen visible | FAIL |

Borderless 路线曾出现透明度、click-through 和鼠标轻微卡顿问题。修复版结构与自动运行时检查通过，但产品级鼠标体感仍需真人复测。External HWND 不再是首选最终 Overlay Host，只保留为 Debug、fallback 和 Desktop preview。源码位于 `native/native-overlay-poc/`。

## Heybox / 小黑盒公开观察

仅通过公开进程模块观察到 `heybox-overlay-x64.dll` 位于 `dota2.exe`，同时存在 `GameOverlayRenderer64.dll` 和 `nvspcap64.dll`。没有反编译、复制、调用其 DLL 或分析私有实现。

## In-Process Overlay 合规 Gate

结论：**HIGH RISK / DO NOT ENTER DOTA**。

没有找到 Valve 对任意第三方自有 DLL 加载进 `dota2.exe` 并 Hook DXGI/D3D11 的明确公开安全港。禁止开发 Dota loader、injector 或 hook。自有 DX11 Renderer 未来只能在项目自己的 Harness 中研究；当前不是主线。完整研究见 `IN_PROCESS_OVERLAY_RESEARCH.md`。

## 当前 Dota Renderer

- 当前被测试实例：DX11 **CONFIRMED**。
- Present / Swapchain model：**UNKNOWN**。
- PresentMon ETW 因 Windows 权限不足没有得到结果，不推测或伪造结论。

## Xbox Game Bar Widget PoC

测试环境：Windows 11、Dota 2；当前安装 `DotaScout.GameBarWidget.Poc` 0.2.2.0 x64。Widget 显示 `DOTA SCOUT · LIVE TRANSLATE`。

| 检查 | 结果 |
| --- | --- |
| Build | PASS |
| MSIX signature（临时信任测试期间） | PASS |
| Package install | PASS |
| Current package crash check | PASS |
| Widget launch / render | PASS |
| Pinned widget | PASS |
| Dota Windowed visibility | PASS |
| Dota Borderless visibility | PASS |
| Dota Exclusive Fullscreen visibility | PASS（captured live evidence） |
| Exclusive Fullscreen 用户肉眼确认 | PASS（2026-08-20 用户实测） |
| Pinned click-through 默认状态 | FAIL |
| 开启 Game Bar click-through 后 | PASS |
| Dota focus while clicking through | PASS |
| Mouse perceptual stutter / latency | PASS（隔离自动 OCR 与高频进程查询后，2026-08-20 用户复测无卡顿） |

自动画面证据与用户肉眼可见是两个独立状态。Game Bar Host Gate 已由用户确认；真实翻译链仍未达到 Production Ready。完整记录见 `native/gamebar-widget-poc/TEST_RESULTS.md`。

Game Bar Widget 包本身没有注入 Dota、向 `dota2.exe` 加载自有 DLL、Hook Dota、读取 Dota 内存，也没有运行 OCR、翻译或 Match Scout。OCR 与翻译只在 Desktop 侧运行，再通过已验证 IPC 发布显示状态。测试结束后 Dota 已恢复为原始 Borderless Window；本轮 0.2.2.0 临时测试证书指纹已从 CurrentUser 与 LocalMachine 相关证书库删除并核对为零。CurrentUser 证书库仍有一个更早期开发证书（指纹 `0CDD2F728031AFA85CCF6D9002F2C607FE39B53F`），未获删除授权，因此保持原状并单独记录。

### 2026-08-20 性能修复（用户已验证）

已确认旧 Desktop 在保存 OCR 区域后，会在 Dota 前台自动执行全屏捕获、区域裁剪和四语言 Tesseract OCR，并在每轮结束后等待 1.8 秒；同时 Desktop 曾每 1 秒启动一次 `tasklist.exe`，界面又每 3 秒重复查询进程。这些后台负载与用户报告的周期性卡顿高度吻合。

当前 Game Bar IPC 阶段已做最小隔离：正常启动不再创建实时 OCR 工作窗口，OCR PoC 与手动 OCR 测试代码均保留；Dota 后台进程查询改为缓存结果并最多每 15 秒执行一次，Dota 在前台时直接由前台窗口信息确认。用户已在同一 Dota 场景复测并确认鼠标不卡顿。

2026-08-20 用户截图发现第三条消息被 Widget 底边裁切。0.2.2.0 将 Widget 高度固定为 200 DIP，并压缩为明确的三行布局；用户随后确认显示正常。Game Bar 公共 API 不支持任意 X/Y 预设位置；开启 click-through 后不能拖动属于宿主设计，位置调整需在 Game Bar 中临时关闭 click-through 后完成。

### 2026-08-20 Live Translate 第一版

真实链路已经接入：固定区域低分辨率探测 → 画面稳定/变化 Gate → 四语言 Tesseract OCR → 有序聊天行差分 → 20 秒 TTL 去重 → 自动语言标签 → 中文翻译与 Dota 术语修正 → Game Bar 最近三条完整状态替换。

正常启动服从用户保存的启停开关。只有 Dota 位于前台且区域已配置时才探测；首次 OCR 只建立基线；无变化时不运行 OCR，另有 12 秒恢复检查。Desktop 页面显示 Capture、OCR 与 Translate 分段耗时。实现提交为 `794bc63`，自动测试 32/32 通过，正式前端构建通过。

当前不能写成真实 Dota 翻译 PASS：仍需用户用真实聊天确认 OCR 准确率、翻译内容、端到端延迟以及开启翻译后的鼠标体感。第一轮验收结束前不继续开发 OCR 新功能。

## Overlay 技术决策

1. Xbox Game Bar Widget：当前主路线，Host Gate 已通过。
2. External Native Overlay：fallback / debug / desktop preview。
3. DX11 Harness：未来技术研究，当前暂停。
4. In-Process Dota Overlay：冻结，禁止进入 Dota。

## 当前可运行代码

- Electron / Desktop 主程序：`electron/`、`src/`，构建命令见 `README.md`。
- Native Overlay PoC：`native/native-overlay-poc/`，构建脚本 `scripts/build-native-dcomp-overlay.ps1`。
- Xbox Game Bar Widget PoC：`native/gamebar-widget-poc/`，构建脚本 `scripts/build-gamebar-widget-poc.ps1`。

生成的 EXE、MSIX、证书、日志、截图、`node_modules`、`bin/obj` 和其他构建产物不会进入 Git。

## 不可跨越的边界

不读取 Dota 内存，不注入 DLL，不 Hook 游戏函数，不读取战争迷雾、隐藏物品或隐藏冷却，不自动操作，不使用未知玩家身份伪装可靠数据。

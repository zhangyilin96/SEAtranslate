# Dota Scout / SEA Translate 项目状态

> 更新：2026-08-21
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

测试环境：Windows 11、Dota 2；当前安装 `DotaScout.GameBarWidget.Poc` 0.2.3.0 x64。0.2.2.0 已完成 Host 与三行布局验收；0.2.3.0 的无语言标签内容仍待真实 Dota 复测。Widget 显示 `DOTA SCOUT · LIVE TRANSLATE`。

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

真实链路已经接入：固定区域低分辨率探测 → 画面稳定/变化 Gate → 拉丁字形优先、泰文字形按需回退的 Tesseract OCR → 有序聊天行差分 → 20 秒 TTL 去重 → EN/TH/MS/ID 后台语言判断 → 中文翻译与 Dota 术语修正 → Game Bar 最近三条完整状态替换。

正常启动服从用户保存的启停开关。只有 Dota 位于前台且区域已配置时才探测；首次 OCR 只建立基线；无变化时不运行 OCR，另有 12 秒恢复检查。Desktop 页面显示 Capture、OCR 与 Translate 分段耗时。实现提交为 `794bc63`，自动测试 32/32 通过，正式前端构建通过。

当前不能写成真实 Dota 翻译 PASS：仍需用户用真实聊天确认 OCR 准确率、翻译内容、端到端延迟以及开启翻译后的鼠标体感。第一轮验收结束前不继续开发 OCR 新功能。

### 2026-08-20 首轮真实 OCR 失败与修复候选

用户首轮实测确认 Widget 正常，但新聊天没有被发布。Desktop 已成功完成第一次 OCR 并显示“基线 7 行”，因此框选、OCR 初始化和 Widget IPC 不是本次断点；页面记录全分辨率 Capture 2976 ms、OCR 1412 ms。根因是首版画面 Gate 要求 6% 区域变化，一条 4K 聊天文字占比远低于该阈值，聊天消失前没有触发第二次 OCR。

修复候选把聊天变化阈值降到 0.6%，单独使用 0.3% 稳定阈值，并用 2 秒最小 OCR 间隔限制误触发；恢复检查缩短至 7 秒。OCR 捕获改为最高 1920 像素宽，保留归一化区域坐标，减少 4K 全屏截图负载。页面新增 Probe、OCR、识别行数和变化百分比计数，日志也记录每次 OCR 状态。用户截图的半分辨率聊天区域已用同一 Tesseract 引擎离线复核，能识别 `back`、`w8`、`gogogo` 等内容。该候选自动测试 34/34 通过，等待用户复测，尚不得记为 PASS。

用户复测确认变化 Gate 已有反应，但首版把蓝色游戏 ID、战队标签与白色消息整体交给翻译，并受 OCR 抖动影响把多行旧内容反复当作新消息。修复版改用 Tesseract 单词位置与原始截图颜色：蓝色区只用于提取说话人，只有其右侧白色内容进入翻译；Widget 以 `说话人: 中文` 显示。`back`、`w8`、`gogogo` 及其常见 OCR 变体走本地 Dota 短指令表，不等待网络 Provider；每轮新增消息最多处理末尾三条。用户提供的 4K 截图已用同一 OCR 和颜色分离代码离线通过 `Kiseki + back / w8 / gogogo` 验证。37 项常驻自动测试与 production build 通过，仍等待真实 Dota 复测，尚不得记为 PASS。

第二轮实测确认 `back` 可正确显示，但仍出现 `AT: 大的`、单个泰文字母假昵称、`gogogo` 重复语义丢失和 2–4 秒级处理延迟。新候选不再假设昵称只能是蓝色，而是优先按冒号结构切分昵称与消息，并以多种 Dota 玩家颜色辅助；丢弃过短假昵称，并用同批行的重复昵称纠正 `Iaseki → Kiseki`。OCR 主路径只加载英语字形，泰文模型在主路径无有效聊天时按需回退；MS/ID 在 OCR 后、翻译前由词汇信号判断，明确语言会传给 Provider。网络消息并行翻译，`go/gogo/gogogo` 分别本地输出 `上/上上/上上上`，`back/rs?/cant` 也不访问网络。Widget 0.2.3.0 隐藏语言标签，只显示 `Kiseki: 上上上`；签名安装已完成，安装用临时证书指纹 `D4A4B8DD857B6B30131E48C45AD2E8D671FA4165` 已从 CurrentUser/LocalMachine 的 My、Root、TrustedPeople 复查为零。用户最新 4K 截图已离线通过说话人与 `gogogo/back/rs?/cant` 尾部提取验证；46 项常驻自动测试与 production build 通过，真实 Dota 仍待复测。

随后用户截图出现 `IPC 0x80131505`，Widget 完全收不到 Desktop 状态。诊断确认 OCR/翻译后台仍有输出，断点是旧 Widget 页面占用了 Bridge 唯一的管道实例：结束 Widget 后，同一 Windows 用户立即能连接并读取当前三行状态。修复后的 Desktop Bridge 最多同时服务 8 个 Widget 页面，向所有连接广播同一状态；双客户端同时接收与回执自测通过。满 8 个连接时 Bridge 会等待空位而不空转；8 个测试连接同时断开后，清理异常已被隔离，随后重新连接自测通过。最终 Desktop 启动并唤醒 Game Bar 后，真实 Widget 占用 1 个连接，另 7 个诊断连接可同时建立并已释放，Bridge 仍存活，证明可见 Widget 已重新连上。当前实际安装包仍为 0.2.3.0。

Widget 0.2.4.0 候选另外在页面导航和窗口关闭时主动释放管道，UWP/MSIX 构建 0 警告、0 错误；但本机未开启 Developer Mode，账户级 TrustedPeople 也不足以通过自签名完整证书链检查。由于没有获得扩大到机器级根证书信任的明确授权，0.2.4.0 没有安装，未把候选冒充已部署版本。所有本轮临时 0.2.4 证书均已清理；现阶段用多连接 Desktop Bridge + 已安装 0.2.3.0 完成即时修复，等待用户发送一条真实聊天确认显示内容。

再次实测时 Widget 已不再出现 IPC 错误，但新聊天仍可能无输出。运行日志显示 OCR 在工作且 IPC 已连接，随后每次 Desktop 失去 Dota 前台都会重新创建画面 Gate、聊天基线和去重表；用户切出 Dota 查看控制面板或发送截图后，切回时的第一条聊天因此可能被当作新基线而不发布。修复版把这些会话状态提升到前台运行周期之外，只在重新框选 OCR 区域时重置；Dota 前台暂停/恢复不再吞掉第一条消息。46 项自动测试、TypeScript 构建和便携版打包通过；同名根目录 `Dota Scout.exe` 已被覆盖并重新启动，仍等待用户实机确认。

下一次实测日志在 19:32:02 明确记录 OCR 提取 5 行、3 条新消息完成翻译，而本地管道探针同时确认真实 Widget 在线 1 个，但 Bridge 最新状态仍是空行。这把断点进一步缩小到 Worker 的发布保护：网络翻译执行期间若焦点变化，已完成结果会被整体丢弃。最终候选允许同一 OCR 区域的已完成批次在焦点变化后继续发布，只在应用销毁或重新框选区域时作废；测试 46/46、TypeScript 和 production build 通过。同名便携版已覆盖并重启，重启后探针再次确认真实 Widget 占用 1 个连接、Bridge 可读，等待最后一次真实消息确认。

### 2026-08-20 真实语义与重复指令复测

用户实测确认普通 Provider 会把 `need farm` 直译为“需要农场”，而去重层的 90 秒模糊 TTL 会误拦玩家后来真正再次发送的 `back`。当前候选将“有序聊天滚动匹配出的尾行”视为可信新消息，允许真实重复指令；无序 OCR 碎片仍使用模糊 TTL 防抖。`farm / need farm / farm now`、`back`、`no dam`、`lets rs` 等高频 Dota 意图在联网 Provider 前本地翻译。

英雄词典已独立为 `src/translate/heroGlossary.ts`，覆盖 Valve 当前 127 名英雄的完整英文名，并生成无冲突首字母缩写、补充常见 SEA/Dota 别名。冲突缩写（例如 `ES`、`VS`、`BM`）不会自动猜测，以免把一个英雄稳定翻错成另一个英雄。

当前产品仍不是 Production Ready：截图中的 `y go`、`fk u lc` 等结果说明单帧 OCR 仍会丢字或串字。下一阶段不继续无上限扩词典，唯一任务是建立本地真实聊天样本集，并实现按行位置、置信度和连续 2–3 帧投票的 OCR 共识层；之后用同一批样本对比现有 Tesseract、Windows OCR 和候选轻量本地 OCR 的准确率与延迟。详细顺序见 `NEXT_STEPS.md`。

### 2026-08-21 本地 OCR 诊断与多帧共识

已加入显式启用的本机 OCR 诊断采样。使用 `--ocr-diagnostics` 启动时，每轮实际 OCR 会在应用数据目录保存原始彩色裁剪、Tesseract 预处理图、完整 TSV、最终候选 JSON 和可选人工期望文本；普通启动不落盘。仓库内 `ocr-diagnostics/` 已忽略，聊天截图和玩家信息不得提交。

聊天候选现保留行纵向位置、消息词置信度、说话人置信度和单词框。新增共识层使用纵向位置、近似说话人、编辑距离、词置信度和受限 Dota 本地语义，在连续 2–3 帧中选择候选；两帧冲突时等待第三帧多数结果。高置信度且能由有序滚动证明为新增的尾行保留首帧快速路径。单帧低置信噪声不会提交为当前聊天窗口，低置信结果也不会替换已提交的高置信行。

自动测试现为 73 项，覆盖 `back / back? / farm / need farm / gogogo / stfu / no dam / lets rs / focus pa / am missing`、单字符抖动、行消失后重现、真实重复 `back`、聊天滚动、单帧低置信错误、单帧不兼容结果、三帧多数共识和玩家名/战队标签分离；TypeScript production build 通过。真实 Dota 的准确率、额外延迟与鼠标体感仍必须用本机诊断样本验收，尚不得标记 Production Ready，也尚未决定替换 Tesseract。

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

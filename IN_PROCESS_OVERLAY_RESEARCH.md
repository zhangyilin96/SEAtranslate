# Dota Scout In-Process Overlay 研究与合规 Gate

研究日期：2026-08-17  
范围：公开进程/窗口观察、官方资料、外部 ETW 尝试、独立 DX11 Test Harness 设计  
明确未做：反编译小黑盒、调用或复制其 DLL、向 Dota 注入模块、Hook Dota、读取游戏内存/隐藏状态、绕过 VAC/反作弊

## 1. 结论先行

### Compliance Gate

**HIGH RISK / DO NOT ENTER DOTA**

技术上，成熟的 Steam/小黑盒/NVIDIA Overlay 已证明“在游戏进程内参与最终帧渲染”可以覆盖 Windowed、Borderless，且可能覆盖真正的 Exclusive Fullscreen。合规上，目前没有找到 Valve 对任意第三方在 `dota2.exe` 内加载自有 UI DLL、拦截 DXGI/D3D11 呈现调用的公开许可、稳定 API 或安全港。

因此本项目当前允许做的下一层只有：**在 Dota Scout 自己拥有的 DX11 Test Harness 中验证 renderer**。在获得 Valve 明确书面许可、官方受支持接口或等价可信依据前，不得把新模块加载进 Dota。

这不是“认定 UI Overlay 就是作弊”，而是：在 VAC 保护的多人游戏进程里加入未获授权的第三方模块，无法由我们自己证明不会触发政策、签名或未来规则；风险不能拿用户账号试错。

## 2. 当前实机证据

### 2.1 小黑盒确实使用了进程内模块

在用户当前运行的 Dota 进程中，通过 Windows 公共进程模块枚举观察到：

| 模块 | 路径/意义 | 结论 |
| --- | --- | --- |
| `heybox-overlay-x64.dll` | `%APPDATA%\heybox-chat-electron\chatdll\33\heybox-overlay-x64.dll` | **CONFIRMED LOADED** |
| `gameoverlayrenderer64.dll` | Steam Game Overlay Renderer | **CONFIRMED LOADED** |
| `nvspcap64.dll` | NVIDIA Game Proxy | **CONFIRMED LOADED** |

这只证明这些产品在当前机器上有模块位于 `dota2.exe` 中，且它们的 Overlay 在用户实测中工作；不证明它们采用相同加载机制，也不证明 Valve 对未知第三方 DLL 提供同等待遇。没有检查 DLL 私有实现、导出、指令、内存或通信协议。

### 2.2 当前 Dota 渲染 API

被观察进程：

- PID（观察时）：`30396`
- 可执行文件：`D:\SteamLibrary\steamapps\common\dota 2 beta\game\bin\win64\dota2.exe`
- 同时加载：`rendersystemdx11.dll`、`d3d11.dll`、`DXGI.dll`
- 未在该次模块快照中观察到 `rendersystemvulkan.dll`

**Dota Renderer：DX11（当前这次运行，CONFIRMED）**

该结论不能外推为“Dota 永远只用 DX11”；启动参数或未来版本可能改变渲染器，产品以后仍应显式识别并拒绝不支持的 API。

### 2.3 Present / Swapchain 模型

使用官方 GameTechDev PresentMon 2.5.1 做了外部 ETW 验证准备：

- 下载来源：官方 GitHub Release
- SHA-256：`9bec3083069f58f911e6a512f4806db51a27bd096103087bc1d05ef54c80a191`
- 参数关闭输入追踪，未向 Dota 注入
- 实际结果：Windows 返回 `failed to start trace session: access denied`
- 原因：当前账户没有管理员或 `Performance Log Users` 权限

因此：

**Present / Swapchain model：UNKNOWN（未自动确认）**

没有用视频设置、窗口外观或“看起来像全屏”代替 ETW 证据。后续如果用户主动允许一次管理员诊断，可用 PresentMon 区分 `Composed: Flip`、`Hardware: Independent Flip`、`Hardware: Legacy Flip` 等；这不是进入 Dota 的前置授权，只是显示链路诊断。

微软说明现代 flip-model 的 DirectFlip/Independent Flip 可在窗口化全屏时绕过或减少 DWM 合成，并建议用 PresentMon 判断实际模式：[DXGI flip-model / DirectFlip 官方说明](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/for-best-performance--use-dxgi-flip-model)。

## 3. Steam Overlay 架构能证明什么

Valve 的 Steamworks 文档明确写明 Steam Overlay 会自动 hook 从 Steam 启动的游戏，并需要在 OpenGL/D3D 设备创建前进入相应生命周期；FAQ 也直接提到它“injects itself into the game”。它支持 DirectX 7–12、OpenGL、Metal、Vulkan：[Steam Overlay 官方文档](https://partner.steamgames.com/doc/features/overlay?language=english)。

据此可确认：

1. Steam Overlay 的最终画面不是普通独立 topmost HWND 的单一路线。
2. 进程内 renderer 与游戏的 Present/Swapchain 生命周期协作，是覆盖真正 FSE 的成熟架构之一。
3. Steam Overlay 是 Valve 自有、由 Steam 启动并与 Steamworks 生命周期集成的受信组件。

不能据此推导：

- 任意第三方 DLL 都可以安全进入 Dota；
- 只画 UI、不读内存就自动得到 Valve 授权；
- 小黑盒/NVIDIA/Discord 的签名、合作关系、白名单或检测待遇适用于 Dota Scout；
- 技术可行等于账号风险可接受。

## 4. Valve / VAC 合规研究

### 4.1 可确认的官方事实

1. Steam Subscriber Agreement 禁止未获授权的第三方软件篡改 Steam/Content and Services 的执行或交互过程，并禁止未经许可的修改/派生行为：[Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/index.html?l=english)。
2. Steamworks 的 VAC 文档说明 VAC 是 Steam/Steamworks 组件，会在游戏运行时扫描已知作弊软件；VAC 的具体检测逻辑并不公开：[VAC Integration](https://partner.steamgames.com/doc/features/anticheat/vac_integration?language=english)。
3. Steam Support 说明 VAC 会检查在安全服务器上运行时是否有带来优势的第三方软件，误判也不会由客服手工撤销：[I've been VAC banned](https://help.steampowered.com/en/faqs/view/647C-5CC1-7EA9-3C29)。
4. 2023 年 Dota 官方永久封禁超过 40,000 个读取正常游戏中不可见内部信息的账号，并通过客户端 honeypot 识别读取者：[Cheaters Will Never Be Welcome in Dota](https://steamcommunity.com/ogg/570/announcements/detail/3677788723152833274)。

### 4.2 没有找到的关键证据

截至本次研究，没有找到 Valve 官方公开资料明确承诺以下任一项：

- “纯 UI”第三方 DLL 可无申请地加载进 `dota2.exe`；
- 第三方可以安全拦截/包裹 Dota 的 `Present`、`Present1`、`ResizeBuffers`；
- 经代码签名的普通开发者 Overlay 自动获得 VAC 豁免；
- 不读游戏内存即可保证不会被 VAC、Dota 行为系统或未来规则处置；
- Dota 提供面向普通 Companion 产品的受支持 In-Process Overlay SDK。

### 4.3 风险判定

| 风险面 | 判定 | 原因 |
| --- | --- | --- |
| 技术稳定性 | MEDIUM/HIGH | 渲染状态、ResizeBuffers、设备重建和退出顺序出错会直接影响宿主进程 |
| 用户账号/VAC | HIGH | 未知第三方模块进入 VAC 游戏进程，没有公开安全港，检测细节不透明 |
| 产品合规 | HIGH | 缺少 Valve/Dota 明确授权；“别人能用”不是许可证明 |
| 隐私/公平性 | LOW（设计边界内） | 方案不读内存、不取隐藏信息、不自动操作，但这不能消除进程注入本身的风险 |

**Third-party In-Process Overlay risk：HIGH**

## 5. 路线比较

| 路线 | Windowed | Borderless | 真 FSE | 进入 Dota 进程 | 当前建议 |
| --- | --- | --- | --- | --- | --- |
| Electron / Native topmost HWND | 可行 | 已实测可行 | 通常不可见 | 否 | 保留作调试/降级，不再作为主路线 |
| DirectComposition 独立 HWND | 可行 | 可行，依赖 DWM/flip 状态 | 不可靠 | 否 | Borderless 安全备选 |
| Xbox Game Bar Widget | 受系统支持 | 受系统支持 | 由系统能力和游戏模式决定 | 不是自有 DLL 注入 | 可作为未来合规替代研究 |
| 自有 In-Process DX11 renderer | 理论可行 | 理论可行 | 理论最有机会 | **是** | 只准在自有 Harness；Dota 暂停 |
| Steam Overlay | 已成熟 | 已成熟 | 已成熟 | Valve 自有模块 | 不能被第三方借用为通用承载层 |

**External HWND 作为最终主路线：NO**  
**External HWND 作为安全 fallback/debug：YES**

## 6. 推荐的候选架构（Gate 之后的设计，不进入 Dota）

候选产品结构是“外部主程序 + 极薄 renderer + 同用户 IPC”，先只在自有 Harness 运行：

```text
Dota Scout Desktop / Controller
  - 设置、翻译、OCR、网络、日志、生命周期管理
  - 不依赖游戏内存
                |
        same-user named pipe
                |
DX11 Test Harness.exe (我们拥有的宿主)
                |
  DotaScoutOverlayRenderer.dll
  - 由 Harness 正常 LoadLibrary/链接，不做远程注入
  - 获取 Harness 提供的 IDXGISwapChain / ID3D11Device
  - 在 Harness 调用 Present 前绘制透明文字/面板
```

重要边界：

- renderer 不访问网络，不做 OCR/翻译，不枚举或读取宿主游戏对象；
- renderer 只接收 `show/hide/position/opacity/text` 白名单消息；
- 外部 Controller 崩溃可重启；renderer 位于宿主进程内，**它崩溃仍可能带崩宿主**，不能虚构“完全隔离”；
- 任何未来 Dota 适配都需要单独的 Valve 合规 Gate、代码签名、版本兼容和用户明确确认。

## 7. DX11 Test Harness 设计

### 7.1 目标

不用 Dota、Steam 或第三方 DLL，验证：

1. D3D11 渲染状态能被安全保存/恢复；
2. Overlay 能在同一 swapchain 的最终帧中透明合成；
3. Windowed、Borderless、Harness 自有 Fullscreen 切换时正确处理资源；
4. `Present` / `ResizeBuffers` / device-lost 生命周期可重复；
5. IPC、显示隐藏、透明度和性能预算可测。

### 7.2 组件

#### `DotaScoutDx11Harness.exe`

- 自建 Win32 窗口、D3D11 device、immediate context、DXGI swapchain；
- 绘制运动背景、文字和鼠标目标，方便观察叠加和输入延迟；
- 提供 Windowed、Borderless、Fullscreen 三种测试模式；
- 主动调用 renderer 的稳定 C ABI，不做 hook；
- 可模拟 `WM_SIZE`、DPI 切换、swapchain 重建、device removed。

#### `DotaScoutOverlayRenderer.dll`

第一阶段建议 C ABI：

```text
DSO_Initialize(swapChain, hostWindow)
DSO_RenderBeforePresent()
DSO_BeforeResizeBuffers()
DSO_AfterResizeBuffers()
DSO_SetState(versionedState)
DSO_Shutdown()
```

实现原则：

- 通过 Harness 提供的 `IDXGISwapChain` 获取同一 D3D11 device/context；
- 为 backbuffer 创建 RTV；
- 使用 alpha blend 绘制最小文字/矩形；
- 绘制前保存会被修改的 D3D11 pipeline state，绘制后完整恢复；
- `ResizeBuffers` 前释放所有 backbuffer 引用，之后延迟重建；
- 不创建独立 topmost 窗口，不接收鼠标，不激活窗口；
- 默认隐藏；IPC 断开时 fail-closed（停止绘制）。

#### `DotaScoutOverlayBroker.exe` / 现有桌面主程序

- renderer 外部的重逻辑进程；
- 命名管道：`\\.\pipe\DotaScoutOverlay-{session}-{pid}`；
- ACL 限制为当前用户/会话；
- length-prefixed、带版本号的 UTF-8 JSON 或固定二进制结构；
- 严格大小上限、频率限制、消息白名单；
- 不把任意命令、文件路径、脚本传进 renderer。

### 7.3 IPC 最小消息

```json
{
  "version": 1,
  "sequence": 42,
  "visible": true,
  "opacity": 0.82,
  "anchor": "top-right",
  "marginX": 24,
  "marginY": 90,
  "lines": ["DOTA SCOUT HARNESS TEST"]
}
```

renderer 只保留最后一个完整状态，不在 render thread 阻塞等 IPC；Broker thread 解析并原子交换状态快照。

### 7.4 性能/稳定性验收目标

这些是 Harness 目标，不是当前实测成绩：

- 隐藏时：零 draw call、零每帧分配、无额外 Present；
- 显示时：不创建额外渲染循环，只随宿主帧绘制；
- Overlay CPU 提交：p95 小于 0.20 ms；
- Overlay GPU 时间：p95 小于 0.20 ms（1440p、单面板基准）；
- `ResizeBuffers` 连续 500 次无泄漏/崩溃；
- 模式切换 100 次无黑屏、设备引用泄漏；
- Broker 反复退出/重连不影响 Harness；
- 输入：normal mode 不注册鼠标 hit-test，不改变宿主焦点。

### 7.5 测试矩阵

| Test | 验收 |
| --- | --- |
| Windowed | 内容位于同一最终帧，透明正确 |
| Borderless | Overlay 稳定、无额外 HWND、无鼠标卡顿 |
| Harness Fullscreen | Overlay 在 Harness 自身全屏 swapchain 可见 |
| Resize | RTV 正确释放/重建 |
| DPI 100/125/150/200% | 位置和文字尺度正确 |
| Device recreate | renderer fail-closed 后恢复 |
| IPC disconnect | Overlay 自动隐藏，宿主继续运行 |
| State restoration | Harness 背景渲染不被 blend/scissor/shader 状态污染 |
| Performance | 记录 CPU/GPU p50/p95/p99，不凭肉眼宣称 |

## 8. 分阶段开发计划

### Stage A — Research / Gate（本轮）

- [x] 建立 Git baseline
- [x] 确认当前 Dota 为 DX11
- [x] 确认小黑盒/Steam/NVIDIA 模块的公开加载事实
- [x] 尝试外部 PresentMon；因 Windows 权限未获得 present model
- [x] 完成 Valve/VAC 公开证据审查
- [x] 给出 Gate：不进入 Dota

### Stage B — Safe Harness（需要用户确认后）

- [ ] 实现 DX11 Harness
- [ ] 实现 renderer 的显式宿主接口
- [ ] 实现同用户 IPC
- [ ] 跑 Windowed/Borderless/Harness Fullscreen 自动测试
- [ ] 输出性能和稳定性报告

### Stage C — Dota Integration Gate（当前禁止）

进入条件必须至少包括：

1. Valve/Dota 官方书面许可、官方 SDK，或同等可信且可引用的授权依据；
2. 明确允许的加载/呈现方式及签名/分发要求；
3. 不读取 Dota 内存、不抓隐藏数据、不自动操作的可审计实现；
4. 用户再次明确授权进入该阶段。

当前条件不满足，**不得实现 Dota loader/injector/hook**。

## 9. Git Baseline

- 状态：**DONE**
- Commit：`1e5010b baseline: pre in-process overlay research`
- Tag：`pre-inprocess-overlay`
- Tag message：`Baseline before in-process overlay research`
- `.gitignore` 已排除构建输出、EXE/PDB 和 NativeOverlay NuGet packages，避免把二进制产物混入基线。

## 10. 最终决策表

| 项目 | 决策 |
| --- | --- |
| Current evidence: `heybox-overlay-x64.dll` | CONFIRMED LOADED |
| Dota Renderer | DX11 CONFIRMED（当前进程） |
| Present / Swapchain | UNKNOWN（ETW 权限不足，不猜测） |
| Steam architecture | Valve 官方 in-process hook/injection + render API integration |
| Third-party in-process risk | HIGH |
| Recommended architecture | External controller + thin DX11 renderer + same-user IPC，先仅自有 Harness |
| External HWND main route | NO |
| In-process PoC in Dota | NO |
| In-process PoC in our Harness | YES，需用户确认 Stage B |
| Git Baseline | DONE |

## NEXT STEP

**用户确认后，只实现 Stage B：独立 DX11 Test Harness + 由 Harness 正常加载的 renderer；不加载进 Dota。**

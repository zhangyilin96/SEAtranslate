# 当前比赛十人身份自动识别调研

更新：2026-08-17

## 结论

当前独立 Electron 版没有经过验证、可稳定取得普通天梯当前十名玩家 Account ID 的方案。因此 Match Scout 正式状态必须显示“自动识别尚在技术验证”，不得显示 LIVE 数据，也不得默认加载 Demo。

## 方案对比

| 方案 | 能拿到什么 | 时机 | Key / 前置条件 | 稳定性与规则 | 实测 |
| --- | --- | --- | --- | --- | --- |
| Steam Web API / OpenDota | 已知 ID 后的玩家资料与历史比赛 | 历史/赛后为主 | Steam API 部分接口需 Key；OpenDota 基础接口无需 | 没有普通客户端当前十人 roster 接口 | 已验证历史查询；未发现当前十人接口 |
| Dota GSI | 普通玩家视角下的本人 ID、英雄和比赛状态；观察者视角可有完整玩家数据 | 游戏运行中 | 本地 cfg 与 `-gamestateintegration`；无需 Steam API Key | Valve 客户端主动推送，数据范围由 Valve 控制；普通玩家视角不足以取得十人 | 本机尚无 GSI 配置；未进行真实 Dota 对局实测 |
| Overwolf GEP roster | Strategy Time 后十人的 `steamId/name/teamId/heroId/role` | Strategy Time 起 | Overwolf 平台、注册应用、构建签名 | 官方文档明确限制选人早期身份；可行性最高但改变分发架构 | 当前项目未集成，未实测 |
| 控制台 `status` / 日志 | 连接状态、人数、名字、延迟等 | 连接服务器后 | 控制台或日志配置 | 未找到稳定输出十个 Account ID 的当前证据；历史做法受 Valve 限制调整影响 | 本机没有可用 server_log / GSI 日志 |
| 屏幕 OCR | 玩家显示名、英雄、槽位 | UI 显示后 | 屏幕截图 | 名字非唯一且可能无法映射公开资料；不能作为可靠 ID 来源 | OCR 引擎已验证；身份反查未通过可靠性验证 |
| Game Coordinator 非官方客户端 | 理论上可请求部分 GC 状态 | 登录 Steam/GC 后 | Steam 会话与未稳定文档化协议 | 逆向协议、易变化，规则和维护风险高 | 未实现，不作为产品路线 |

## 方案 A：建议验证 Overwolf roster

- 信息来源：Overwolf Dota 2 Game Events Provider。
- 获取时机：`DOTA_GAMERULES_STATE_STRATEGY_TIME` 以后；此前 `steamId` 和 `name` 按其文档会为空。
- Steam API Key：获取 roster 本身不需要；随后查历史数据仍走 OpenDota。
- 玩家公开比赛数据：不影响取得 roster，但会影响 OpenDota 历史分析结果。
- Valve 规则：Overwolf 文档明确描述 Valve 对选人阶段资料的限制；必须遵守 Strategy Time 边界。
- 当前结果：未集成、未在真实对局实测，不能标记完成。

## 方案 B：屏幕识别 fallback

可以识别英雄、玩家显示名和位置，但无法可靠把非唯一显示名映射成 Account ID。它只能辅助 `Player → Hero → Position`，不能替代身份来源。当前不自动生成 Scout Report。

## 方案 C：当前产品行为

- 正式 Match Scout 首页显示等待状态。
- 明确写明“当前版本尚无法自动识别全部玩家身份”。
- 自动扫描按钮 disabled，并显示“技术验证中”。
- Demo 只能显式进入，页面永久显示 `DEMO / SAMPLE MATCH`。
- 手动十人输入只放在 `Settings → Developer / Debug`，产出标记为 `DEBUG / MANUAL INPUT`。

## 主要来源

- Overwolf Dota 2 GEP：https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/dota-2/
- Dota2GSI：https://github.com/antonpup/Dota2GSI
- Steam Web API：https://steamcommunity.com/dev
- Dota GSI 示例：https://github.com/xzion/dota2-gsi

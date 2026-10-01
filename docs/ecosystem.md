# DSH 生态全景(独立调查版 I:分层框架)

> 2026-10,一手证据:本机 0.2.0-rc.2 实测(289 条目 dump)、官方文档站、官方 monorepo packages 树、
> awesome 清单全文+TOP200 星数、npm registry 月装机量。生态位分析见文末(II)。

## Layer 0 · 技术基座
**Cordis**(DI 插件框架,Koishi 血统)+ TypeScript/Node。一切能力的挂载单位是 `apply(ctx)`,
生命周期、依赖注入、热重载全由它托底。

## Layer 1 · 官方微内核 + 包族(deepseek-ai monorepo)
官方仓库 `packages/` 下 **53 个能力域目录**:

```
core(工具注册表/事件瀑布) fs sandbox shell ssh terminal storage session
session-query llm skill goal schedule todo plan workflow jobs subagent
mcp preset ptc-runtime compaction context guard hooks identity telemetry
webhook browser-use computer-use document deliverables sdk api host boot
bundle(client/desktop profile 组合) client web experimental extensions ...
```

- 每域内部按**能力三角色**拆包(definition/provider/consumer,如 dsh-shell/dsh-bash-local/dsh-tool-bash)
- seam 包已上 npm(`@deepseek-ai/dsh-fs`、`dsh-sandbox` 等)
- `packages/schedule` 在 master 上存在(未进本机 rc.2 组合)——原生调度是官方路线既定能力
- 文档站双语;`.agents/notes/` 架构决策笔记文化;微内核声明:每个产品功能=文档化扩展点上的监听器

## Layer 2 · 宿主形态(同一内核,多种外壳)
官方桌面 App(Electron,desktop profile 独占管理)/ `dsh web` / headless / 第三方壳(bruc3van
dsh-desktop 托盘常驻)/ TUI / 移动端(mobile-apk、pocket、dsh-mobile)/ 协议桥(ACP、pi2dsh、IM)。

## Layer 3 · 插件形态学(六种生物)
| 形态 | 载体 | 例 |
|---|---|---|
| host 插件 | TS `apply(ctx)` | dsh-cron、dsh-anima(我们) |
| client 插件 | 浏览器半边(host.js+client.js,`dsh.client.platform`) | webui-market、better-sidebar |
| skill | Markdown(section+工具注册) | hello-dsh 22 实例 |
| 皮肤/桌宠 | 纯视觉层 | deep-whale、dsh-pet |
| 场景包 pack | 组合预设 | dshbase /packs/ |
| MCP 桥 | 每服务器一插件 | BrowserSkill 接入 |

## Layer 4 · 分发与市场
npm + `github:` 源双通道;**awesome 清单**(14,141 仓库,每日快照+人工审核,market.json 规范)
→ 目录站(dshbase 7,797 个、dshmarket)→ 壳内市场插件(webui-market、dsh-market、plugin-hub、
safe-market)。安装=pnpm 进 profile+bundles 注册;热挂载仅 web,desktop 要重启。

## Layer 5 · 质量与安全层
dshbase 实测徽章(L1 装/L2 载/L3 跑,CI 真装真启);市场插件试装验证(临时 DSH_HOME 真启动);
safe-market 先审查再安装;undo-savepoint 后悔药(已官方收编内置);批判文化(橙皮书)。

## Layer 6 · 开发者工具链
官方文档站 → hello-dsh → dsh-handbook → create-dsh-plugin → dsh-plugin-skill →
`--patch`+HMR 开发回路 → 仓库测试策略(组装覆盖强制)。

## 框架空洞(预测位)
一手证据中未见统一的"社区标准库/共享基座"层——生态靠官方 seam + awesome 目录约定 +
插件自带实现粘合。若存在"std",最可能补在官方 seam 与万千插件之间。

---

# II · 生态位分析(星数×装机量交叉)

> 数据:TOP200 星数(2026-09-29 快照) + npm 月装机(2026-08-31~09-29)。
> 星数=注意力,装机量=实际种群数量,两者分离本身就是生态信息。

## 种群数据锚点

**装机量梯队(npm/月)**:
```
dsh-pet          24,561  ← 装机王(870★),快乐物种统治实际使用
dshbase-catalog   5,116  ← 目录插件(让agent自己找插件装)
undo-savepoint    2,451  ← 后悔药(已被官方收编内置)
meow-smooth       2,195  ← 移动端体验
dsh-tui           1,836  ← 终端形态
dsh-im              989  ← IM 桥
awesome-dsh-plugin  649  modsearch 448  create-dsh-plugin 449
dsh-cron            347  ← 我们选的闹钟,冷门器官!
```
官方 seam 包(@deepseek-ai/dsh-fs 等)月下载 100~188 万——但那是**随宿主分发的依赖下载**,
与社区手动装机差三个数量级:官方是"环境",社区是"生物"。

**注意力梯队(星数)**:routing-suite 6999 → modlens 4072 → better-sidebar 3895 →
dsh-TUI 3802 → deep-whale 2279 → …幂律长尾,#100=128★,#200=64★。

## 七个生态位

| 生态位 | 代表物种 | 特征 |
|---|---|---|
| **关键种 keystone**(底座) | better-sidebar(3895★,三方扩展寄生于它)、routing-suite(注入器,改宿主全身代谢)、TUI 系 | 别的物种依赖它们才能活;动它们=生态地震 |
| **顶级捕食者**(能力霸主) | modlens(视觉,4072★)、dsh-im(9渠道,1544★) | 一己吃掉整个能力域,后来者难竞争 |
| **传粉者**(通道/迁移) | pocket/remote 系(≥5个物种)、chat-import(25源)、pi2dsh、ACP | 与外部生态交换能量;物种数多、同质竞争 |
| **分解者**(生态清道夫) | 市场系(webui-market/safe-market/plugin-hub)、undo-savepoint、api-relay-audit、dshbase 实测 | 维持生态健康;被官方收编概率最高 |
| **共生生物**(依附宿主) | 皮肤系(deep-whale/transparent/wallpaper…)、桌宠系(pet/whale-girl/whale-musume)、用量仪表系(≥6个) | 装了就常驻;**装机量远超星数**——用户基本盘由情绪价值驱动 |
| **r-策略长尾** | #100~200 全体;特征化:记忆位 | 快速出生快速死亡;**记忆是竞争最烈且未收敛的前沿** |
| **官方环境** | 53 包族+seam | 不是物种是气候;收编现象存在(undo 内置、schedule 在路上) |

## 对 anima 的四条生态位推论

1. **记忆位混战确认**:TOP200 里记忆物种 ≥12 个(mem9/mnemon/memory-evolve/mneme/meow-memory/
   memento/noema/auto-memory/project-brain/StrataGate…)——没人收敛。选 mnemon 是押注,
   **必须留 provider 化的切换缝**,谁赢跟谁
2. **任务位几乎空置**:taskboard(330★)面向工程评审;个人任务+人情权重无人占——
   我们的"周期人情任务"生态位确认空缺,且该位竞争压力极小
3. **dsh-cron 是冷门器官**(347装机/月):好处是无竞争,风险是维护断档+官方 `packages/schedule`
   正在路上——大概率重演 undo-savepoint 被收编的剧本。**计划要有弹性**:官方 schedule 一到,
   我们迁到原生,闹钟语义(闹钟就是闹钟)不变
4. **情绪价值是基本盘**:装机王是桌宠(24.5k/月),不是工具。anima 的女仆人格+视觉层
   不是锦上添花,是生态已验证的用户入口——`阶段7人格` 的优先级可以上调

---

# III · dsh-std 验证(独立框架对照实验)

> 规则:先独立调查画框架(I/II),再用 dsh-std 检验。以下为对照结果。

## dsh-std 事实([Yan-Zero/dsh-std](https://github.com/Yan-Zero/dsh-std),133★,2026-08 创建)

**社区通用互操作协议标准**,不是工具库:

- `@dsh-std/core` = **元协议**(协议的协议):只定义协议如何声明(`apiVersion+kind`)、
  参与者如何申报能力(`requires`/`supports`)、纯函数协商出兼容报告。零业务字段,类比 USB 规范
- 其上是独立版本化的**领域协议**:connection/command/tool/model/presentation/session/agent
- **适配器当减震器**:`@dsh-std/adapter-dsh` 单点吸收上游 DSH 破坏性变更,插件只对协议编程
  → 一次编写,在 TUI/Web/SSH 远程/headless 守护进程全形态运行(facet 按需激活)
- 静态清单(dsh-plugin.json)让市场/宿主**不跑一行插件代码**即可算出兼容性
- Profile 层由生态项目承载(如 [T-Auto/dsh-ecosystem-spec](https://github.com/T-Auto/dsh-ecosystem-spec) 的 TUI Profile)
- 状态:**early drafts**,自愿采纳,声明符合即须过一致性套件
- 周边信号:第三方伞仓库按"Pi / DSH官方 / DSH-Store准入 / dsh-std协议"四契约校验自有插件;
  又发现两个此前未收录的商店(dshplugin.store、dsh.deepseek404.com)

## 对照打分

| 预测 | 结果 |
|---|---|
| "若存在 std,位置在官方 seam 与万千插件之间" | ✅ **位置命中**:dsh-std 正是上游核心与下游生态之间的解耦层 |
| "性质=共享原语/工具库" | ❌ **性质错了一半**:不是 stdlib,是**互操作协议+能力协商标准**(USB,不是 lodash) |
| 完全没看到的 | ①"宪法运动"生态位:多套契约并存竞争(Pi ABI/DSH-Store 准入/dsh-std/ecosystem-spec)——标准化政治是独立生态位;②宿主矩阵碎片化(TUI/Web/headless × 各壳)是 std 的第一驱动力,我 Layer2 只列了形态没看出它们互不兼容这个痛点 |

## 对 anima 的推论

1. **现在不押注**:early drafts + 单人维护 + 133★,还不是关键种;dsh-anima v1 直接用官方
   `ctx.tools` 规范(官方文档即事实标准)
2. **保持同构直觉**:我们 V4.1 的 Agent Gateway(契约非软件)与 dsh-std 元协议是同一种本能——
   若 dsh-std 收敛,dsh-anima 的工具面加一层 adapter 即可迁移,facet 模型对"女仆会话×微信×
   headless 多形态"天然对口
3. **观察清单+1**:dsh-std / dsh-ecosystem-spec / Pi ABI 三者的收敛进度,季度复查一次

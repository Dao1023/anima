# 社区大调查与完整可行方案(V4.2)

> 2026-10 六路并行深挖 DSH 插件生态(14141 个收录仓库),对照我们的数字生命 V4.1 设想逐项核对。
> 结论先行:**架构从"自建 daemon 为核心"翻转为"社区组装 + 一个自建插件"**,核心 IP(双驱动档案、判定协议、人格)反而更纯粹了。

## 一、调查结论总表(对照我们的设想)

| 我们的设想 | 社区答案 | 采纳 | 理由 |
|---|---|---|---|
| 常驻宿主/守夜 | **dsh-desktop**(托盘常驻,关窗任务照跑,崩溃自动重启) | ✅ 装 | 守夜需求消失:DSH 7×24 在托盘里,daemon 的存在理由被抽掉大半 |
| 计时器/唤醒 | **dsh-cron**(五字段 cron + 一次性 at;**coldWake 冷唤醒持久会话**;错过合并为最新一次;cron/settled 事件暴露给其他插件) | ✅ 装 | coldWake 就是我们 headless 适配器想做的事,且无子进程 ACL 摩擦;合并补跑语义与我们设计一致 |
| 独立编码任务 | dsh-automation(权限白名单干净,fail-closed) | ⏸ 缓 | 女仆场景用不上它的"跑测试"式任务;以后做无人值守编码再装 |
| 跨会话记忆 | **dsh-mnemon**(三层记忆,每回合自动注入用户画像;**provider-sdk 可把我们的 SQLite 档案桥接成记忆源**;默认全本地) | ✅ 装 | 唯一"本地默认+自动注入+可桥接档案"的选型;mem9 上云、evolve 与自建撞车、memtrace 是代码图谱 |
| 女仆人格 | 不整只引入 | 🎨 借范式 | dsh-pet 的"人格=数据包(voice.json)+结构化信号唤醒台词+好感度挂工作轮次";鲸鱼娘的"关怀四触发器+15min冷却";tavern 的"MVU持久人格变量"——人格判定留在自建,社区只取工程范式 |
| 手机触达 | **dsh-im**(微信/飞书等9渠道;一个聊天≈一个会话,**天然适配女仆常驻聊天窗**) + **Bark** 锁屏保底 + **dsh-pocket** 完整驾驶舱 | ✅ 装 | "女仆开口→微信送达→用户回复进同一会话"闭环成立;通知类插件(dsh-notification)弃用 |
| 任务档案 | 无等价物 | ✋ 纯自建 | **确认:start 驱动(越久没做越重要)、log 重要性公式、周期人情任务、重要性→闹钟重排,社区完全空白**——这是我们的差异化全部所在 |
| 插件开发 | **hello-dsh**(dsh-first-plugin 骨架:ctx.tools.register 注册原生工具)+ dsh-handbook | ✅ 用 | 我们的插件形态有现成模板;注意 22 实例全是技能,SQLite 工具插件是生态空白,得自己长 |
| 安全网 | **dsh-undo-savepoint**(配置/插件快照回滚,SAFE MODE) | ✅ 先装 | 装任何社区插件前先装它;**必须把 SQLite 档案目录排除出消息级撤销跟踪**(避免两套回滚机制叠在同一个文件上) |

## 二、社区缺失 = 我们的护城河(六路确认)

1. **周期人情任务**:"每3周联系家人,越久没做越重要"——所有 recurrence 都是日历式到期克隆,人情权重不存在
2. **双驱动模型 + log 公式**:社区排序要么静态 priority,要么每次调 LLM 的"AI智能排序";确定性、可解释、随时间单调增长的重要性公式没有
3. **任务重要性 → 唤醒时机耦合**:没有插件把"这事多急"变成"下次闹钟设几点"——女仆的重排闹钟整条链路空白
4. **OS 级睡眠记账**:所有插件要求宿主活着;睡眠态只记账醒后补课、离线记忆整合,无人做
5. **任务驱动的人格**:好感度/心情全由点击或 token 消耗驱动,没有由"任务完成情况/拖延天数"驱动;严肃模式在生态里完全缺席
6. **定时器直推**:通知类全挂"回合完成"事件,无"到点直接发消息"的一等公民出口(需自研薄胶水或走 dsh-im webhook)

## 三、V4.2 架构(完整方案)

```
┌──────────────────────────────────────────────────┐
│ dsh-desktop 常驻托盘(7×24 宿主,守夜者)              │
│                                                    │
│  dsh-cron ──coldWake──▶ 女仆常驻会话(微信绑定)       │
│    ↑cron工具            │                          │
│    │                    ▼                          │
│  task-brain skill ◀─ 🧩 dsh-anima 插件(自建,唯一)│
│  (判定协议/人设/字条)      task_query / task_update   │
│    │                    / alarm_reschedule         │
│    │                    ▼                          │
│  dsh-mnemon ◀── provider 桥 ── SQLite 双驱动档案 ✋   │
│  (画像每回合注入)             (核心IP,继续自建)        │
│                                                    │
│  dsh-im:微信聊天窗(双向) Bark:锁屏保底               │
└──────────────────────────────────────────────────┘
旧 daemon(timers.py/consciousness.py)→ 退役为实验资产/离线兜底
```

**职责重划**:
- 闹钟 = dsh-cron(女仆用 cron_add/update/remove 管理自己的闹钟,重排闹钟 = cron 工具调用)
- 醒来后的判断 = task-brain skill(三条判定协议不变,人设不变)
- 档案读写 = dsh-anima 插件(SQLite + log 公式 + 周期克隆,核心 IP 一个字不改,只是从 REST 外壳换成原生工具外壳)
- 记忆 = dsh-mnemon(画像自动注入 + 档案 provider 桥)
- 节律四态 → 语义平移:休眠=退出客户端;睡眠=coldWake 关+仅心跳;待机/工作=cron 任务密度差异(具体节奏靠 cron 安排表达,不再需要自建状态机)

## 四、施工路线图(每步独立可验收)

| 阶段 | 动作 | 验收标准 |
|---|---|---|
| **0 保险** ✅ | **天生满足**:官方 harness 内置 undo-savepoint(本会话实测 undo_list 可用,快照自 10-01 起存在)。手动安装的一份因可能造成 bundles 重复条目已回退。档案保护:阶段 3 把库放 ~/.anima/(工作区外) | SAFE MODE 可用 |
| **0.5 开发规范** ✅ | 已读一手官方文档(见 [dev-spec.md](dev-spec.md))。纠正:开发迭代=源码 checkout+`--patch` overlay+官方 HMR,与市场热挂载(安装通道)无关;工具规范/能力分层/cron 官方模式均已消化 | dev-spec.md 为准 |
| **0.7 生态调查** ✅ | 见 [ecosystem.md](ecosystem.md) + [ecosystem-catalog.md](ecosystem-catalog.md):六层框架/七生态位/Top200 全图鉴/dsh-std 验证。新知:官方 `packages/schedule` 在路上;lowtide(错峰委派)/run2skill(习惯→技能)/auto-review(审批护栏)三个参考物种;情绪价值带=装机基本盘 | 200 物种全录 |
| **1 宿主** | 先观察现官方客户端关窗是否托盘常驻;否 → 装 [dsh-desktop](https://github.com/bruc3van/dsh-desktop)。已装**插件门控中心**(`@noob-stupid/dsh-plugin-console`,原 dsh-plugin-hub):多源市场(500+插件/300+技能,分类搜索) + **框架升级失败自动回滚** + 插件升级门控(按 engines 拦截不兼容版本)——后者正好对冲"rc 阶段 API 破坏性变更"风险 | 关窗后任务照跑;托盘常驻过夜 |
| **1.5 源码 checkout** ✅ | 已完成:`C:\Users\Dao\Code\dao1023\deepseek-harness`(浅克隆 26s,14,104 文件);`pnpm install` + `pnpm run build` 均成功;`pnpm dsh --version`=0.2.0-rc.2、`pnpm dsh web --help` 可用。开发回路就绪:`pnpm run dev:web`(HMR)/`pnpm dsh web --patch <overlay>` | ✅ 源码启动器可用 |
| **2 闹钟** ✅ **原生就有,无需 dsh-cron** | 官方可选 bundle `@deepseek-ai/dsh-experimental-schedule-bundle`(随每次安装携带、默认禁用;插件管理页官方分组「自动化任务」启用)。源码实测能力:`after/at/every/daily/weekly/cron(五字段+IANA时区)`;Host 级持久化,重启保留;**投递时宿主恢复原 Session(含未加载的)→ 冷唤醒内建**;错过只发最新一次(不累积)→ 与我们"错过合并"语义一致;模型工具 `schedule_create/list/update/delete`;`time-context` 每步追加时钟读数。替代:社区 dsh-cron(冷门 347 装机/月)不再需要 | 启用后设一条 2 分钟测试提醒,到点消息进原会话 |
| **3 插件**⭐ **范围缩小** | 写 dsh-anima(hello-plugin 骨架):**只做档案工具** `task_query`/`task_update`(闹钟交给原生 `schedule_*`,原计划的 `alarm_reschedule` 取消),execute 接 SQLite 读事务 + actions 校验;**档案放 `~/.anima/`**(工作区外,回滚够不着) | 会话内模型能查档案、改任务;三层测试法(纯函数单测→契约→实机) |
| **4 灵魂** | task-brain skill 改版:闹钟用原生 `schedule_*`,档案用 dsh-anima 工具 | 一次唤醒内完成"读字条→查档案→判定→说话→重排" |
| **5 触达** | dsh-im 微信通道 + Bark 兜底 | 手机收到女仆的话,回复进同一会话 |
| **6 记忆** | dsh-mnemon + 档案 provider 桥(**13 物种混战位,provider 化留切换缝**) | 跨唤醒画像连续;档案事实可被召回 |
| **7 人格** ⬆ | **优先级上调**(生态实证:情绪价值=装机基本盘)。人格变量入 SQLite:可爱/严肃/好感度,由任务完成情况驱动;借 dsh-pet 的 voice.json 数据包范式 + tavern 的 MVU 变量;解剖 lowtide(节律)与 run2skill(沉淀) | 连续敷衍→严肃模式实测触发 |
| **8 自治护栏**(新增) | 女仆长时间无人值守前的安全层:参考 auto-review(第二模型审批)、approval-gate(Flash 预判) | 危险操作必经门,普通操作免打扰 |

**风险清单**:rc 阶段 API 有破坏性变更(依赖锁 `>=0.1.2-rc.1 <0.2.0`);Windows 是生态第一痛点;dsh-im 微信走备案 AI 卡片,推送频率受微信管控;插件无第一类持久化存储(自带 SQLite 反而干净);dsh-desktop 每月更新一次断点可接受。

## 五、与旧设想的差异声明

- 意识层适配器(headless 子进程)退役——dsh-cron coldWake 在插件层做同样的事且无 ACL 摩擦;consciousness.py 的 stdin 传输、DSH_PERMISSION_MODE 注入等经验沉淀在 git 历史
- daemon 的睡眠记账/补课语义部分被 dsh-cron"错过合并"覆盖;纯 OS 级兜底场景(整个 DSH 下线)接受裸奔,或后期再评估一个极小守夜脚本
- timers.py 的引擎语义(once/interval/跳跃/合并/补课)平移为 cron 语义 + skill 内的重排决策,测试资产保留作参考

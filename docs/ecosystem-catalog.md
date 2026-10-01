# DSH 生态全图鉴(Top 200 完整归类)

> 数据:awesome-dsh-plugin TOP200(2026-09-29 快照)。星数=注意力;分组按生态位而非功能标签。
> 配套阅读:[ecosystem.md](ecosystem.md)(分层框架/生态位/验证)。★=星数。带 ⭐ = 对 anima 直接相关。

## 1 · 模型与路由(25 个物种——最大的单一生态位)

模型从哪来、怎么选、怎么省钱,是生态第一焦虑。

| # | 物种 | ★ | 一句话 |
|---|---|---|---|
| 1 | dsh-routing-suite | 6999 | 榜首:运行时注入器+任务感知路由(实测覆盖P1-P23) |
| 37 | dsh-our-free-model | 417 | 免登录免Key用 Muse Spark/MiMo 等前沿模型 |
| 40 | dsh-plugin-subscriptions | 406 | OAuth 接入 ChatGPT/Claude/Grok 订阅当模型 |
| 43 | dsh-commandcode-provider | 350 | Command Code 服务商接入+套餐感知选型 |
| 56 | dsh-workbuddy-connect | 234 | WorkBuddy 桌面 App 的模型零配置接入 |
| 82 | dsh-super-injector | 165 | routing-suite 的注入器组件独立维护 |
| 83 | dsh-reasoning-effort | 164 | Codex 风格思考强度滑块 |
| 99 | dsh-codex-connect | 128 | ChatGPT OAuth 用 codex 模型+生图 |
| 124 | dsh-AuthInOne | 104 | Provider/Auth 登录一站式 |
| 125 | dsh-codex-subscription | 104 | Codex 订阅接入(Web原生) |
| 144 | opencode2dsh | 96 | OpenCode Zen 免费模型 |
| 153 | dsh-agy-link | 89 | Google Antigravity(agy CLI)模型 |
| 169 | dockyard-dsh | 79 | macOS 原生账号池+provider |
| 182 | dsh-opencode-go | 73 | opencode-go 套餐适配 |
| 186 | rapid-mlx-dsh-provider | 70 | 原生 Rapid-MLX provider |
| 187 | dsh-codex | 70 | ChatGPT 订阅经 Codex 接入(注:dsh-std 作者) |

**观察**:头部是"破甲"(绕过限制),腰部是"订阅搬运"(用已有订阅不买API),说明用户最大痛点是**模型成本**。官方 llm-deepseek/llm-pi-ai 已是默认,此位全是补官方没做的渠道。

## 2 · 记忆(13 个物种——竞争最烈、无人收敛)⭐

| # | 物种 | ★ | 路线 |
|---|---|---|---|
| 12 | mem9 | 1218 | 服务端记忆(云/自host Go服务) |
| 29 | memtrace-public | 488 | 代码库双时态知识图谱(Rust,零LLM) |
| 35 | dsh-mnemon | 423 | 三层记忆控制面+provider SDK(我们的选型) |
| 45 | dsh-memory-evolve | 341 | 五轨记忆+自我进化全家桶 |
| 51 | dsh-memory | 282 | 白箱AGI:元认知+知识飞轮 |
| 97 | mneme | 131 | "会做梦的记忆"(离线整理) |
| 100 | dsh-noema | 128 | durable 可检视长期记忆 |
| 102 | dsh-meow-memory | 127 | 七层 SQLite 结构 |
| 103 | dsh-memento | 126 | 有界分层+审批门+审计 |
| 129 | dsh-project-brain | 103 | 项目架构记忆 |
| 140 | StrataGate-AgentMemory | 99 | 时间衰减分层(近详远简) |
| 156 | dsh-auto-memory | 88 | 联想式系统提示词召回 |
| — | (未入榜还有数个) | | |

**观察**:13+ 物种、路线各异(云/本地/图/分层/审批),**零收敛**——印证 ecosystem.md 推论:押谁都要留切换缝。anima 关联:档案本身是记忆的一种(任务记忆),与这些物种(对话记忆)互补不冲突。

## 3 · 界面底座与体验(24 个物种)

| # | 物种 | ★ | 一句话 |
|---|---|---|---|
| 3 | DSH-better-sidebar | 3895 | 关键种:开放侧栏底座,三方扩展寄生 |
| 4 | dsh-TUI | 3802 | 官方公众号收录的终端形态(npm 1836/月) |
| 18 | dsh-worktable | 686 | 项目管理台+可停靠分屏+控制室 |
| 19 | working-activity | 661 | 工作状态动态线条 |
| 50 | dsh-tianshu-tui | 284 | 自研ANSI渲染TUI+TDD工作流 |
| 61 | dsh-popout-sidebar | 209 | 侧栏弹出独立标签页 |
| 68 | seektty | 197 | Claude Code 风终端(Win/mac/linux) |
| 70 | gal-view | 193 | 会话界面变 galgame 界面 |
| 123 | dsh-web-mobile | 105 | 窄屏适配 |
| 127 | dsh-codex-ui | 103 | Codex 风侧栏+会话树+全局搜索 |
| 130 | dsh-strata | 102 | 转录滚动条会话地层学 |
| 148 | dsh-talk-map | 94 | 会话卡片地图 |
| 149 | dsh-status-rotator | 93 | 1063条梗的状态行 |
| 150 | dsh-desktop | 92 | bruc3van 安全桌面壳(常驻托盘) |
| 151 | dsh-win32 | 92 | 原生 Windows 修复诊断 |
| 174 | dsh-smooth-stream | 76 | 流式渲染+滚动优化 |
| 181 | dsh-better-display | 73 | 更平静的阅读视图 |
| 191 | dsh-claude-ux | 69 | Claude 风中文风控+对话自主 |
| 96 | dsh-annotation | 131 | 选中批注随消息发送 |
| 27 | dsh-at-file | 512 | @文件引用(官方已内置,此为增强) |
| 108 | DSH-EasyRewrite | 120 | 气泡内联编辑+撤回 |
| 172 | Martty | 78 | Rust TUI(ACP客户端)+自我改进 |
| 61' | (输入类并入) | | |

**观察**:界面位拥挤但层次分明——底座(侧栏/TUI)是关键种,体验微调(r/stream/显示)是 r-策略。**TUI 生态独立成系**(3个物种),佐证 dsh-std"宿主矩阵碎片化"痛点。

## 4 · 皮肤美学(12 个物种)与 5 · 桌宠陪伴(9 个物种)——情绪价值带

| # | 皮肤 | ★ | | # | 桌宠/陪伴 | ★ |
|---|---|---|---|---|---|---|
| 5 | dsh-deep-whale | 2279 | | 15 | dsh-pet | 870 (**装机王24.5k/月**) |
| 38 | Transparent-UI | 407 | | 47 | whale-girl | 339 |
| 41 | wallpaper-engine | 396 | | 134 | kun-like-pet | 100 |
| 42 | open-sea-skin | 380 | | 147 | whale-musume | 94 |
| 57 | liang-skin | 223 | | 94 | voice-ai-girlfriend | 132 |
| 69 | dream-skin | 194 | | 24 | dsh-tavern | 554 |
| 120 | theme-endfield | 108 | | 105 | dsh-nexttavern | 120 |
| 135 | custom-skin | 100 | | 115 | dsh-liketavern | 113 |
| 137 | beauty-skins | 100 | | 170 | adult-tension | 79 |
| 163 | beautiCode | 83 | | 112 | dsh-meme | 115(表情包) |
| 180 | endfield-ui | 74 | | | | |

**观察**:皮肤+桌宠+酒馆(tavern系角色扮演)= **21 个物种的情绪价值带**,装机量统治生态(deep-whale 2279★ 是注意力第5)。anima 的人格/视觉层在这个带里有成熟审美范式可借。

## 6 · 通道与远程(13 个物种)⭐

| # | 物种 | ★ | 一句话 |
|---|---|---|---|
| 10 | dsh-im | 1544 | 9渠道IM桥(微信/飞书/QQ/…)——女仆聊天窗选型 |
| 11 | dsh-pocket | 1405 | 手机扫码同屏遥控 |
| 46 | dsh-mobile | 341 | Android App+安全远程 |
| 55 | ds-harness-remote | 241 | P2P端到端加密多端远程 |
| 75 | dsh-bridge | 179 | 多通道远程+微信/QQ通知 |
| 89 | remote-web-gateway | 156 | 扫码远程无需公网IP |
| 114 | dsh-qqbot | 114 | 腾讯官方QQ Bot接入 |
| 126 | dsh-remote(flymysql) | 103 | 多机SSH+21个rw_*工具 |
| 132 | deepseek-harness-mobile | 102 | Kotlin Android伴侣App |
| 197/198 | dsh-remote ×2 | 66 | 公网加密远程/浏览器MFA远程 |
| 63 | dsh-chat-import | 205 | 25+源会话迁移 |
| 199 | dsh-passwords | 64 | 多租户密码网关 |

**观察**:远程通道 6+ 物种同质竞争(传粉者过剩);**IM 桥只有 dsh-im 一家独大**(顶级捕食者)——女仆微信通道押它风险可控。

## 7 · 自动化·调度·权限(10 个物种)⭐

| # | 物种 | ★ | 一句话 |
|---|---|---|---|
| 136 | dsh-automation | 100 | 定时起新会话跑任务(权限白名单干净) |
| 78 | dsh-lowtide | 170 | **错峰任务委派:闲时计划忙时执行**——与女仆节律同思想! |
| 106 | dsh-auto-continue | 120 | 断线自动补"继续" |
| 60 | dsh-auto-review | 215 | 第二模型自动审批 |
| 167 | dsh-approval-gate | 82 | Flash预判+安全自动批准 |
| 84 | dsh-auto-mode | 164 | 安全自动权限 |
| 110 | dsh-permission-rules | 117 | Claude式声明式权限规则 |
| 118 | dsh-run2skill | 109 | 成功会话自动转技能 |
| (—) | dsh-cron | 未入榜 | 五字段cron+coldWake(装机347/月,冷门器官) |
| (—) | (官方 packages/schedule) | | 原生调度在路上 |

**观察**:自动化位物种少但**每个都命中 anima 需求**(低tide的错峰思想=我们的节律;automation的权限边界=女仆的安全形态)。冷门≠不重要,是空位。

## 8 · 编排与多Agent(7) · 9 · 上下文工程(3) · 10 · 观测(3)

| # | 编排 | ★ | | # | 上下文 | ★ | | # | 观测 | ★ |
|---|---|---|---|---|---|---|---|---|---|
| 7 | agent-teams | 1848 | | 9 | dsh-context | 1568 | | 139 | watcher | 99 |
| 53 | agent-team-gui | 281 | | 109 | billion-context | 118 | | 160 | maze | 85 |
| 95 | dsh_workflow | 131 | | 159 | capability-menu | 86 | | 44' | (用量并入16) | |
| 86 | dsh-council | 158 | | | | | | | | |
| 65 | evolve-modes | 199 | | | | | | | | |
| 176 | evolve-in-git | 75 | | | | | | | | |
| 36 | OpenStory | 419 | | | | | | | | |

## 11 · 搜索与信息(6) · 12 · 视觉(4)

| # | 搜索 | ★ | | # | 视觉 | ★ |
|---|---|---|---|---|---|---|
| 22 | modsearch | 572 | | 2 | modlens | 4072 |
| 33 | anysearch-dsh | 436 | | 13 | vision-router | 1128 |
| 54 | dsh-free-search | 279 | | 14 | vision-toolkit | 884 |
| 183 | web-search-pro | 72 | | 155 | dsh-vision | 89 |
| 195 | SpecFusion | 68 | | | | |
| 166 | agent-skills | 83 | | | | |

**观察**:modlens 一家 4072★ 吃掉视觉位(顶级捕食者);搜索位官方已有 web-search-deepseek,社区做免费/多引擎补充。

## 13 · 办公与创作(14) · 14 · 科研金融垂直(13)

| # | 创作/办公 | ★ | | # | 垂直 | ★ |
|---|---|---|---|---|---|---|
| 8 | deepseek-design | 1694 | | 25 | Mimir科研台 | 541 |
| 32 | univer-office | 439 | | 72 | research-report | 189 |
| 26 | dsh-image-gen | 523 | | 73 | industry-research | 185 |
| 28 | dsh-genui | 495 | | 111 | hanai-investment | 115 |
| 52 | dsh-visualize | 282 | | 59 | dsh-trading | 217 |
| 74 | dsh-openpencil | 180 | | 162 | stock-watch | 83 |
| 188 | novel-writer | 69 | | 30 | Invoice-Downloader | 473 |
| 34 | oh-story-dsh | 425 | | 168 | recruiting-copilot | 80 |
| 173 | raw-html | 77 | | 192 | gongwen公文 | 69 |
| 142 | imagegen | 96 | | 128 | ScientificFigureLibrary | 103 |
| 113 | genui(pengyue) | 114 | | 138 | wenshan地理实习 | 100 |
| 71 | oil-creator | 192 | | 39 | Study-Mate | 406 |
| 154 | comfyui | 89 | | 164 | openmaic教室 | 83 |
| 189 | Video-Director | 69 | | | | |

**观察**:垂直位证明 DSH 已溢出编程场景(科研/金融/HR/公文/教育)——**"个人助理"化是生态自然趋势**,anima 顺流而下。

## 15 · 安全攻防(6)

infinite-gen-4(2155★红队)、redteam-model(651)、pentest(565)、api-relay-audit(862)、helm-d(89)、secure-audit(161)。**观察**:安全位星数奇高(第6名是红队工具)——DSH 用户群体画像:技术向、灰度探索多。

## 16 · 计费与用量(9)

cost-meter(348)、usage-stats(168)、usage(117)、damage-pulse(221)、green-meter(141)、control-center(72)、TokenLedger(202)、balance(64)、personal-center(120)。**观察**:与模型位呼应——成本焦虑的第二现场;whale 形象的 damage-pulse 把计费也做成了陪伴。

## 17 · 会话与配置管理(10)

undo-savepoint(167)、rewind(102)+turn-rewind(122)、turn-delete(108)、recall-unread(127)、archive-manager(157)、session-manager(190)、config-manager(135)、skills-manager(175)、skill-mcp-panel(156)+mcp-panel(193)、network-settings(121)、preset-plus(146)、gitbash-preset(129)。

## 18 · 生态桥与技能包(9)

pi2dsh(207)、plugin-cc(106)、crew(153)、plugin-bridge(165)、find-plugin(156)、mattpocock-skills-deck(96)、superpowers-dsh(96)、reverse-skill(174)、agency-agents(74)。**观察**:与 Claude Code/Pi 生态互穿;技能包批发(mattpocock 25技能、321智能体)是知识进口贸易。

## 19 · 其他独行侠

prompt-optimizer(146 注入式改写)、prompt-enhancer(171)、first-control-prompt(177)、jevcore(185 类型安全)、normify(194 架构分形)、jev... ads(21 趣味)、toy(196)、omi-voice(179 语音朗读)、billion... device侧:ios(308)、android(164)、browser系:browser(746)、tabbit(133)、ego-browser(198)、wqty-browser(165)、data-agent(67)、notification(158)、green-meter已计。

---

## 落榜基建层(不参与榜单但生态骨架)

官方:53包族/seam包/文档站/`.agents/notes`。目录与商店:awesome(372★)、dshbase(实测徽章)、dshmarket、**dshplugin.store、dsh.deepseek404.com**(本次新发现)。标准运动:dsh-std(133★)、dsh-ecosystem-spec、Pi ABI、DSH-Store准入。教育与工具:hello-dsh、dsh-handbook、create-dsh-plugin、plugin-template(116★)、dsh-plugin-skill。

## 长尾全景(awesome 统计,14,141 仓库)

Agent自动化5156 · 界面体验2770 · 网页浏览器2199 · 实用工具850 · 设计视觉716 · 开发者工具648 · 知识研究605 · 集成分享569 · 生态资源396 · 多Agent编排232。Top200 只占收录的 1.4%——**97% 的物种活在长尾里**,r-策略是这个生态的主导生存方式。

## 总量观察(anima 视角)

1. **情绪带(21物种)+模型带(25物种)是两大基本盘**:一个管"愿不愿意用",一个管"用不用得起"
2. **anima 的目标位(个人任务+人情+主动陪伴)在 Top200 中零占据**——最接近的 lowtide(错峰委派)和 taskboard(工程评审)都不做"主人画像+时机判断"
3. **借力带明确**:dsh-im(通道)、dsh-cron/automation(闹钟)、mnemon(记忆)、pet系范式(人格)——全部有成熟物种,无一需要我们发明
4. **警惕位**:记忆(13物种混战)、远程(6物种同质)——押注要留缝

# 数字生命 · 设计文档

> **账本时代(V5)**。核心收缩为一句话:闹钟(schedule)只管到点响;女仆读一个 markdown 账本、
> 自己判断、自己改、git commit。没有数据库,没有任务 schema,没有重要性分数——决策全在女仆脑子里。

## 文档导航

### 现行(V5 账本时代)

| 文档 | 内容 |
|---|---|
| [user-goal.md](user-goal.md) | **愿景与运行状态**:组成架构、四态运行、长期目标(主人手写底稿) |
| [../skills/task-brain/SKILL.md](../skills/task-brain/SKILL.md) | **女仆大脑**:醒来流程 / 判定协议 / 账本约定(唯一行为规范,装在值班室 `.agents/skills/`) |
| [../skills/task-brain/references/](../skills/task-brain/references/) | 细节手册:hands 触达 / morning 晨间巡视 / northstar-profile 画像 |
| [lessons.md](lessons.md) | **工程教训**:prompt 分层吃缓存、判定协议(沉默是判定)、记忆即攻击面 |
| [dev-spec.md](dev-spec.md) | DSH 0.2 插件开发规范(一手实测,工具不变则长期有效) |
| [ecosystem.md](ecosystem.md) / [ecosystem-catalog.md](ecosystem-catalog.md) | DSH 生态全景与 Top 200 图鉴 |
| [pet-feature-request.md](pet-feature-request.md) | dsh-pet upstream issue #76(已投递,宠物功能暂停,留着备用) |

### 博物馆(V4.2 数据库时代,已退役)

[museum-v4.2/](museum-v4.2/) — 双驱动任务模型、SQLite schema、节律四态、社区组装方案、
Excalidraw 架构图。2026-10-01 大改革退役:结构化任务体系让 AI 理解困难、产生数字噪音
(过期每日任务挂着 9.21 的"重要性"骗人),被"单文件 markdown + git"整体替换。
细节见 git 历史与本目录文档。

## 设计宪法(三次架构翻转零改动,2025-04 至今)

1. **闹钟就是闹钟,女仆才是决策者**——计时器只管到点响;看时间、看主人、看环境、
   决定说不说、重排下一个闹钟,全是女仆醒来后的事。闹钟永不为场景扩功能。
2. **先定基本方向,未来慢慢调整**——反过度设计;人格与提醒节奏靠长期磨合,不靠一次性做全。

## 设计锚点(两句话,不变)

> "我需要一个 AI 助手。我平时很忙,不一定能照顾到方方面面,有它我就不需要总想着
> 哪里没做好了,这样自己无拘无束。" —— 用户 2025-04

核心价值不是"提醒",而是**卸下"总想着哪里没做好"的心理负担**:让用户敢忘,因为知道她会追到底。

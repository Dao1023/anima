# dsh-task-brain · 数字生命女仆

> DeepSeek Harness 插件:把 SQLite 双驱动任务档案暴露为会话内原生工具,
> 让一个被 dsh-cron 定时唤醒的女仆会话读档案、判定该不该开口、重排自己的闹钟。
>
> **设计宪法**(三次架构翻转零改动):
> 1. 闹钟就是闹钟,女仆才是决策者
> 2. 先定基本方向,未来慢慢调整

## 组成(V4.2,社区组装 + 本插件为唯一自建)

| 件 | 来源 | 职责 |
|---|---|---|
| dsh-desktop | 🔵 社区 | 常驻托盘守夜 |
| dsh-cron | 🔵 社区 | 闹钟:cron/at + coldWake 冷唤醒 |
| **dsh-task-brain(本仓库)** | ⭐ 自建 | task_query / task_update / alarm_reschedule 原生工具 |
| SQLite 双驱动档案 | ⭐ 自建 | start `log(间隔/周期)` / end `-log(剩余)` / 周期克隆 |
| dsh-im + Bark | 🔵 社区 | 微信双向聊天窗 + 锁屏保底 |
| dsh-mnemon | 🔵 社区 | 跨会话记忆 + 档案 provider 桥 |

## 仓库结构

```
docs/            设计文档(导航见 docs/README.md)
  community-survey.md   选型依据 + 七阶段施工路线图
  architecture.excalidraw  V4.2 组成架构(活画布)
  rhythm.md / task-system.md / schema.md / lessons.md
data/            本地数据(gitignored: assistant.db 档案 + key)
plugin/          TS 插件源码(阶段 3 落地)
engine/          档案引擎(双驱动公式+actions 校验,阶段 3 从旧仓库移植)
```

## 施工路线图(摘自 docs/community-survey.md)

0. dsh-undo-savepoint 保险 → 1. dsh-desktop 宿主 → 2. dsh-cron 唤醒
→ **3. 本插件(核心)** → 4. skill 改版 → 5. 微信触达 → 6. 记忆 → 7. 人格变量

## 血统

fork 自 `claude-assistant`(V1 哑终端 → V2 常驻服务 → V4 daemon,git 历史在那边)。
档案数据 `data/assistant.db` 从旧仓库平移,单一事实源从此在本仓库。

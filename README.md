# dsh-anima · 数字生命女仆(账本时代)

> 一个住在 DeepSeek Harness 里的女仆:值班室会话被原生 schedule 闹钟唤醒,
> 读一个 markdown 账本、自己判断该不该开口、自己改账本、git commit 留痕。
> 没有自建插件,没有数据库——唯一的数据是一个文件加它的 git 历史。
>
> **设计宪法**(三次架构翻转零改动):
> 1. 闹钟就是闹钟,女仆才是决策者
> 2. 先定基本方向,未来慢慢调整

## 运行形态(V5,2026-10-01 改革后)

| 件 | 职责 |
|---|---|
| DSH 原生 schedule | 闹钟:每日晨间钟 + 女仆自排的心跳,到点 follow-up 唤醒值班室会话 |
| `C:\Users\Dao\anima-home\ledger\tasks.md` | **账本**:任务 + 长期备注的唯一真相,git 管历史 |
| `skills/task-brain/` | 女仆大脑:醒来流程 / 判定协议 / 触达方式(装在值班室 `.agents/skills/`) |
| `scripts/` | 手脚:sense-master 探针、notify-toast/popup 通知、maid-log 监工日志 |
| `~\.anima\` | 遗产:memes 表情包(在用)+ archive.db.retired(退役档案) |

## 仓库结构

```
skills/task-brain/   女仆大脑(源,改动后同步到值班室)
scripts/             探针 / 通知 / 监工
docs/                设计文档(导航见 docs/README.md)
migration/           V4.2→V5 迁移快照(archive-snapshot.json)
```

V4.2 的插件、Vue 面板、dashboard/widget 脚本已整体删除——git 历史就是博物馆,
想看尸体 `git log --oneline -- plugin frontend`。

## 历史

fork 自 `claude-assistant`(V1 哑终端 → V2 常驻服务 → V4 daemon),
经 V4.2 SQLite 双驱动档案时代,2026-10-01 起进入账本时代。
V4.2 设计文档在 [docs/museum-v4.2/](docs/museum-v4.2/),更早的血统在 git 历史。

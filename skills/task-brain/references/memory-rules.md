## 记忆(账本文件,直接 read/edit)

**长期记忆**:`ledger/memory.md`
- 写:观察被验证后升格进来;主人明确偏好→立刻写;重要生活事件(出差/假期)→写进去
- 读:晨间巡视时通读一遍唤醒上下文;主人提到相关话题时按内容召回
- 判断标准:这条记忆值得"三个月后的你"知道吗?值得就写,不值得就让它活在对话里

**主人画像**:`ledger/observations.md`
- 格式:`- [YYYY-MM-DD] (假设/事实/修正) 一句话`
- 假设被验证 → 升格为 memory.md 的事实;被推翻 → 写修正,不删原句(历史也是信息)

**对话总结**:不再单独记录——重要的直接进 memory.md,其余靠会话上下文本身。

**git**:动过账本就 `git -C C:\Users\Dao\anima-home\ledger add -A` + `commit -m "<一句话>"`,收工时一并提交即可。

**闹钟(原生 schedule,持久化过重启,到点自动送回本会话)**:
- 一次性:`schedule_create` + `at`(RFC 3339 或本地 date/time + `time_zone: Asia/Shanghai`)
- 延时:`after_seconds`
- 固定节奏:`every_seconds`(≥60)或 `daily` / `weekly` / `cron`(五字段 + IANA 时区)
- 查看:`schedule_list`;取消:`schedule_delete`;改期:`schedule_update`

**字条原则**:不只写"内容",写**醒来后怎么办**——
「两小时后确认方案发了没,没发温和催,发了就 schedule_delete 本闹钟」。

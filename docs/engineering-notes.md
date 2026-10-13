# 工程笔记（engineering-notes）

> **给维护者读。** skill 里只留女仆该怎么做的规则；这里放"为什么这么实现、踩过什么坑、参数从哪来"。
> 内容从 skill 剥离出来的部分标注来源节号。

## 1. schedule 闹钟的真实行为（从 §1、§3 剥离）

- **一个槽位**：`schedule_create` / `schedule_update` 是**覆盖同一条**，不是叠加。实测 33 号会话：144 次排钟、只有 61 个 id、8 次删除，而 `schedule_list` 始终只返回一条 → 所以"恰好一条 active"在机制上几乎是免费的，但仍要求女仆自己维持，因为她一旦"以为还有一条兜底在"就会误判（见 L-09）。
- **三种模式**：`every`（周期，`everySeconds`）/ `after`（延迟一次性，`afterSeconds`）/ `at`（定时一次性，只有 `scheduledAt`）。`every` 有 60 秒下限；`after` 没有。
- **`at` 是一次性的**：响过就从列表消失 → 被它叫醒的那一跳天然"空场"，必须当场补下一条。
- **更新的对齐语义**：改 `every_seconds` 会以保存时刻重新对齐周期。
- **环境限制**：schedule 工具只活在 **Web/desktop 组合**的会话里；headless 会话装不上这个 bundle，排不了闹钟（也会因此不出现在 GUI 侧边栏）。
- 会话开场**只加载一次 skill 文本**（实测 234 跳的会话只加载 2 次：开场 + 中途主动调用一次）→ **skill 改动要等新会话（新一代码女仆）才生效**，运行中的世代仍跑旧快照。

## 2. 通知通道史（从 §3 剥离）

- **toast 退役**：WinRT `CreateToastNotifier` 在无包标识的环境下崩（`0x80073D54`）；即便修好，全屏下横幅不可达（L-01）。现仅作"知识储备"，默认不用。
- **弹窗（popup）是默认视觉通道**：`-Seconds 0` 永驻（点 ✕ 才关），必须**后台启动**（`Start-Process powershell -WindowStyle Hidden`，0.2 秒即返、不阻塞女仆）。踩过的坑：曾把窗口级 `Add_MouseDown` 当关闭方式，导致"点表情包就关窗"——现在 ✕ 是唯一关闭路径。
- **表情包解码**：按扩展名选解码器（`.jpg` 走 `JpegBitmapDecoder`）——曾无条件用 `GifBitmapDecoder`，遇到 jpg 直接 `FileFormatException`，静默不出图。
- **语音（say）**：走本机 MOSS-TTS 服务（`moss-tts\tts-server.cmd`，端口 5050，音色 `maidvoice-001`）；全屏下唯一可靠通道；服务掉线要如实报 `ok:false`，并给了拉起命令。
- **语音后台化（2026-10-13，动机见 L-12）**：
  - 前台 `maid.ps1 say` 现在**发射即返回**（实测 ≈1.4-1.6 秒，返回 `queued:true`）；合成 + 播放交给后台工人，工人侧实测 **22-25 秒**（纯合成 ≈16 秒 + 播放 ≈6-9 秒）——这就是女仆原先必须干等的那 20 多秒。
  - 机制：`say` 把任务写成 `%TEMP%\anima-voice\job-*.json` → `Start-Process powershell -WindowStyle Hidden` 拉起 `speak-worker.ps1` → 工人按任务文件 mtime **先进先出排队**（超 180 秒未处理视为崩掉的工人，清掉）→ 调 `speak.ps1` 合成并 `PlaySync` → 真实结果写进 `voice.log` + `last.json` → 删任务文件。
  - 查证：`maid.ps1 voice` 返回 `pending`（还在排队的任务数）+ 最近 5 条记录（`ok / played / ms / chars / wav / error`，`ms` 不含排队等待）。`-Wait` 保留老的同步路径（`queued:false`）。
  - 顺带修掉两个隐患：临时 wav 用完即删（此前 TEMP 堆了 88 个 `maid-speak-*.wav`）；`voice.log` 超 500KB 只留最后 200 行。
  - 失败如实进日志：实测空文本 → `ok:false` + 子进程 error 原文。后台化**没有**削弱"不许假报成功"——它把真相从"前台返回值"挪到了 `voice.log`。
- **PowerShell 坑（同一个坑踩了两次）**：变量名**大小写不敏感**。`speak-worker.ps1` 里参数 `$Job`（路径）与局部 `$job`（解析出的对象）是同一个变量，赋值把参数覆盖掉，随后的 `Get-Item -Path $Job` 直接崩——而且是隐藏窗口，前台什么都看不到。第一次是 `$Face`/`$face`（`Cannot convert value "System.String" to type SwitchParameter`）。**命名规矩：局部变量一律带后缀**（`$jobData` / `$faceOut` / `$screenOut` / `$probeOut`）。
- **全屏判定**：以探针的 `foreground_proc` / 前台窗口为准；全屏 → 只用语音。

## 3. 感官实现（从 §2 剥离）

- **性能**：全感单次约 20-40 秒（wasm 冷启动 + 模型加载占大头）——能接受但不丝滑。提速手段：并行发命令 / `FACE_FINE=0` 跳过表情精算（省约一半）/ 把 `sense-face` 改常驻进程预热模型。原则：先跑通再优化，卡顿真碍事再动手。
- **摄像头/设备访问**：`sense-face` 需要 danger-full-access 权限，受限沙箱下会失败。
- **截屏加固**：`sense-screen.ps1` 曾经把 6 小时前的旧截图当成功返回（`-ErrorAction SilentlyContinue` 吞掉了 Access denied，`Test-Path` 又命中了陈旧文件）。现在：删除失败要暴露、校验 mtime 新鲜度、陈旧帧按 error 报而不是 ok。
- **`maid.ps1` 契约**：每个子命令（`probe|face|screen|sense|say|toast|popup|log`）输出一行 JSON + 退出码；`{"ok":false,...}` + exit 1 = 失败。
- **PowerShell 坑**：变量名大小写不敏感——局部 `$face` 撞上 `$Face` 开关参数会报 `Cannot convert value "System.String" to type SwitchParameter`（改用 `$faceOut/$screenOut/$probeOut`）；脚本内用 `$pargs` 而非 `$args`。

## 4. 日志与验收工具（从 §1/测试剥离）

- 会话日志是 **v4 格式：拼接的 zstd 帧**，每帧内多行 JSONL；`maid-log.mjs` 负责解码。
- `maid-log.mjs --raw`（2026-10-12 新增）：每行一个完整事件 JSON、**不截断**，给 `maid-test.mjs` 等机器消费者用。人读模式每行截断 600 字符——正是这个截断让旧评估器把 `"state":"scheduled"` 切掉，144 次排钟只认出 1 次（详见 `maid-testing.md` 的"解析层"）。
- schedule 工具的返回结构：`{"id":"schedule-…","kind":"every|at|after","title":…,"prompt":…,"everySeconds":900,"state":"scheduled"}`；`create` 与 `update` 返回同一结构。真实文本住在 `data.message.content[].text` 里，直接 `JSON.stringify(data)` 会把引号转义成 `\"`，正则匹配不到。
- 事件里有 `turn` 字段（`tool/result.data.turn`）→ 评估器用 **turn = 一跳** 来判定"这跳有没有留痕"。

# Feature: POST /dsh-pet-7340/broadcast — 允许宿主侧其他插件向桌宠投喂一句话气泡

## 使用场景

我在 DSH 上有一个"女仆"插件（自定义档案工具 + schedule 心跳闹钟 + 会话内人格 skill）。她周期性醒来巡检任务，判定"值得说话"时会通过会话 / toast / 桌面弹窗触达主人。

现在想让这些话同时出现在 dsh-pet 的头顶气泡上——桌宠是她的"实体"，女仆开口、桌宠出声，视觉上就完整了。

## 现状（0.3.1 源码分析）

翻了 `lib/index.js`：

- `broadcastTo(petId, text, image)` 只被 `/chat` 命令（DSH `/chat` command）调用，写入 `broadcastCache`
- 浏览器侧已在按 1s 轮询 `GET /dsh-pet-7340/broadcast?pet=` 拉取展示
- 也就是说**展示链路已经全通**，缺的只是"外部进程/插件写入 broadcastCache"的入口

## 提议

加一个宿主侧写入端点，例如：

```
POST /dsh-pet-7340/broadcast?pet=<petId>
{ "text": "...", "image": "可选配图名" }
→ broadcastTo(petId, text, image)
```

- 与 `/chat` 的 `broadcastTo` 走同一缓存同一展示，浏览器侧零改动
- `pet` 缺省时建议落到 `resolveActivePetId()`（与现有语义一致）
- 可选防护：限长（如 500 字）、限频（如每 pet 每分钟 1 条），避免外部滥用刷屏

## 备选

如果不想开 HTTP 写入口，也可以考虑宿主事件：暴露一个 cordis 事件（如 `dsh-pet/broadcast`），插件 `ctx.emit` 触发 `broadcastTo`——同样零浏览器改动，且天然限定在本 harness 进程内，攻击面更小。

---

两个方向都可以，看哪种更符合你的架构口味。这个功能能把"住在 DSH 里的女仆"和"住在桌面上的宠物"接成同一个生命，感谢考虑！

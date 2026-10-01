# DSH 0.2 插件开发规范(一手来源消化)

> 来源:官方文档站 deepseek-harness.github.io(develop/basic、reference/cookbook),对照本机 0.2.0-rc.2 实测。
> **教训入档:此前凭二手摘要(子代理转述)建议开发策略是错误的,本文件只收录一手来源确认过的事实。**

## 0. 版本与环境事实(本机实测)

- 本机 = `dsh 0.2.0-rc.2`;desktop profile **由 Electron 应用独占管理**(CLI `--dump-config` 被拒),
  但其组合 = `dsh-base + dsh-web-app`(package.json 可见),故 web profile 的 dump 可作能力参照
- web profile 组合后 **289 个条目**;`timer` 是通用 cordis 计时基础设施(`@deepseek-ai/cordis-plugin-timer`),
  **没有原生 cron/schedule 子系统** → 阶段 2 的 dsh-cron(或自研小调度插件)仍然必要
- 存在的原生相关件:`goal`/`goal-round-driver`(目标延续)、`tool-todo`、`repeat-tool-reminder`、`jobs`、`hmr`

## 1. 开发工作流(官方标准路径)

```
deepseek-harness 源码 checkout(工作目录)
  scratch-plugin/src/my-plugin.ts      ← 插件源码
  scratch-plugin/cordis.yml            ← overlay: insert 条目,插件路径必须绝对路径
启动: pnpm dsh web --patch ./scratch-plugin/cordis.yml
热更: 官方 HMR——每个注册天然是 ctx.effect,改动直接生效
```

**纠正**:市场插件的热挂载是"安装已发布插件"的通道,**不是开发通道**;开发迭代用 `--patch` overlay + HMR。
开发期不需要动任何 profile。

## 2. 插件解剖

```ts
import type { Context } from '@deepseek-ai/cordis'
export const name = 'my-plugin'
export const inject = ['tools']          // 依赖的服务,就绪后 apply 才跑
export function apply(ctx: Context) { /* 注册能力 */ }
```

- 三形态:函数/对象/类(Service 类用于向其他插件提供服务)
- **ctx 注册的一切自动清理**(监听器/工具/定时器);手动资源用 `ctx.effect(() => {...; return 清理函数})`
- **绝不 `export default`**(社区事故:inject 丢失静默失效——此条来自二手但被官方示例结构印证:官方全用具名导出)

## 3. 工具规范(adding-a-tool 精要,写 dsh-anima 时逐条遵守)

```ts
ctx.tools.register(defineTool({
  name, description,                      // 模型可见
  parameters: { path: { type: 'string', required: true, description } },  // 扁平 DSL,自动校验
  output: { schema: { type: 'string' }, render: (_a, v) => [{ type:'text', text: v }] },
  async execute(args, exec) { return 规范值 }   // args 已按 schema 校验
}))
```

- **execute 返回规范 JSON 值**(output.schema 声明的),不返回内容块;`render` 负责模型可见文本
- **抛异常 = isError**;领域性"不理想结果"也要返回成功规范值
- 遵守 `exec.signal`(取消);参数视为只读
- `presentationMeta`/卡片展示器必须是**纯函数**(回放时也要跑);UI 格式不进模型结果
- 长活用 `ctx.jobs.start({kind,label,owner,run})` + `run_in_background`
- **策略不内建进工具**:允许/拒绝/询问走 `tools/pre-execute` 钩子
- PTC mode 下工具可被程序直接 `await tools.<name>(args)` 调用 → schema 就是程序 API,认真设计

## 4. 能力分层(官方架构规范)

通用能力拆三角色:**Service Definition**(类型+抽象)/ **Provider**(实现)/ **Consumer**(工具)。
**"不要预防性拆分"——简单工具插件单包即可**。→ dsh-anima v1 = 单包工具插件,不拆。

## 5. 官方 cron 模式(阶段 2/自研调度的标准路径)

cookbook 明文:「定时任务(cron):插件注册面向模型的调度工具;定时器触发 →
**空闲时 `followup(…, {source:{kind:'plugin',plugin:'schedule'}})`,忙碌时 `inject()` 通知**」。
无论用 dsh-cron 还是自研,唤醒的落地动作就是这个 API 对。

## 6. 其他关键扩展点速查

- 系统提示词:`ctx.systemPrompt.section()`(排序/作用域)——skill = section + 工具注册
- 会话事件:`session/event`(持久)与 `agent/assistant-stream`(实时帧)
- 子代理:`ctx.subagents` 注册表;MCP = 每服务器一个插件
- 沙箱/审批:`ctx.sandbox` 后端、`ctx.approval` 应答
- 工具过滤:`ctx.tools.restrict()`(渐进披露)

## 7. 待读(动工阶段 3 前)

- [ ] develop/basic/config.md(插件配置面)
- [ ] reference/capability-seams.md(能力 seam 清单)
- [ ] 仓库测试策略 docs/testing.zh.md(组装覆盖要求——"已交付且面向模型的变更必须提供组装覆盖")
- [ ] dsh-io/dsh-plugin-skill(社区的插件开发 skill,装了以后开发时有随身参考)

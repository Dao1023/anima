// 阶段6 · 长期记忆工具:memories/session_notes 表的读写
// 数据与 observations 同库(archive.db),阶段6 结论:自研桥,不引外部记忆插件
import { DatabaseSync } from 'node:sqlite'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { openArchive, fmt, nowSec } from './index.js'

export function addMemoryTools(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'memory_write',
    description:
      '写入一条长期记忆(事实条目)。用途:主人画像定稿(observations 的 hypothesis 被验证后)、主人明确偏好(如"不喜欢被连催")、重要生活事实(如"下周出差")。memory_recall 是检索入口。',
    parameters: {
      kind: { type: 'string', description: 'fact(事实)/preference(偏好)/event(事件),默认 fact' },
      text: { type: 'string', description: '一句话记忆' },
      source_session: { type: 'string', description: '来源会话 id(可空)' },
    },
    output: {
      schema: {
        type: 'object',
        properties: { id: { type: 'number' }, message: { type: 'string' } },
        additionalProperties: false,
      },
      render: (_a, v) => [{ type: 'text', text: v.message }],
    },
    async execute(args) {
      if (!args.text?.trim()) throw new Error('text 不能为空')
      const kind = args.kind ?? 'fact'
      if (!['fact', 'preference', 'event'].includes(kind)) throw new Error('kind 必须是 fact/preference/event')
      const d = openArchive(false)
      try {
        const r = d.prepare('INSERT INTO memories (ts, kind, text, source_session) VALUES (?, ?, ?, ?)')
          .run(nowSec(), kind, args.text.trim(), args.source_session ?? null)
        return { id: Number(r.lastInsertRowid), message: `已记住(${kind}):${args.text.trim()}` }
      } finally { d.close() }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'memory_recall',
    description:
      '检索长期记忆(关键词匹配 memories + observations + session_notes 三表)。用于:晨间巡视唤醒上下文、主人提到相关话题时召回、感觉"我好像记过这个"时确认。',
    parameters: {
      keyword: { type: 'string', description: '关键词(空=最近 10 条)' },
      limit: { type: 'number', description: '返回条数上限(默认 10)' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          hits: { type: 'array', items: { type: 'object', additionalProperties: true } },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_a, v) => [{ type: 'text', text: v.message }],
    },
    async execute(args) {
      const d = openArchive()
      try {
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 50)
        const kw = args.keyword?.trim() ?? ''
        const union = `SELECT ts, 'memory' AS source, kind, text FROM memories
          UNION ALL SELECT ts, 'observation' AS source, kind, text FROM observations
          UNION ALL SELECT ts, 'note' AS source, topic AS kind, text FROM session_notes`
        const rows = (kw
          ? d.prepare(`SELECT * FROM (${union}) WHERE text LIKE ? ORDER BY ts DESC LIMIT ?`).all(`%${kw}%`, limit)
          : d.prepare(`SELECT * FROM (${union}) ORDER BY ts DESC LIMIT ?`).all(limit)) as { ts: number; source: string; kind: string; text: string }[]
        const hits = rows.map(r => ({ date: fmt(r.ts), source: r.source, kind: r.kind, text: r.text }))
        return { hits, message: hits.length ? `召回 ${hits.length} 条${kw ? `(${kw})` : ''}` : '没有匹配的记忆' }
      } finally { d.close() }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'session_note',
    description:
      '写一条会话总结(值班室每天/每次重要对话后)。topic 短语(如"晨报磨合"),text 两三句:聊了什么、主人状态、遗留事项。跨会话连续性的主食。',
    parameters: {
      topic: { type: 'string', description: '主题短语' },
      text: { type: 'string', description: '两三句总结' },
    },
    output: {
      schema: {
        type: 'object',
        properties: { id: { type: 'number' }, message: { type: 'string' } },
        additionalProperties: false,
      },
      render: (_a, v) => [{ type: 'text', text: v.message }],
    },
    async execute(args) {
      if (!args.topic?.trim() || !args.text?.trim()) throw new Error('topic 和 text 都不能为空')
      const d = openArchive(false)
      try {
        const r = d.prepare('INSERT INTO session_notes (ts, topic, text) VALUES (?, ?, ?)')
          .run(nowSec(), args.topic.trim(), args.text.trim())
        return { id: Number(r.lastInsertRowid), message: `会话总结已存:${args.topic.trim()}` }
      } finally { d.close() }
    },
  }))
}

/**
 * dsh-anima · 数字生命女仆的档案工具
 *
 * 把 SQLite 双驱动任务档案暴露为会话内原生工具。
 * 档案位于 ~/.anima/archive.db(工作区外,回滚够不着)。
 *
 * 双驱动模型(见 docs/task-system.md):
 *   start 驱动: importance = log((now - anchor) / expected_duration)  越久没做越重要
 *   end   驱动: importance = -log(剩余天数)                          越近截止越急
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-anima'
export const inject = ['tools']

const ARCHIVE_PATH = join(homedir(), '.anima', 'archive.db')

/** 打开档案(只读模式;不存在时报友好错误) */
function openArchive(): DatabaseSync {
  try {
    return new DatabaseSync(ARCHIVE_PATH, { readOnly: true })
  } catch {
    throw new Error(
      `档案库不可读: ${ARCHIVE_PATH} — 请确认 ~/.anima/archive.db 存在且可访问`,
    )
  }
}

/** start 驱动重要性: log((now - anchor) / expected_duration),秒级 */
function startImportance(anchorSec: number | null, expectedSec: number | null, nowSec: number): number {
  if (anchorSec === null || !expectedSec || expectedSec <= 0) return 0
  const x = (nowSec - anchorSec) / expectedSec
  return Math.log(Math.max(x, 1e-4))
}

/** end 驱动重要性: -log(剩余天数),过期的不该出现在 active 里 */
function endImportance(deadlineSec: number | null, nowSec: number): number {
  if (deadlineSec === null) return 0
  const remainingDays = Math.max((deadlineSec - nowSec) / 86400, 1e-4)
  return -Math.log(remainingDays)
}

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'task_query',
    description:
      '查询双驱动任务档案。返回按重要性降序排列的活跃任务列表,每条含:标题、驱动类型(start=越久没做越重要/end=越近截止越急)、重要性分数、截止/预期信息、标签。start 驱动的分数>0 表示超期(该做了);end 驱动的分数>0 表示不足一天截止。用于:女仆醒来判断该提什么、主人问"今天有什么事"。',
    parameters: {
      top: { type: 'number', description: '返回前 N 条(默认 10,最大 50)' },
      drive: { type: 'string', description: '筛选驱动类型:start 或 end(不传返回全部)' },
      tag: { type: 'string', description: '按标签名筛选(精确匹配,如"工作")' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                drive: { type: 'string' },
                importance: { type: 'number' },
                priority: { type: 'number' },
                is_cyclic: { type: 'boolean' },
                note: { type: 'string' },
                deadline: { type: 'string' },
                expected_days: { type: 'number' },
                days_since_done: { type: 'number' },
                remaining_days: { type: 'number' },
                tags: { type: 'array', items: { type: 'string' } },
              },
              additionalProperties: false,
            },
          },
          total_active: { type: 'number' },
          returned: { type: 'number' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => {
        if (value.tasks.length === 0) {
          return [{ type: 'text', text: '档案里没有活跃任务。' }]
        }
        const lines = value.tasks.map((t, i) => {
          const parts = [`#${i + 1} [${t.drive}] ${t.importance.toFixed(2)} "${t.title}"`]
          if (t.deadline) parts.push(`截止:${t.deadline}`)
          if (t.remaining_days !== undefined) parts.push(`剩 ${t.remaining_days.toFixed(1)} 天`)
          if (t.days_since_done !== undefined) parts.push(`距上次 ${t.days_since_done.toFixed(1)} 天`)
          if (t.expected_days !== undefined) parts.push(`周期 ${t.expected_days} 天`)
          if (t.is_cyclic) parts.push('↻')
          if (t.tags.length > 0) parts.push(`[${t.tags.join(',')}]`)
          return parts.join(' ')
        })
        const header = `活跃任务 ${value.returned}/${value.total_active},按重要性降序:`
        return [{ type: 'text', text: `${header}\n${lines.join('\n')}` }]
      },
    },
    async execute(args) {
      const top = Math.min(Math.max(Math.floor(args.top ?? 10), 1), 50)
      const nowSec = Math.floor(Date.now() / 1000)
      const db = openArchive()
      try {
        // 主查询: tasks + schedule JOIN
        const rows = db.prepare(`
          SELECT t.id, t.title, t.note, t.drive, t.priority, t.is_cyclic,
                 s.deadline, s.anchor, s.expected_duration
          FROM tasks t
          LEFT JOIN schedule s ON s.task_id = t.id
          WHERE t.status = 'active'
        `).all() as Record<string, unknown>[]

        // 取标签(一对多)
        const tagRows = db.prepare(`
          SELECT tt.task_id, g.name
          FROM task_tags tt JOIN tags g ON g.id = tt.tag_id
        `).all() as { task_id: string; name: string }[]
        const tagMap = new Map<string, string[]>()
        for (const r of tagRows) {
          const list = tagMap.get(r.task_id) ?? []
          list.push(r.name)
          tagMap.set(r.task_id, list)
        }

        // 过滤 + 计算重要性
        let filtered = rows
        if (args.drive === 'start' || args.drive === 'end') {
          filtered = filtered.filter(r => r.drive === args.drive)
        }
        if (args.tag) {
          filtered = filtered.filter(r => (tagMap.get(r.id as string) ?? []).includes(args.tag))
        }

        const scored = filtered.map(r => {
          const deadline = r.deadline as number | null
          const anchor = r.anchor as number | null
          const expected = r.expected_duration as number | null
          const imp = r.drive === 'start'
            ? startImportance(anchor, expected, nowSec)
            : endImportance(deadline, nowSec)

          const task: Record<string, unknown> = {
            id: r.id,
            title: r.title,
            drive: r.drive,
            importance: Math.round(imp * 100) / 100,
            priority: r.priority ?? 3,
            is_cyclic: Boolean(r.is_cyclic),
            tags: tagMap.get(r.id as string) ?? [],
          }
          if (r.note) task.note = r.note
          if (deadline) {
            task.deadline = new Date(deadline * 1000).toISOString()
            task.remaining_days = Math.round(((deadline - nowSec) / 86400) * 10) / 10
          }
          if (r.drive === 'start' && anchor) {
            task.days_since_done = Math.round(((nowSec - anchor) / 86400) * 10) / 10
          }
          if (expected) task.expected_days = Math.round((expected / 86400) * 10) / 10

          return task
        })

        scored.sort((a, b) => (b.importance as number) - (a.importance as number))
        const result = scored.slice(0, top)

        return {
          tasks: result,
          total_active: scored.length,
          returned: result.length,
        }
      } finally {
        db.close()
      }
    },
  }))
}

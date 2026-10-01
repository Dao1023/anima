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
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { addMemoryTools } from './memory.js'

export const name = 'dsh-anima'
export const inject = ['tools']

const ARCHIVE_PATH = join(homedir(), '.anima', 'archive.db')

const DAY = 86400
export const nowSec = () => Math.floor(Date.now() / 1000)

/** unix 秒 → 'YYYY-MM-DD HH:MM'(本地时区,面板同款) */
export function fmt(ts: number) {
  const d = new Date(ts * 1000), p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 打开档案(只读;不存在时报友好错误) */
export function openArchive(readOnly = true): DatabaseSync {
  try {
    return new DatabaseSync(ARCHIVE_PATH, { readOnly })
  } catch {
    throw new Error(
      `档案库不可${readOnly ? '读' : '写'}: ${ARCHIVE_PATH} — 请确认 ~/.anima/archive.db 存在且可访问`,
    )
  }
}

/** 解析日期参数:ISO 字符串或 YYYY-MM-DD,转 Unix 秒;非法则抛错 */
function parseDateSec(input: string, field: string): number {
  const ms = Date.parse(input.length <= 10 ? `${input}T12:00:00` : input)
  if (Number.isNaN(ms)) throw new Error(`参数 ${field} 不是合法日期: "${input}"(用 YYYY-MM-DD 或 ISO 8601)`)
  return Math.floor(ms / 1000)
}

/** 校验标签并返回 tag id 列表(不存在的标签自动创建) */
function resolveTagIds(db: DatabaseSync, names: string[]): number[] {
  const ids: number[] = []
  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    let row = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: number } | undefined
    if (!row) {
      db.prepare('INSERT INTO tags (name) VALUES (?)').run(name)
      row = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: number }
    }
    ids.push(row.id)
  }
  return ids
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

/** 幂等迁移:人格变量表(阶段7)。读连接建不了表,独立短连一次。 */
function migratePersona() {
  try {
    const db = openArchive(false)
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS persona (
          key     TEXT PRIMARY KEY,
          value   TEXT NOT NULL,
          updated INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS observations (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          ts    INTEGER NOT NULL,
          kind  TEXT NOT NULL,
          text  TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS memories (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          ts             INTEGER NOT NULL,
          kind           TEXT NOT NULL DEFAULT 'fact',
          text           TEXT NOT NULL,
          source_session TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_memories_text ON memories(text);
        CREATE TABLE IF NOT EXISTS session_notes (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          ts    INTEGER NOT NULL,
          topic TEXT NOT NULL,
          text  TEXT NOT NULL
        );
      `)
    } finally { db.close() }
  } catch { /* 档案库暂时不可写时静默,工具调用时再报错 */ }
}

/** 读 persona 变量(缺省给默认值) */
function getPersona(db: DatabaseSync, key: string, def: number): number {
  const r = db.prepare('SELECT value FROM persona WHERE key = ?').get(key) as { value: string } | undefined
  return r ? Number(r.value) : def
}

export function apply(ctx: Context) {
  migratePersona()
  addMemoryTools(ctx)
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
          const parts = [`#${i + 1} [${t.drive}] ${t.importance.toFixed(2)} "${t.title}" (id:${t.id})`]
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
            ? startImportance(anchor, expected, nowSec())
            : endImportance(deadline, nowSec())

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
            task.remaining_days = Math.round(((deadline - nowSec()) / 86400) * 10) / 10
          }
          if (r.drive === 'start' && anchor) {
            task.days_since_done = Math.round(((nowSec() - anchor) / 86400) * 10) / 10
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

  // ── 写路径:所有写入走校验,AI 不裸写库(V2 原则:读可以宽,写必须窄) ──

  ctx.tools.register(defineTool({
    name: 'task_add',
    description:
      '新增任务到档案。start 驱动=周期性个人任务(如"每 3 天锻炼一次"),必填 expected_days;end 驱动=有截止日的任务(如"周五前交报告"),必填 deadline。可选标签、备注、优先级(1 最高,5 最低,默认 3)。',
    parameters: {
      title: { type: 'string', description: '任务内容(必填,非空)' },
      drive: { type: 'string', description: '驱动方式:start(越久没做越重要)或 end(越近截止越急),必填' },
      expected_days: { type: 'number', description: 'start 驱动:预期间隔天数,必填' },
      deadline: { type: 'string', description: 'end 驱动:截止日期(YYYY-MM-DD 或 ISO 8601),必填' },
      recurrence_days: { type: 'number', description: 'end 驱动:重复间隔天数(如每周任务传 7);不传=一次性' },
      is_cyclic: { type: 'boolean', description: 'start 驱动:完成后是否自动重置周期(默认 true)' },
      priority: { type: 'number', description: '优先级 1-5(默认 3)' },
      note: { type: 'string', description: '备注' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签名列表(不存在的自动创建)' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          drive: { type: 'string' },
          importance: { type: 'number' },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => ([{ type: 'text', text: value.message }]),
    },
    async execute(args) {
      const title = args.title.trim()
      if (!title) throw new Error('title 不能为空')
      if (args.drive !== 'start' && args.drive !== 'end') {
        throw new Error(`drive 必须是 start 或 end,收到 "${args.drive}"`)
      }
      const priority = args.priority === undefined ? 3 : Math.round(args.priority)
      if (priority < 1 || priority > 5) throw new Error(`priority 必须在 1-5,收到 ${priority}`)
      const id = randomUUID()
      const isCyclic = args.drive === 'start' ? (args.is_cyclic ?? true) : false

      // 写前校验:各驱动的必填字段
      let deadlineSec: number | null = null
      let expectedSec: number | null = null
      let anchorSec: number | null = null
      let recurrenceSec: number | null = null
      if (args.drive === 'start') {
        if (!args.expected_days || args.expected_days <= 0) {
          throw new Error('start 驱动任务必须给 expected_days(> 0),如"每 3 天"传 3')
        }
        expectedSec = Math.round(args.expected_days * DAY)
        anchorSec = nowSec() // 新任务从现在开始计时
      } else {
        if (!args.deadline) {
          throw new Error('end 驱动任务必须给 deadline,如"2026-10-05"')
        }
        deadlineSec = parseDateSec(args.deadline, 'deadline')
        if (args.recurrence_days !== undefined) {
          if (args.recurrence_days <= 0) throw new Error('recurrence_days 必须 > 0')
          recurrenceSec = Math.round(args.recurrence_days * DAY)
        }
      }

      const db = openArchive(false)
      try {
        db.exec('BEGIN')
        try {
          db.prepare(`
            INSERT INTO tasks (id, title, note, drive, is_cyclic, priority, status, created, snooze_until)
            VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL)
          `).run(id, title, args.note ?? null, args.drive, isCyclic ? 1 : 0, priority, nowSec())

          db.prepare(`
            INSERT INTO schedule (task_id, deadline, anchor, expected_duration, recurrence_interval)
            VALUES (?, ?, ?, ?, ?)
          `).run(id, deadlineSec, anchorSec, expectedSec, recurrenceSec)

          if (args.tags && args.tags.length > 0) {
            const ins = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)')
            for (const tagId of resolveTagIds(db, args.tags)) ins.run(id, tagId)
          }
          db.exec('COMMIT')
        } catch (e) {
          db.exec('ROLLBACK')
          throw e
        }

        const imp = args.drive === 'start'
          ? startImportance(anchorSec, expectedSec, nowSec())
          : endImportance(deadlineSec, nowSec())
        const msg = args.drive === 'start'
          ? `已添加 start 任务「${title}」,周期 ${args.expected_days} 天${isCyclic ? '(循环)' : ''},重要性从 0 开始随时间增长。`
          : `已添加 end 任务「${title}」,截止 ${args.deadline}。`
        return { id, title, drive: args.drive, importance: Math.round(imp * 100) / 100, message: msg }
      } finally {
        db.close()
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'task_done',
    description:
      '完成任务(真完成,status=done)。周期任务自动续期:start 驱动重置 anchor(计时从现在重新开始),end 驱动顺延 deadline(recurrence_interval)。非周期任务完成后不再出现在活跃列表。',
    parameters: {
      id: { type: 'string', description: '任务 id(task_query 返回的 id,必填)' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          action: { type: 'string' },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => ([{ type: 'text', text: value.message }]),
    },
    async execute(args) {
      if (!args.id) throw new Error('id 必填(task_query 返回的 id)')
      const db = openArchive(false)
      try {
        db.exec('BEGIN')
        try {
          const row = db.prepare(`
            SELECT t.id, t.title, t.drive, t.is_cyclic, s.deadline, s.recurrence_interval
            FROM tasks t JOIN schedule s ON s.task_id = t.id
            WHERE t.id = ? AND t.status = 'active'
          `).get(args.id) as Record<string, unknown> | undefined
          if (!row) throw new Error(`找不到活跃任务 id=${args.id},先用 task_query 确认`)

          let action = '完成'
          let extra = ''
          if (row.drive === 'start' && row.is_cyclic) {
            // start 周期:同一任务继续活跃,只重置 anchor(V2 语义:做完重新计时)
            db.prepare(`UPDATE tasks SET snooze_until = NULL WHERE id = ?`).run(args.id)
            db.prepare('UPDATE schedule SET anchor = ? WHERE task_id = ?').run(nowSec(), args.id)
            action = '完成并重置周期(任务保持活跃)'
          } else {
            // 非周期 或 end:真正完成
            db.prepare(`UPDATE tasks SET status = 'done', snooze_until = NULL WHERE id = ?`).run(args.id)
            if (row.drive === 'end' && row.is_cyclic && row.recurrence_interval) {
              // end 周期:克隆下一个,deadline 顺延
              const newId = randomUUID()
              const newDeadline = (row.deadline as number) + (row.recurrence_interval as number)
              db.prepare(`
                INSERT INTO tasks (id, title, note, drive, is_cyclic, priority, status, created, snooze_until)
                VALUES (?, ?, ?, 'end', 1, 3, 'active', ?, NULL)
              `).run(newId, row.title as string, null, nowSec())
              db.prepare(`
                INSERT INTO schedule (task_id, deadline, anchor, expected_duration, recurrence_interval)
                VALUES (?, ?, NULL, NULL, ?)
              `).run(newId, newDeadline, row.recurrence_interval as number)
              action = '完成并克隆下一期'
              extra = ` 新一期截止 ${new Date(newDeadline * 1000).toISOString().slice(0, 10)}。`
            }
          }

          db.exec('COMMIT')
          // 人格挂钩:每完成一件事,好感度 +1(北极星:完成是好事,但只是小事)
          db.prepare(`
            INSERT INTO persona (key, value, updated) VALUES ('affinity', '1', ?)
            ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated = ?
          `).run(nowSec(), nowSec())
          const msg = `「${row.title}」${action}。${extra}`
          return { id: args.id, title: row.title as string, action, message: msg }
        } catch (e) {
          db.exec('ROLLBACK')
          throw e
        }
      } finally {
        db.close()
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'task_update',
    description:
      '修改任务字段:标题/备注/优先级/截止日/周期天数/是否循环/标签。延期=改 deadline。只传需要改的字段,其余不动。',
    parameters: {
      id: { type: 'string', description: '任务 id(必填)' },
      title: { type: 'string', description: '新标题' },
      note: { type: 'string', description: '新备注' },
      priority: { type: 'number', description: '新优先级 1-5' },
      deadline: { type: 'string', description: '新截止日期(end 驱动,YYYY-MM-DD 或 ISO)' },
      expected_days: { type: 'number', description: '新预期间隔天数(start 驱动)' },
      is_cyclic: { type: 'boolean', description: '是否循环(start 驱动)' },
      tags: { type: 'array', items: { type: 'string' }, description: '替换全部标签(不传则不动标签)' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          changed: { type: 'array', items: { type: 'string' } },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => ([{ type: 'text', text: value.message }]),
    },
    async execute(args) {
      if (!args.id) throw new Error('id 必填(task_query 返回的 id)')
      const db = openArchive(false)
      try {
        const row = db.prepare(`
          SELECT t.drive, s.deadline, s.expected_duration FROM tasks t
          JOIN schedule s ON s.task_id = t.id
          WHERE t.id = ? AND t.status = 'active'
        `).get(args.id) as Record<string, unknown> | undefined
        if (!row) throw new Error(`找不到活跃任务 id=${args.id},先用 task_query 确认`)

        const changed: string[] = []
        db.exec('BEGIN')
        try {
          const setTask: string[] = []
          const taskVals: (string | number | null)[] = []
          if (args.title !== undefined) {
            if (!args.title.trim()) throw new Error('title 不能设为空')
            setTask.push('title = ?'); taskVals.push(args.title.trim()); changed.push('title')
          }
          if (args.note !== undefined) {
            setTask.push('note = ?'); taskVals.push(args.note || null); changed.push('note')
          }
          if (args.priority !== undefined) {
            const p = Math.round(args.priority)
            if (p < 1 || p > 5) throw new Error(`priority 必须在 1-5,收到 ${p}`)
            setTask.push('priority = ?'); taskVals.push(p); changed.push('priority')
          }
          if (args.is_cyclic !== undefined) {
            setTask.push('is_cyclic = ?'); taskVals.push(args.is_cyclic ? 1 : 0); changed.push('is_cyclic')
          }
          if (setTask.length > 0) {
            db.prepare(`UPDATE tasks SET ${setTask.join(', ')} WHERE id = ?`).run(...taskVals, args.id)
          }

          const setSched: string[] = []
          const schedVals: (number | null)[] = []
          if (args.deadline !== undefined) {
            if (row.drive !== 'end') throw new Error('该任务是 start 驱动,没有 deadline;改 expected_days')
            setSched.push('deadline = ?'); schedVals.push(parseDateSec(args.deadline, 'deadline')); changed.push('deadline')
          }
          if (args.expected_days !== undefined) {
            if (args.expected_days <= 0) throw new Error('expected_days 必须 > 0')
            setSched.push('expected_duration = ?')
            schedVals.push(Math.round(args.expected_days * DAY)); changed.push('expected_days')
          }
          if (setSched.length > 0) {
            db.prepare(`UPDATE schedule SET ${setSched.join(', ')} WHERE task_id = ?`).run(...schedVals, args.id)
          }

          if (args.tags !== undefined) {
            db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(args.id)
            const ins = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)')
            for (const tagId of resolveTagIds(db, args.tags)) ins.run(args.id, tagId)
            changed.push('tags')
          }
          db.exec('COMMIT')
        } catch (e) {
          db.exec('ROLLBACK')
          throw e
        }

        const msg = changed.length > 0
          ? `任务 ${args.id} 已更新:${changed.join('、')}。`
          : '没有提供任何要修改的字段,档案未变动。'
        return { id: args.id, changed, message: msg }
      } finally {
        db.close()
      }
    },
  }))

  // ── 人格变量(阶段7):她的内心状态与主人画像,数据归库,行为归她 ──

  const PERSONA_DEFAULTS: Record<string, number> = { affinity: 0, serious_streak: 0 }

  ctx.tools.register(defineTool({
    name: 'persona_query',
    description:
      '查看你的内心状态(好感度/严肃计数等)与最近的主人画像观察。醒来时看一眼,决定今天的语气(affinity 分档)和是否到了严肃时刻(serious_streak≥3)。',
    parameters: {
      observations: { type: 'number', description: '带出最近 N 条画像观察(默认 5,0=不带)' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          persona: { type: 'object', additionalProperties: true },
          observations: { type: 'array', items: { type: 'object', additionalProperties: true } },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_a, v) => [{ type: 'text', text: v.message }],
    },
    async execute(args) {
      const db = openArchive()
      try {
        const persona: Record<string, string | number> = {}
        for (const r of db.prepare('SELECT key, value, updated FROM persona').all() as { key: string; value: string; updated: number }[]) {
          const n = Number(r.value)
          persona[r.key] = Number.isNaN(n) ? r.value : n
        }
        for (const [k, d] of Object.entries(PERSONA_DEFAULTS)) if (persona[k] === undefined) persona[k] = d
        const limit = Math.min(Math.max(args.observations ?? 5, 0), 20)
        const obs = limit
          ? (db.prepare('SELECT ts, kind, text FROM observations ORDER BY id DESC LIMIT ?').all(limit) as { ts: number; kind: string; text: string }[])
            .map(o => ({ date: fmt(o.ts), kind: o.kind, text: o.text }))
          : []
        const tone = (persona.affinity as number) >= 20 ? '亲近(可以更可爱)'
          : (persona.affinity as number) >= 5 ? '熟稔(自然随意)' : '礼貌(克制专业)'
        const serious = (persona.serious_streak as number) >= 3
        const message = `好感度 ${persona.affinity}(语气:${tone});严肃计数 ${persona.serious_streak}${serious ? ' → 已到严肃时刻,该试探性认真一次了,说完记得清零' : ''}` +
          (obs.length ? `;最近观察 ${obs.length} 条。` : '.')
        return { persona, observations: obs, message }
      } finally { db.close() }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'persona_update',
    description:
      '更新内心状态计数。常用:主人连续敷衍/答应不做 → serious_streak +1;主人认真改正 → serious_streak 归零;重大愉快时刻 → affinity +1(日常完成已自动+1,不必手加)。',
    parameters: {
      affinity: { type: 'number', description: '好感度增量(可为负,慎用)' },
      serious_streak: { type: 'number', description: '严肃计数增量(如 +1 或设 0 需传增量后用 set)' },
      set: { type: 'object', additionalProperties: true, description: '直接设值:{ key: value },如 {"serious_streak":0}' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          changed: { type: 'object', additionalProperties: true },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_a, v) => [{ type: 'text', text: v.message }],
    },
    async execute(args) {
      if (args.affinity === undefined && args.serious_streak === undefined && !args.set) {
        throw new Error('至少提供一项要更新的内容')
      }
      const db = openArchive(false)
      try {
        const now = nowSec()
        const changed: Record<string, string> = {}
        const bump = (key: string, delta: number) => {
          const cur = getPersona(db, key, PERSONA_DEFAULTS[key] ?? 0)
          const next = Math.max(0, cur + delta)
          db.prepare(`
            INSERT INTO persona (key, value, updated) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = ?, updated = ?`).run(key, String(next), now, String(next), now)
          changed[key] = `${cur} → ${next}`
        }
        if (args.affinity !== undefined) bump('affinity', Math.round(args.affinity))
        if (args.serious_streak !== undefined) bump('serious_streak', Math.round(args.serious_streak))
        if (args.set && typeof args.set === 'object') {
          for (const [k, v] of Object.entries(args.set)) {
            db.prepare(`
              INSERT INTO persona (key, value, updated) VALUES (?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = ?, updated = ?`).run(k, String(v), now, String(v), now)
            changed[k] = String(v)
          }
        }
        return { changed, message: `内心状态已更新:${Object.entries(changed).map(([k, v]) => `${k}=${v}`).join(', ')}` }
      } finally { db.close() }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'observation_add',
    description:
      '记录一条主人画像观察。kind: hypothesis(假设,待验证)/fact(确证事实)/correction(修正旧假设)。文本一句话,如"主人连续两天 23 点后爆发式工作,假设:深夜型"。这是阶段6记忆系统的原料。',
    parameters: {
      kind: { type: 'string', description: 'hypothesis / fact / correction' },
      text: { type: 'string', description: '一句话观察' },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          message: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_a, v) => [{ type: 'text', text: v.message }],
    },
    async execute(args) {
      if (!['hypothesis', 'fact', 'correction'].includes(args.kind)) {
        throw new Error('kind 必须是 hypothesis / fact / correction')
      }
      if (!args.text?.trim()) throw new Error('text 不能为空')
      const db = openArchive(false)
      try {
        const r = db.prepare('INSERT INTO observations (ts, kind, text) VALUES (?, ?, ?)')
          .run(nowSec(), args.kind, args.text.trim())
        return { id: Number(r.lastInsertRowid), message: `已记录 ${args.kind}:${args.text.trim()}` }
      } finally { db.close() }
    },
  }))
}

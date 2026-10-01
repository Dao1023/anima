#!/usr/bin/env node
// maid-dashboard.mjs · 女仆面板后端:老前端 REST API 的 node:sqlite 实现 + 静态托管
// 前端源码 ../frontend/,pnpm build 后本服务托管 dist。
// 用法: node maid-dashboard.mjs [端口,默认 3741]   打开: http://127.0.0.1:3741
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.argv[2]) || 3741
const DB = join(homedir(), '.anima', 'archive.db')
const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'dist')
const DAY = 86400
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')

function db() { return new DatabaseSync(DB, { readOnly: false }) }
function nowSec() { return Math.floor(Date.now() / 1000) }
/** unix 秒 → 'YYYY-MM-DD HH:MM'(本地时区) */
function fmt(ts) {
  if (ts === null || ts === undefined) return null
  const d = new Date(ts * 1000), p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
/** 'YYYY-MM-DD HH:MM' 或 'YYYY-MM-DD' → unix 秒(本地时区) */
function toTs(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(String(s).trim())
  if (!m) throw Object.assign(new Error(`日期格式不对: ${s}(要 YYYY-MM-DD HH:MM)`), { status: 400 })
  return Math.floor(new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 12), +(m[5] ?? 0)).getTime() / 1000)
}
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function tagRows(db) {
  return db.prepare('SELECT tt.task_id, g.name FROM task_tags tt JOIN tags g ON g.id = tt.tag_id').all()
}
function tagInfos(db) {
  const rows = db.prepare(`
    SELECT g.name, p.name AS parent FROM tags g
    LEFT JOIN tags p ON p.id = g.parent_id`).all()
  return rows.map(r => ({ name: r.name, parent: r.parent ?? null }))
}
function importance(r, now) {
  return r.drive === 'start'
    ? Math.log(Math.max(r.anchor && r.expected_duration ? (now - r.anchor) / r.expected_duration : 1e-4, 1e-4))
    : -Math.log(Math.max((r.deadline - now) / DAY, 1e-4))
}

// ── REST 处理器 ─────────────────────────────────────────────
const api = {
  'GET /api/tasks'(res, db) {
    const now = nowSec()
    const rows = db.prepare(`
      SELECT t.id, t.title, t.drive, s.deadline, s.anchor, s.expected_duration, s.recurrence_interval
      FROM tasks t LEFT JOIN schedule s ON s.task_id = t.id
      WHERE t.status = 'active'`).all()
    const tags = tagRows(db)
    const tagMap = {}
    for (const r of tags) (tagMap[r.task_id] ??= []).push(r.name)
    const starts = [], ends = []
    for (const r of rows) {
      const imp = Math.round(importance(r, now) * 100) / 100
      const t = { tags: tagMap[r.id] ?? [] }
      if (r.drive === 'start') {
        starts.push({
          id: r.id, title: r.title, importance: imp,
          days_since: r.anchor ? Math.round(((now - r.anchor) / DAY) * 10) / 10 : null,
          expected_days: r.expected_duration ? Math.round(r.expected_duration / DAY * 10) / 10 : null,
          anchor: fmt(r.anchor), tags: t.tags,
        })
      } else {
        ends.push({
          id: r.id, title: r.title, importance: imp,
          recurrence_days: r.recurrence_interval ? Math.round(r.recurrence_interval / DAY) : null,
          deadline: fmt(r.deadline), tags: t.tags,
        })
      }
    }
    json(res, 200, { starts, ends, tags: tagInfos(db) })
  },

  'GET /api/tasks/{id}'(res, db, _, id) {
    const now = nowSec()
    const r = db.prepare(`
      SELECT t.*, s.deadline, s.anchor, s.expected_duration, s.recurrence_interval
      FROM tasks t LEFT JOIN schedule s ON s.task_id = t.id WHERE t.id = ?`).get(id)
    if (!r) return json(res, 404, { detail: '任务不存在' })
    const tags = tagRows(db).filter(x => x.task_id === id).map(x => x.name)
    json(res, 200, {
      id: r.id, title: r.title, note: r.note, drive: r.drive,
      deadline: fmt(r.deadline), anchor: fmt(r.anchor),
      expected_days: r.expected_duration ? Math.round(r.expected_duration / DAY * 10) / 10 : null,
      recurrence_days: r.recurrence_interval ? Math.round(r.recurrence_interval / DAY) : null,
      is_cyclic: r.is_cyclic, snooze_until: fmt(r.snooze_until),
      priority: r.priority, status: r.status, created: fmt(r.created), tags,
      importance: Math.round(importance(r, now) * 100) / 100,
      days_since: r.anchor ? Math.round(((now - r.anchor) / DAY) * 10) / 10 : undefined,
    })
  },

  'GET /api/tasks/{id}/pushes'(res) { json(res, 200, { pushes: [] }) },

  // done: start 周期=重置 anchor 保持活跃;end 周期=克隆顺延;其他=置 done
  'POST /api/tasks/{id}/done'(res, db, _, id) {
    const r = db.prepare(`
      SELECT t.*, s.deadline, s.recurrence_interval FROM tasks t
      JOIN schedule s ON s.task_id = t.id WHERE t.id = ? AND t.status = 'active'`).get(id)
    if (!r) return json(res, 404, { detail: '任务不存在' })
    const now = nowSec()
    db.exec('BEGIN')
    try {
      if (r.drive === 'start' && r.is_cyclic) {
        db.prepare(`UPDATE tasks SET snooze_until = NULL WHERE id = ?`).run(id)
        db.prepare('UPDATE schedule SET anchor = ? WHERE task_id = ?').run(now, id)
      } else {
        db.prepare(`UPDATE tasks SET status = 'done', snooze_until = NULL WHERE id = ?`).run(id)
        if (r.drive === 'end' && r.is_cyclic && r.recurrence_interval) {
          const nid = randomUUID()
          db.prepare(`INSERT INTO tasks (id, title, drive, is_cyclic, priority, status, created)
                      VALUES (?, ?, 'end', 1, 3, 'active', ?)`).run(nid, r.title, now)
          db.prepare(`INSERT INTO schedule (task_id, deadline, recurrence_interval)
                      VALUES (?, ?, ?)`).run(nid, r.deadline + r.recurrence_interval, r.recurrence_interval)
        }
      }
      db.exec('COMMIT')
      json(res, 200, { ok: true })
    } catch (e) { db.exec('ROLLBACK'); json(res, 500, { detail: e.message }) }
  },

  'POST /api/tasks/{id}/close'(res, db, _, id) {
    const r = db.prepare(`SELECT id FROM tasks WHERE id = ? AND status = 'active'`).get(id)
    if (!r) return json(res, 404, { detail: '任务不存在' })
    db.prepare(`UPDATE tasks SET status = 'closed', snooze_until = NULL WHERE id = ?`).run(id)
    json(res, 200, { ok: true })
  },

  'GET /api/snooze-options'(res, db, url) {
    const id = new URL(url, 'http://x').searchParams.get('task_id')
    const now = nowSec()
    const mk = (until, label) => ({ key: String(until), label, until: fmt(until) })
    let options
    if (id) {
      const r = db.prepare(`
        SELECT t.drive, s.deadline, s.expected_duration FROM tasks t
        JOIN schedule s ON s.task_id = t.id WHERE t.id = ?`).get(id)
      if (r?.drive === 'start' && r.expected_duration) {
        options = [0.25, 0.5, 1, 2].map(f => mk(now + r.expected_duration * f * DAY,
          `预期 × ${f}(约 ${Math.round(r.expected_duration * f / DAY * 10) / 10} 天)`))
      } else if (r?.deadline) {
        const rem = r.deadline - now
        options = [0.25, 0.5, 1].map(f => mk(now + rem * f, `剩余 × ${f}`))
      }
    }
    if (!options) {
      options = [mk(now + 3600, '1 小时后'), mk(now + 3 * 3600, '3 小时后'),
        mk(now + DAY, '明天这时'), mk(now + 7 * DAY, '下周这时')]
    }
    json(res, 200, { options })
  },

  'POST /api/tasks/{id}/snooze'(res, db, _, id, body) {
    const until = body.until !== undefined ? toTs(body.until) : nowSec() + 3600
    const r = db.prepare(`SELECT id FROM tasks WHERE id = ? AND status = 'active'`).get(id)
    if (!r) return json(res, 404, { detail: '任务不存在' })
    db.prepare(`UPDATE tasks SET snooze_until = ? WHERE id = ?`).run(until, id)
    json(res, 200, { ok: true })
  },

  'DELETE /api/tasks/{id}/snooze'(res, db, _, id) {
    db.prepare(`UPDATE tasks SET snooze_until = NULL WHERE id = ?`).run(id)
    json(res, 200, { ok: true })
  },

  'POST /api/tasks'(res, db, _, _id, body) {
    const { title, drive, deadline, expected_days, recurrence_days, is_cyclic, priority, note, tags, anchor } = body
    if (!title?.trim()) return json(res, 400, { detail: 'title 不能为空' })
    if (drive !== 'start' && drive !== 'end') return json(res, 400, { detail: 'drive 必须是 start 或 end' })
    if (drive === 'start' && !expected_days) return json(res, 400, { detail: 'start 驱动必须给 expected_days' })
    if (drive === 'end' && !deadline) return json(res, 400, { detail: 'end 驱动必须给 deadline' })
    const now = nowSec(), id = randomUUID()
    const prio = priority === undefined ? 3 : Math.max(1, Math.min(5, Math.round(priority)))
    db.exec('BEGIN')
    try {
      db.prepare(`INSERT INTO tasks (id, title, note, drive, is_cyclic, priority, status, created, snooze_until)
                  VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL)`)
        .run(id, title.trim(), note ?? null, drive,
          drive === 'start' ? (is_cyclic === undefined ? 1 : is_cyclic) : 0, prio, now)
      db.prepare(`INSERT INTO schedule (task_id, deadline, anchor, expected_duration, recurrence_interval)
                  VALUES (?, ?, ?, ?, ?)`)
        .run(id,
          drive === 'end' ? toTs(deadline) : null,
          drive === 'start' ? (anchor ? toTs(anchor) : now) : null,
          drive === 'start' ? Math.round(expected_days * DAY) : null,
          drive === 'end' && recurrence_days ? Math.round(recurrence_days * DAY) : null)
      if (tags?.length) {
        const ins = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)')
        for (const tid of resolveTags(db, tags)) ins.run(id, tid)
      }
      db.exec('COMMIT')
      json(res, 200, { task_id: id, title })
    } catch (e) { db.exec('ROLLBACK'); json(res, e.status ?? 500, { detail: e.message }) }
  },

  'PUT /api/tasks/{id}'(res, db, _, id, body) {
    const r = db.prepare(`SELECT drive FROM tasks WHERE id = ? AND status = 'active'`).get(id)
    if (!r) return json(res, 404, { detail: '任务不存在' })
    db.exec('BEGIN')
    try {
      const set = [], vals = []
      for (const k of ['title', 'note', 'priority']) {
        if (body[k] !== undefined) { set.push(`${k} = ?`); vals.push(k === 'priority' ? Math.round(body[k]) : body[k]) }
      }
      if (body.is_cyclic !== undefined && r.drive === 'start') { set.push('is_cyclic = ?'); vals.push(body.is_cyclic) }
      if (set.length) db.prepare(`UPDATE tasks SET ${set.join(', ')} WHERE id = ?`).run(...vals, id)

      const setS = [], valsS = []
      if (body.deadline !== undefined) { setS.push('deadline = ?'); valsS.push(body.deadline ? toTs(body.deadline) : null) }
      if (body.anchor !== undefined) { setS.push('anchor = ?'); valsS.push(body.anchor ? toTs(body.anchor) : null) }
      if (body.expected_days !== undefined) { setS.push('expected_duration = ?'); valsS.push(Math.round(body.expected_days * DAY)) }
      if (body.recurrence_days !== undefined) { setS.push('recurrence_interval = ?'); valsS.push(body.recurrence_days ? Math.round(body.recurrence_days * DAY) : null) }
      if (setS.length) db.prepare(`UPDATE schedule SET ${setS.join(', ')} WHERE task_id = ?`).run(...valsS, id)

      if (body.tags !== undefined) {
        db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(id)
        const ins = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)')
        for (const tid of resolveTags(db, body.tags)) ins.run(id, tid)
      }
      db.exec('COMMIT')
      json(res, 200, { ok: true })
    } catch (e) { db.exec('ROLLBACK'); json(res, e.status ?? 500, { detail: e.message }) }
  },

  'GET /api/tags'(res, db) {
    const tagRows = db.prepare('SELECT id, name, parent_id FROM tags').all()
    const counts = db.prepare(`
      SELECT g.id, COUNT(*) AS n FROM task_tags tt
      JOIN tags g ON g.id = tt.tag_id
      JOIN tasks t ON t.id = tt.task_id AND t.status = 'active'
      GROUP BY g.id`).all()
    const countMap = Object.fromEntries(counts.map(c => [c.id, c.n]))
    const byParent = new Map()
    for (const g of tagRows) {
      const key = g.parent_id ?? null
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key).push({ id: g.id, name: g.name, parent_id: g.parent_id, count: countMap[g.id] ?? 0, children: [] })
    }
    const build = pid => (byParent.get(pid) ?? []).map(n => ({ ...n, children: build(n.id) }))
    json(res, 200, { tree: build(null) })
  },

  'POST /api/tags'(res, db, _, _id, body) {
    const name = String(body.name ?? '').trim()
    if (!name) return json(res, 400, { detail: '标签名不能为空' })
    const dup = db.prepare('SELECT id FROM tags WHERE name = ?').get(name)
    if (dup) return json(res, 400, { detail: `标签「${name}」已存在` })
    const r = db.prepare('INSERT INTO tags (name, parent_id) VALUES (?, ?)').run(name, body.parent_id ?? null)
    json(res, 200, { id: Number(r.lastInsertRowid) })
  },

  'PUT /api/tags/{id}'(res, db, _, id, body) {
    const g = db.prepare('SELECT id, parent_id FROM tags WHERE id = ?').get(id)
    if (!g) return json(res, 404, { detail: '标签不存在' })
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return json(res, 400, { detail: '标签名不能为空' })
      db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id)
    }
    if (body.parent_id !== undefined) {
      const pid = body.parent_id
      if (pid !== null) {
        if (Number(pid) === Number(id)) return json(res, 400, { detail: '不能把标签挂到自己下面' })
        let cur = db.prepare('SELECT parent_id FROM tags WHERE id = ?').get(pid)
        while (cur?.parent_id !== null && cur?.parent_id !== undefined) {
          if (Number(cur.parent_id) === Number(id)) return json(res, 400, { detail: '不能把标签挂到自己的子孙下面(会成环)' })
          cur = db.prepare('SELECT parent_id FROM tags WHERE id = ?').get(cur.parent_id)
        }
      }
      db.prepare('UPDATE tags SET parent_id = ? WHERE id = ?').run(pid, id)
    }
    json(res, 200, { ok: true })
  },

  'DELETE /api/tags/{id}'(res, db, _, id) {
    const g = db.prepare('SELECT id, parent_id FROM tags WHERE id = ?').get(id)
    if (!g) return json(res, 404, { detail: '标签不存在' })
    db.exec('BEGIN')
    try {
      db.prepare('UPDATE tags SET parent_id = ? WHERE parent_id = ?').run(g.parent_id, id)
      db.prepare('DELETE FROM task_tags WHERE tag_id = ?').run(id)
      db.prepare('DELETE FROM tags WHERE id = ?').run(id)
      db.exec('COMMIT')
      json(res, 200, { ok: true })
    } catch (e) { db.exec('ROLLBACK'); json(res, 500, { detail: e.message }) }
  },
}

function resolveTags(db, names) {
  const ids = []
  for (const raw of names) {
    const name = String(raw).trim()
    if (!name) continue
    let row = db.prepare('SELECT id FROM tags WHERE name = ?').get(name)
    if (!row) { db.prepare('INSERT INTO tags (name) VALUES (?)').run(name); row = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) }
    ids.push(row.id)
  }
  return ids
}

function serveStatic(res, urlPath) {
  let p = join(DIST, urlPath === '/' ? 'index.html' : urlPath)
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(DIST, 'index.html') // SPA fallback
  if (!existsSync(p)) { res.writeHead(404); res.end('前端未构建:先在 frontend/ 跑 pnpm build'); return }
  res.writeHead(200, { 'Content-Type': (MIME[extname(p)] ?? 'application/octet-stream') + '; charset=utf-8' })
  res.end(readFileSync(p))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      try { resolve(raw ? JSON.parse(raw) : {}) } catch (e) { reject(Object.assign(new Error('请求体不是合法 JSON'), { status: 400 })) }
    })
    req.on('error', reject)
  })
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (!url.pathname.startsWith('/api/')) return serveStatic(res, url.pathname)
  let dbh
  try {
    dbh = db()
    const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {}
    for (const [pattern, handler] of Object.entries(api)) {
      const [method, path] = pattern.split(' ')
      if (method !== req.method) continue
      const pp = path.split('/')
      const up = url.pathname.split('/')
      if (pp.length !== up.length) continue
      const params = {}
      let ok = true
      for (let i = 0; i < pp.length; i++) {
        if (pp[i].startsWith('{')) params[pp[i].slice(1, -1)] = decodeURIComponent(up[i])
        else if (pp[i] !== up[i]) { ok = false; break }
      }
      if (ok) return handler(res, dbh, url, params['id'] ?? null, body)
    }
    json(res, 404, { detail: 'no such endpoint' })
  } catch (e) {
    json(res, e.status ?? 500, { detail: e.message })
  } finally { dbh?.close() }
}).listen(PORT, '127.0.0.1', () => console.log(`女仆面板: http://127.0.0.1:${PORT} (前端: frontend/dist)`))

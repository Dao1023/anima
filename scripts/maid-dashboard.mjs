#!/usr/bin/env node
// maid-dashboard.mjs · 女仆面板:任务清单 + 心跳状态,零依赖
// 用法: node maid-dashboard.mjs [端口,默认 3741]
// 打开: http://127.0.0.1:3741
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.argv[2]) || 3741
const DB = join(homedir(), '.anima', 'archive.db')
const SCHED = join(homedir(), '.dsh', 'storages', 'schedule.json')
const DAY = 86400

function queryTasks() {
  const db = new DatabaseSync(DB, { readOnly: true })
  try {
    const now = Math.floor(Date.now() / 1000)
    const rows = db.prepare(`
      SELECT t.id, t.title, t.note, t.drive, t.priority, t.is_cyclic, t.status, t.created, t.snooze_until,
             s.deadline, s.anchor, s.expected_duration
      FROM tasks t LEFT JOIN schedule s ON s.task_id = t.id
      WHERE t.status = 'active'`).all()
    const tagRows = db.prepare('SELECT tt.task_id, g.name FROM task_tags tt JOIN tags g ON g.id = tt.tag_id').all()
    const tags = {}
    for (const r of tagRows) (tags[r.task_id] ??= []).push(r.name)
    return rows.map(r => {
      const imp = r.drive === 'start'
        ? Math.log(Math.max(r.anchor && r.expected_duration ? (now - r.anchor) / r.expected_duration : 1e-4, 1e-4))
        : -Math.log(Math.max((r.deadline - now) / DAY, 1e-4))
      return { ...r, tags: tags[r.id] ?? [], importance: Math.round(imp * 100) / 100, now }
    }).sort((a, b) => b.importance - a.importance)
  } finally { db.close() }
}

function querySchedules() {
  if (!existsSync(SCHED)) return []
  try {
    const j = JSON.parse(readFileSync(SCHED, 'utf8'))
    return (Array.isArray(j) ? j : j.schedules ?? []).map(s => ({
      title: s.title ?? s.id, kind: s.kind ?? '?',
      next: s.state ?? '', every: s.everySeconds ?? s.afterSeconds ?? '',
      prompt: (s.prompt ?? '').slice(0, 80),
    }))
  } catch (e) { return [{ title: '读取失败: ' + e.message, kind: 'err' }] }
}

const page = tasks => `<!doctype html><html lang=zh><meta charset=utf-8>
<title>女仆面板</title><meta http-equiv=refresh content=30>
<style>
 body{font-family:"Microsoft YaHei",sans-serif;background:#faf8fc;color:#3a3a3a;margin:24px;max-width:980px}
 h1{color:#9c6bb3} h2{color:#7a5590;border-bottom:2px solid #e8ddf0;padding-bottom:6px}
 table{border-collapse:collapse;width:100%;margin:8px 0}
 td,th{border:1px solid #e5ddef;padding:7px 10px;text-align:left;font-size:14px}
 th{background:#f1eaf7}.imp{font-weight:bold;color:#9c6bb3}
 .over{color:#c0392b;font-weight:bold}.ok{color:#27ae60}
 .tag{background:#ede4f5;border-radius:8px;padding:1px 8px;margin:0 2px;font-size:12px}
 .muted{color:#999}.card{background:#fff;border:1px solid #e5ddef;border-radius:10px;padding:14px 18px;margin:14px 0}
</style>
<h1>女仆面板 <span class=muted style="font-size:14px">auto-refresh 30s</span></h1>

<div class=card><h2>心跳 / 闹钟(女仆在岗状态)</h2>
<table><tr><th>名称</th><th>类型</th><th>节奏</th><th>状态</th><th>字条</th></tr>
${querySchedules().map(s => `<tr><td>${s.title}</td><td>${s.kind}</td><td>${s.every || '—'}</td><td class=ok>${s.next}</td><td class=muted>${s.prompt}</td></tr>`).join('')}
</table></div>

<div class=card><h2>活跃任务(${tasks.length})</h2>
<table><tr><th>#</th><th>重要性</th><th>任务</th><th>驱动</th><th>截止/周期</th><th>优先级</th><th>标签</th></tr>
${tasks.map((t, i) => {
  const dd = t.deadline ? new Date(t.deadline * 1000).toLocaleDateString() : ''
  const rem = t.deadline ? Math.round((t.deadline - t.now) / DAY * 10) / 10 : null
  const remTxt = rem === null ? '' : (rem < 0 ? `<span class=over>逾期 ${-rem} 天</span>` : `剩 ${rem} 天`)
  const exp = t.expected_duration ? `${Math.round(t.expected_duration / DAY)} 天周期` : ''
  return `<tr><td>${i + 1}</td><td class=imp>${t.importance}</td><td>${t.title}${t.note ? `<div class=muted>${t.note}</div>` : ''}</td>
  <td>${t.drive === 'start' ? '循环' : '截止'}</td><td>${dd} ${remTxt} ${exp}</td><td>${t.priority}</td>
  <td>${t.tags.map(g => `<span class=tag>${g}</span>`).join('')}</td></tr>`
}).join('')}
</table></div>`

createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  try { res.end(page(queryTasks())) }
  catch (e) { res.end(`<h1>面板出错</h1><pre>${e.message}</pre>`) }
}).listen(PORT, '127.0.0.1', () => console.log(`女仆面板: http://127.0.0.1:${PORT}`))

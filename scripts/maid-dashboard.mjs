#!/usr/bin/env node
// maid-dashboard.mjs · 女仆面板:任务看板(老前端设计语言移植) + 心跳状态,零依赖
// 用法: node maid-dashboard.mjs [端口,默认 3741]   打开: http://127.0.0.1:3741
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.argv[2]) || 3741
const DB = join(homedir(), '.anima', 'archive.db')
const SCHED = join(homedir(), '.dsh', 'storages', 'schedule.json')
const DAY = 86400

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;') }

function queryTasks() {
  const db = new DatabaseSync(DB, { readOnly: true })
  try {
    const now = Math.floor(Date.now() / 1000)
    const rows = db.prepare(`
      SELECT t.id, t.title, t.note, t.drive, t.priority, t.is_cyclic,
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

// 老前端文案逻辑原样迁来(数据归后端,文案归前端)
function startFooter(t) {
  if (!t.anchor) return '还没做过'
  const days = (t.now - t.anchor) / DAY
  if (days <= 0) return '今天做过'
  return `${days.toFixed(1)} 天没做了`
}
function endFooter(t) {
  if (!t.deadline) return '无截止时间'
  const secs = t.deadline - t.now
  if (secs <= 0) return `已过期 ${Math.abs(secs / DAY).toFixed(1)} 天`
  const days = Math.floor(secs / DAY)
  if (days >= 1) return `还剩 ${days} 天`
  const h = Math.floor(secs / 3600)
  if (h >= 1) return `还剩 ${h} 小时`
  return `还剩 ${Math.floor(secs / 60)} 分钟`
}
function impClass(v) { return v >= 1.0 ? 'imp-red' : v >= 0.3 ? 'imp-orange' : v >= 0 ? 'imp-blue' : 'imp-gray' }
function accentOf(t) { return t.drive === 'start' ? '#5b9bd5' : '#e05252' }

function querySchedules() {
  if (!existsSync(SCHED)) return []
  try {
    const j = JSON.parse(readFileSync(SCHED, 'utf8'))
    return (Array.isArray(j) ? j : j.schedules ?? []).map(s => ({
      title: s.title ?? s.id, kind: s.kind ?? '?',
      state: s.state ?? '', every: s.everySeconds ?? s.afterSeconds ?? '',
      prompt: (s.prompt ?? '').slice(0, 60),
    }))
  } catch (e) { return [{ title: '读取失败: ' + e.message, kind: 'err' }] }
}

function page(tasks) {
  // 标签分组(老前端 TagBoard:按第一个标签分组,无标签入"未分类";层级缩进留给未来)
  const groups = new Map()
  for (const t of tasks) {
    const g = t.tags[0] ?? '未分类'
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(t)
  }

  const cards = [...groups.entries()].map(([name, list]) => `
    <section class="group">
      <header class="group-head"><span class="group-name">${esc(name)}</span>
        <span class="group-count">${list.length}</span></header>
      <div class="group-body">${list.map(t => `
        <div class="task-card" style="border-left-color:${accentOf(t)}">
          <h3 class="task-title">${esc(t.title)}</h3>
          <div class="task-meta">
            <span class="task-footer">${esc(t.drive === 'start' ? startFooter(t) : endFooter(t))}</span>
            <span class="imp-badge ${impClass(t.importance)}">${t.importance.toFixed(2)}</span>
            <span class="chips">${t.tags.map(g => `<span class="tag-chip">#${esc(g)}</span>`).join('')}</span>
          </div>
        </div>`).join('')}
      </div>
    </section>`).join('')

  const heartbeats = querySchedules().map(s => `
    <div class="hb"><span class="hb-dot ${s.state === 'scheduled' ? 'on' : 'off'}"></span>
      <b>${esc(s.title)}</b><span class="muted">[${esc(s.kind)}${s.every ? ' · ' + s.every + 's' : ''}] ${esc(s.state)} — ${esc(s.prompt)}</span></div>`).join('')

  return `<!doctype html><html lang=zh><meta charset=utf-8>
<title>女仆面板</title><meta http-equiv=refresh content=30>
<style>
 *{box-sizing:border-box} body{font-family:"Microsoft YaHei",sans-serif;background:#f5f6f8;color:#2c3e50;margin:0}
 .wrap{display:flex;min-height:100vh}
 .side{width:260px;flex-shrink:0;background:#fff;border-right:1px solid #eceef3;padding:18px 16px}
 .side h1{font-size:16px;color:#9c6bb3;margin:0 0 14px}
 .side h2{font-size:12px;color:#909399;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.08em}
 .main{flex:1;padding:20px 24px;max-width:1100px}
 .hb{font-size:13px;padding:7px 0;border-bottom:1px dashed #f0ebf5;display:flex;gap:8px;align-items:baseline}
 .hb-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;position:relative;top:1px}
 .hb-dot.on{background:#27ae60;box-shadow:0 0 5px #27ae6088}.hb-dot.off{background:#c0c4cc}
 .muted{color:#909399;font-weight:400}
 .group{background:#fff;border-radius:10px;padding:10px 14px 12px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
 .group-head{display:flex;align-items:center;gap:6px;margin-bottom:8px}
 .group-name{font-size:13px;font-weight:700}.group-count{font-size:11px;color:#9aa0aa;background:#eef0f3;border-radius:8px;padding:0 6px}
 .group-body{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
 .task-card{background:#fff;border:1px solid #f0f0f0;border-left:3px solid transparent;border-radius:10px;padding:12px 14px;
   box-shadow:0 1px 3px rgba(0,0,0,.06);transition:box-shadow .15s,transform .15s}
 .task-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.1);transform:translateY(-1px)}
 .task-title{margin:0;font-size:14px;font-weight:600;line-height:1.4;word-break:break-word}
 .task-meta{margin-top:8px;display:flex;align-items:center;gap:6px;min-width:0}
 .task-footer{font-size:12px;color:#909399;margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .imp-badge{flex-shrink:0;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;padding:1px 7px;border-radius:6px}
 .imp-red{color:#e05252;background:rgba(224,82,82,.1)}.imp-orange{color:#e6a23c;background:rgba(230,162,60,.12)}
 .imp-blue{color:#5b9bd5;background:rgba(91,155,213,.12)}.imp-gray{color:#909399;background:rgba(144,147,153,.12)}
 .chips{display:flex;gap:2px}.tag-chip{font-size:11px;color:#5b9bd5;background:rgba(91,155,213,.1);border-radius:5px;padding:0 5px}
 @media(max-width:767px){.wrap{flex-direction:column}.side{width:100%;border-right:none;border-bottom:1px solid #eceef3}}
</style>
<div class=wrap>
 <aside class=side>
  <h1>女仆面板</h1><div class=muted style="font-size:11px">30s 自刷新</div>
  <h2>心跳 / 在岗</h2>${heartbeats}
  <h2>驱动图例</h2>
  <div style="font-size:12px"><span style="color:#5b9bd5">■</span> start · 循环<br>
  <span style="color:#e05252">■</span> end · 截止<br>
  <span class="imp-badge imp-red">≥1.0</span> 该做了 <span class="imp-badge imp-orange">≥0.3</span> 快了</div>
 </aside>
 <main class=main>${cards || '<p class=muted>没有活跃任务</p>'}</main>
</div>`
}

createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  try { res.end(page(queryTasks())) }
  catch (e) { res.end(`<h1>面板出错</h1><pre>${esc(e.message)}</pre>`) }
}).listen(PORT, '127.0.0.1', () => console.log(`女仆面板: http://127.0.0.1:${PORT}`))

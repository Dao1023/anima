#!/usr/bin/env node
// maid-test.mjs · 女仆验收测试 L1 反射层评估器
// 用法:
//   node maid-test.mjs l1 --session <session-dir>     # 对单个会话跑反射层断言
//   node maid-test.mjs l1 --all-sessions              # 对全部历史女仆会话跑离线回归
//   node maid-test.mjs l1 --all-sessions --since 2026-10-06   # 只算新规矩之后的会话
//   node maid-test.mjs list                           # 列出可测试的会话
// 断言原语与 spec 映射见 docs/maid-testing.md
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SESSIONS_BASE = 'C:\\Users\\Dao\\.dsh\\sessions\\--C-Users-Dao-anima-home--'
const SCRIPTS = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

// ---------- 日志解析 ----------
// 走 maid-log.mjs --raw:每行一个完整事件,不截断(旧版靠解析人读文本,600 字符截断把
// "state":"scheduled" 切掉,导致 144 次排钟只认出 1 次——2026-10-06 修)
function readRawEvents(sessionDir) {
  const text = execFileSync('node', [path.join(SCRIPTS, 'maid-log.mjs'), sessionDir, '--raw'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const out = []
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s) continue
    try { out.push(JSON.parse(s)) } catch { /* 截断行跳过 */ }
  }
  return out
}

// tool/result 的真实返回文本住在 data.message.content[].text 里(直接 JSON.stringify(data)
// 会把引号转义成 \" ,正则匹配不到)
function resultText(j) {
  const content = j.data?.message?.content
  if (!Array.isArray(content)) return ''
  return content.filter(c => typeof c?.text === 'string').map(c => c.text).join('\n')
}

function parseEvents(rawEvents) {
  const out = []
  for (const j of rawEvents) {
    const seq = j.seq ?? -1
    const turn = j.data?.turn ?? -1
    const type = j.type ?? ''
    if (type === 'assistant/message' && j.data?.message?.role === 'assistant') {
      const content = j.data.message.content
      const text = Array.isArray(content)
        ? content.filter(c => c?.type === 'text' && typeof c.text === 'string').map(c => c.text).join('\n').trim()
        : ''
      out.push({ seq, turn, type: 'message', text })
      continue
    }
    if (type !== 'tool/result') continue
    const blob = resultText(j)
    if (!blob) continue
    // 排闹钟结果(create / update 返回同一结构):
    //   {"id":"schedule-…","kind":"every|at|after","title":…,"prompt":…,
    //    "everySeconds":900 | "afterSeconds":60 | (at 档无秒数),"state":"scheduled"}
    const kindM = blob.match(/"kind":"(every|at|after)"/)
    if (kindM && /"state":"scheduled"/.test(blob)) {
      const secsM = blob.match(/"everySeconds"\s*:\s*(\d+)/) || blob.match(/"afterSeconds"\s*:\s*(\d+)/)
      out.push({
        seq,
        turn,
        type: 'schedule_create',
        kind: kindM[1],
        after: secsM ? Number(secsM[1]) : 0,
        id: (blob.match(/"id":"(schedule-[^"]+)"/) || [])[1] || '',
        title: (blob.match(/"title":"((?:[^"\\]|\\.)*)"/) || [])[1] || '',
        prompt: (blob.match(/"prompt":"((?:[^"\\]|\\.)*)"/) || [])[1] || '',
        text: blob,
      })
      continue
    }
    if (/"deleted"\s*:\s*true/.test(blob)) {
      out.push({ seq, turn, type: 'schedule_delete', id: (blob.match(/"id":"(schedule-[^"]+)"/) || [])[1] || '', text: blob })
    }
  }
  return out
}

// ---------- L1 断言原语 ----------
// R1 (§1步骤4/铁律): 问句出口,下一跳的字条必须安排"查回话"
function checkQuestionWaitHop(events, _opts) {
  const REPLY_RE = /回话|回音|答案|追问|报数|回复|等到|等主人/
  const results = []
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    if (ev.type !== 'message') continue
    if (!/[？？]/.test(ev.text)) continue
    // 找这条问句之后的第一条 schedule_create
    let next = null
    for (let j = i + 1; j < events.length; j++) {
      if (events[j].type === 'schedule_create') { next = events[j]; break }
      if (events[j].type === 'message' && /[？？]/.test(events[j].text)) break // 下一条问句先出现,仍算未安排
    }
    const q = (ev.text.match(/[^\n。！！]{1,30}[？？]/) || ['?'])[0]
    const ok = !!(next && REPLY_RE.test(next.title + next.prompt))
    results.push({ question: q.trim(), seq: ev.seq, ok, evidence: next ? `下一跳 after=${next.after}s "${next.title}"` : '问句之后没有再定跳' })
  }
  const asked = results.length
  const passed = results.filter(r => r.ok).length
  return { name: 'R1 问句→下一跳安排查回话 (§1步骤4/铁律)', ok: asked === 0 ? 'N/A' : passed === asked, asked, passed, details: results }
}

// R2 (§1步骤5): 定闹钟留痕——每一条排钟(at 档也算)的**字条标题**必须能看出
// 「什么时候醒 + 干什么」:含时间锚点(HH:MM / M-D / 明早 / 窗口 / 分钟…),
// 且去掉锚点后还剩 ≥3 个字说事由。"noop"、"23:15 采样"这类空字条 = 违规。
function checkTierAnnotation(events, { minSeconds = 60 } = {}) {
  const ANCHOR = /\d{1,2}:\d{2}|\d{1,2}-\d{1,2}|\d{1,2}\s*月\s*\d{1,2}|明早|明晨|明天|窗口|分钟|小时|今晚/g
  const creates = events.filter(e => e.type === 'schedule_create' && (e.kind === 'at' || e.after >= minSeconds))
  const bad = creates.filter(e => {
    const note = (e.title || '').trim()
    if (!note) return true
    if (!ANCHOR.test(note)) return true
    const rest = note.replace(ANCHOR, '').replace(/[\s\d()（）:：,，、。·\-—/【】\[\]]+/g, '')
    return rest.length < 3
  })
  return { name: `R2 闹钟留痕 (§1步骤5): ≥${minSeconds}s/at 档的字条须写明「何时+干什么」`, ok: creates.length === 0 ? 'N/A' : bad.length === 0, total: creates.length, bad: bad.map(b => `seq=${b.seq} ${b.kind}${b.after ? '/' + b.after + 's' : ''} "${b.title}"`) }
}

// R3 (§1步骤5 节奏恒定·内容必须变): 以 turn 为一个"跳"——排了闹钟却一个字的台词/值班短记都没留
// = 死循环(同一条 turn 里批量建多条闹钟不算两跳,旧版按事件相邻判定会误伤,2026-10-06 修)
function checkNoIdenticalHops(events) {
  const saidTurns = new Set(events.filter(e => e.type === 'message' && e.text).map(e => e.turn))
  const bad = []
  for (const e of events) {
    if (e.type !== 'schedule_create') continue
    if (saidTurns.has(e.turn)) continue
    bad.push({ seq: e.seq, turn: e.turn, after: e.after, title: e.title })
  }
  return { name: 'R3 每跳必须留痕 (§1步骤5): 排了钟的那一跳必须有台词/值班短记', ok: bad.length === 0, bad }
}

// R4 (§1步骤5/睡眠安全): 生命线不断档的硬红线——「删了必须当场补」。
//   节奏（睡多久/盯多密）由女仆自己定,15 分钟只是兜底,评估器不替她判断快慢;
//   但删掉旧钟却不装新钟 = 生命线断,必须抓。at 钟响过要补这一条离线看不到
//   (日志结束可能是因为那条 at 还挂着),所以只作 doctrine,不当断言。
function checkFlatCadence(events) {
  const bad = []
  for (const ev of events) {
    if (ev.type !== 'schedule_delete') continue
    const sameTurn = events.some(x => x.type === 'schedule_create' && x.turn === ev.turn)
    if (!sameTurn) bad.push({ seq: ev.seq, turn: ev.turn, id: ev.id || '?' })
  }
  const total = events.filter(e => e.type === 'schedule_create' || e.type === 'schedule_delete').length
  return { name: 'R4 生命线不断档 (§1步骤5): 删了钟必须当场补上', ok: total === 0 ? 'N/A' : bad.length === 0, total, bad: bad.map(b => `seq=${b.seq} turn=${b.turn} 只删不建(删了 ${b.id})`) }
}

// 参考信息(不算断言):这次会话她自己挑了哪些节奏——15 分钟兜底占多少,其余各是什么
function sumCadence(events) {
  const bySecs = new Map()
  let at = 0
  for (const e of events) {
    if (e.type !== 'schedule_create') continue
    if (e.kind === 'at') { at++; continue }
    bySecs.set(e.after, (bySecs.get(e.after) || 0) + 1)
  }
  const parts = [...bySecs.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}s×${n}`)
  if (at) parts.push(`at(定点)×${at}`)
  return `节奏分布: ${parts.join(', ') || '(无)'}`
}

// ---------- 汇总 ----------
function runL1(sessionDir) {
  const events = parseEvents(readRawEvents(sessionDir))
  const checks = [
    checkQuestionWaitHop(events),
    checkTierAnnotation(events),
    checkNoIdenticalHops(events),
    checkFlatCadence(events),
  ]
  return { session: path.basename(sessionDir), cadence: sumCadence(events), checks }
}

function printResult(r) {
  console.log(`\n=== ${r.session} ===`)
  if (r.cadence) console.log(`  ${r.cadence}`)
  for (const c of r.checks) {
    console.log(`[${typeof c.ok === 'boolean' ? (c.ok ? 'PASS' : 'FAIL') : c.ok}] ${c.name}`)
    for (const d of c.details || []) console.log(`    ${d.ok ? '  ok ' : '  MISS'} seq=${d.seq} "${d.question}" → ${d.evidence}`)
    for (const b of c.bad || []) console.log(`    违规: ${typeof b === 'string' ? b : `seq=${b.seq}${b.turn >= 0 ? ' turn=' + b.turn : ''} ${b.kind || ''}${b.after ? '/' + b.after + 's' : ''} "${b.title}"`}`)
    if (typeof c.asked === 'number') console.log(`    (问到 ${c.asked} 句,安排了查回话 ${c.passed} 句)`)
    if (typeof c.total === 'number') console.log(`    (检查了 ${c.total} 条跳)`)
  }
}

function allSessions(since = null) {
  const rows = fs.readdirSync(SESSIONS_BASE)
    .filter(d => d.startsWith('session-'))
    .map(d => path.join(SESSIONS_BASE, d))
    // 目录 mtime 只在增删文件时变;取目录内最新文件的 mtime 才是"这个会话最近被写过"
    .map(p => ({ p, t: Math.max(...fs.readdirSync(p).map(f => fs.statSync(path.join(p, f)).mtimeMs)) }))
    .sort((a, b) => a.t - b.t)
  // 裸日期按本地时间零点算(否则 Date.parse('2026-10-06') 是 UTC 零点 = 本地 08:00)
  const cut = since ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(since) ? since + 'T00:00:00' : since) : null
  return rows.filter(x => !cut || x.t >= cut).map(x => x.p)
}

const args = process.argv.slice(2)
const cmd = args[0]
const sinceIdx = args.indexOf('--since')
const since = sinceIdx > -1 ? args[sinceIdx + 1] : null
if (cmd === 'list') {
  allSessions(since).forEach(p => console.log(p))
} else if (cmd === 'l1') {
  const idx = args.indexOf('--session')
  if (idx > -1) {
    printResult(runL1(args[idx + 1]))
  } else if (args.includes('--all-sessions')) {
    const results = allSessions(since).map(p => { try { return runL1(p) } catch (e) { return { session: path.basename(p), checks: [{ name: 'parse', ok: `SKIP (${e.message.slice(0, 40)})` }] } } })
    for (const r of results) printResult(r)
    // 总分
    let pass = 0, total = 0
    for (const r of results) for (const c of r.checks) if (typeof c.ok === 'boolean') { total++; if (c.ok) pass++ }
    console.log(`\n=== 离线回归总分: ${pass}/${total}${since ? ` (仅 ${since} 之后改动的会话)` : ''} ===`)
  } else {
    console.log('用法: node maid-test.mjs l1 --session <dir> | --all-sessions [--since 2026-10-06]')
  }
} else {
  console.log('用法: node maid-test.mjs list | l1 [--session <dir> | --all-sessions [--since <日期>]]')
}

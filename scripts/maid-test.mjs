#!/usr/bin/env node
// maid-test.mjs · 女仆验收测试 L1 反射层评估器
// 用法:
//   node maid-test.mjs l1 --session <session-dir>     # 对单个会话跑反射层断言
//   node maid-test.mjs l1 --all-sessions              # 对全部历史女仆会话跑离线回归
//   node maid-test.mjs list                           # 列出可测试的会话
// 断言原语与 spec 映射见 docs/maid-testing.md
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SESSIONS_BASE = 'C:\\Users\\Dao\\.dsh\\sessions\\--C-Users-Dao-anima-home--'
const SCRIPTS = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

// ---------- 日志解析 ----------
function readLog(sessionDir) {
  return execFileSync('node', [path.join(SCRIPTS, 'maid-log.mjs'), sessionDir], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function parseEvents(logText) {
  const marker = /== (tool\/result\/tool|assistant\/message\/assistant) seq=(\d+) ==/g
  const events = []
  let m
  const marks = []
  while ((m = marker.exec(logText))) marks.push({ kind: m[1], seq: Number(m[2]), start: m.index, textStart: logText.indexOf('[text]', m.index) })
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : logText.length
    let text = logText.slice(marks[i].textStart, end).replace(/^\[text\]/, '').trim()
    events.push({ ...marks[i], text })
  }
  // 从 tool/result 块中提取 schedule 事件
  const out = []
  for (const ev of events) {
    if (ev.kind === 'assistant/message/assistant') {
      out.push({ seq: ev.seq, type: 'message', text: ev.text })
      continue
    }
    if (/"afterSeconds"\s*:\s*(\d+)/.test(ev.text) && /"state":"scheduled"/.test(ev.text)) {
      const after = Number(ev.text.match(/"afterSeconds"\s*:\s*(\d+)/)[1])
      const title = (ev.text.match(/"title":"([^"]*)"/) || [])[1] || ''
      const prompt = (ev.text.match(/"prompt":"((?:[^"\\]|\\.)*)"/) || [])[1] || ''
      out.push({ seq: ev.seq, type: 'schedule_create', after, title, prompt, text: ev.text })
      continue
    }
    if (/"deleted":true/.test(ev.text)) {
      const id = (ev.text.match(/"id":"(schedule-[^"]+)"/) || [])[1] || ''
      out.push({ seq: ev.seq, type: 'schedule_delete', id, text: ev.text })
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

// R2 (§1): 定闹钟留痕——≥60s 的闹钟,字条必须写明理由(档/为了/睡到/盯/等/查)
function checkTierAnnotation(events, { minSeconds = 60 } = {}) {
  const creates = events.filter(e => e.type === 'schedule_create' && e.after >= minSeconds)
  const bad = creates.filter(e => !/档|为了|睡到|盯|等|查|窗口|劝睡/.test(e.title + e.prompt))
  return { name: `R2 闹钟留痕 (§1步骤5): ≥${minSeconds}s 的闹钟须有指向/理由`, ok: creates.length === 0 ? 'N/A' : bad.length === 0, total: creates.length, bad: bad.map(b => `after=${b.after}s "${b.title}"`) }
}

// R3 (§2.1 防死循环): 相邻两跳完全相同(同间隔且中间无消息动作)= 死循环
function checkNoIdenticalHops(events) {
  const bad = []
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1], b = events[i]
    if (a.type === 'schedule_create' && b.type === 'schedule_create' && a.after === b.after) {
      bad.push({ seq: b.seq, after: b.after, title: b.title })
    }
  }
  return { name: 'R3 严禁原地复读 (§2.1): 相邻同间隔跳 = 死循环', ok: bad.length === 0, bad }
}

// ---------- 汇总 ----------
function runL1(sessionDir) {
  const events = parseEvents(readLog(sessionDir))
  const checks = [
    checkQuestionWaitHop(events),
    checkTierAnnotation(events),
    checkNoIdenticalHops(events),
  ]
  return { session: path.basename(sessionDir), checks }
}

function printResult(r) {
  console.log(`\n=== ${r.session} ===`)
  for (const c of r.checks) {
    console.log(`[${typeof c.ok === 'boolean' ? (c.ok ? 'PASS' : 'FAIL') : c.ok}] ${c.name}`)
    for (const d of c.details || []) console.log(`    ${d.ok ? '  ok ' : '  MISS'} seq=${d.seq} "${d.question}" → ${d.evidence}`)
    for (const b of c.bad || []) console.log(`    违规: ${typeof b === 'string' ? b : `seq=${b.seq} after=${b.after}s "${b.title}"`}`)
    if (typeof c.total === 'number') console.log(`    (检查了 ${c.total} 条跳)`)
  }
}

function allSessions() {
  return fs.readdirSync(SESSIONS_BASE)
    .filter(d => d.startsWith('session-'))
    .map(d => path.join(SESSIONS_BASE, d))
    .map(p => ({ p, t: fs.statSync(p).mtimeMs }))
    .sort((a, b) => a.t - b.t)
    .map(x => x.p)
}

const args = process.argv.slice(2)
const cmd = args[0]
if (cmd === 'list') {
  allSessions().forEach(p => console.log(p))
} else if (cmd === 'l1') {
  const idx = args.indexOf('--session')
  if (idx > -1) {
    printResult(runL1(args[idx + 1]))
  } else if (args.includes('--all-sessions')) {
    const results = allSessions().map(p => { try { return runL1(p) } catch (e) { return { session: path.basename(p), checks: [{ name: 'parse', ok: `SKIP (${e.message.slice(0, 40)})` }] } } })
    for (const r of results) printResult(r)
    // 总分
    let pass = 0, total = 0
    for (const r of results) for (const c of r.checks) if (typeof c.ok === 'boolean') { total++; if (c.ok) pass++ }
    console.log(`\n=== 离线回归总分: ${pass}/${total} ===`)
  } else {
    console.log('用法: node maid-test.mjs l1 --session <dir> | --all-sessions')
  }
} else {
  console.log('用法: node maid-test.mjs list | l1 [--session <dir> | --all-sessions]')
}

#!/usr/bin/env node
// maid-test.mjs · 女仆验收测试 L1 反射层评估器
// 用法:
//   node maid-test.mjs l1 --session <session-dir>     # 对单个会话跑反射层断言
//   node maid-test.mjs l1 --all-sessions              # 对全部历史女仆会话跑离线回归
//   node maid-test.mjs l1 --all-sessions --since 2026-10-06   # 只算新规矩之后的会话
//   node maid-test.mjs list                           # 列出可测试的会话
//   node maid-test.mjs audit [--file <路径>]           # 女仆手册(SKILL.md)静态体检
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

// ---------- audit:女仆手册静态体检 ----------
// 手册有两份副本,必须保持一致:仓库副本(audit 默认检查对象)与实际运行副本
const MANUAL_REPO = 'C:\\Users\\Dao\\Code\\dao1023\\anima\\skills\\task-brain\\SKILL.md'
const MANUAL_RUNTIME = 'C:\\Users\\Dao\\anima-home\\.agents\\skills\\task-brain\\SKILL.md'

// 重复概念上限 —— 这是**棘轮基线**(= 定稿手册的当前实测值),不是理想值:
// 等于现状即通过,以后任何一次重复累加都会 FAIL;要放宽必须同步改这张表。
const SYMBOL_LIMITS = [
  ['字条', 22],
  ['15 分钟', 8],
  ['2 小时', 5],
  ['一条 active', 1],
  ['恰好一条', 1],
  ['生命线', 5],
  ['留痕', 4],
  ['回话表', 9],
  ['兜底', 11],
  ['静默', 8],
]

// 篇幅棘轮:全文规模也不许再涨(与关键词棘轮同一段报)
// 2026-10-13 上调:语音改后台发射(say 即返 + voice 查证 + 铁律澄清),手册新增约 400 字符
const LENGTH_RATCHET = { chars: 16500, lines: 360 }
const RATCHET_NOTE = '说明: 以上上限是棘轮基线(= 定稿手册的当前实测值),不是理想值;要放宽必须同步改 scripts/maid-test.mjs 里的 SYMBOL_LIMITS / LENGTH_RATCHET。'

// 已废机制残留(出现即违规)。
// 注意:"心跳"不是废词——手册里"你没有心跳"是刻意比喻,必须放过;
// "静默""兜底""字条"都是现行术语,别往这张表里加。
const DEAD_PATTERNS = ['toast', '[SILENT]', '10 秒跳', '10秒跳', '档位', '晨间钟', '睡短觉', '睡长觉', '盯梢期']

// Windows 上文件可能是 CRLF 或 LF:一律按 /\r?\n/ 拆行再比,
// 否则行尾的 \r 会让"两份副本"看起来所有行都不同
function readManualLines(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/)
}

// 某个词在一行里出现几次(不重叠计数)
function countIn(line, word) {
  let n = 0
  let i = line.indexOf(word)
  while (i > -1) { n++; i = line.indexOf(word, i + word.length) }
  return n
}

// ``` 围栏之间的行(含围栏本身)不算正文——孤儿引用只在正文里找
function fenceMask(lines) {
  const mask = new Array(lines.length).fill(false)
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const isFence = /^\s*```/.test(lines[i])
    mask[i] = inFence || isFence
    if (isFence) inFence = !inFence
  }
  return mask
}

// 检查 1:重复概念——同一个词反复出现,说明手册没瘦下来
function auditDuplicateSymbols(lines) {
  const bad = []
  for (const [word, limit] of SYMBOL_LIMITS) {
    let total = 0
    const hits = []
    lines.forEach((line, i) => {
      const n = countIn(line, word)
      if (n > 0) { total += n; hits.push(i + 1) }
    })
    if (total > limit) {
      const shown = hits.slice(0, 8).join(', ')
      bad.push({
        line: hits[0],
        text: `${word} / 实际 ${total} 次 / 上限 ${limit} / 行号 ${shown}${hits.length > 8 ? ` …等 ${hits.length} 行` : ''}`,
      })
    }
  }
  return bad
}

// 检查 2:孤儿引用——正文里的 §N / §N.M / 见"XXX" 必须能找到对应节
function auditOrphans(lines) {
  const fence = fenceMask(lines)
  const nums = []      // 所有节号:'0' / '1' / '2.1'…
  const headings = []  // 任一 # 级标题的正文
  lines.forEach(line => {
    const m2 = line.match(/^## (\d+) ·/)
    const m3 = line.match(/^### (\d+\.\d+) /)
    if (m2) nums.push(m2[1])
    else if (m3) nums.push(m3[1])
    const h = line.match(/^#{1,6}\s+(.*)$/)
    if (h) headings.push(h[1])
  })
  const bad = []
  lines.forEach((line, i) => {
    if (fence[i]) return
    // §N.M 要同名节号;§N 要能找到以该数字开头的节(§4 → 4 或 4.x)
    for (const m of line.matchAll(/§(\d+(?:\.\d+)?)/g)) {
      const ref = m[1]
      const hit = ref.includes('.') ? nums.includes(ref) : nums.some(n => n === ref || n.startsWith(ref + '.'))
      if (!hit) bad.push({ line: i + 1, text: `§${ref} 找不到对应节` })
    }
    // 见"XXX":任一 # 级标题里含 XXX 即算找到
    for (const m of line.matchAll(/见"([^"]{2,20})"/g)) {
      const name = m[1]
      if (!headings.some(h => h.includes(name))) bad.push({ line: i + 1, text: `见"${name}" 找不到对应节` })
    }
  })
  return bad
}

// 检查 3:已废机制残留——出现即违规,附该行前 80 字
function auditDeadCode(lines) {
  const bad = []
  lines.forEach((line, i) => {
    const lower = line.toLowerCase()
    for (const pat of DEAD_PATTERNS) {
      if (lower.includes(pat.toLowerCase())) {
        bad.push({ line: i + 1, text: `${pat} —— ${line.trim().slice(0, 80)}` })
      }
    }
  })
  return bad
}

// 篇幅棘轮:字符数 / 行数,超限即 FAIL 并打印实际值
// 字符数按 **LF 口径**算(先去掉 \r):同一份内容在不同 checkout 的 CRLF/LF 工作区里
// 数值应当一致,否则棘轮会因为行尾风格而误报。
function auditLengthRatchet(text, lines) {
  const chars = text.replace(/\r/g, '').length
  const okChars = chars <= LENGTH_RATCHET.chars
  const okLines = lines.length <= LENGTH_RATCHET.lines
  return {
    ok: okChars && okLines,
    text: `篇幅棘轮: ${chars} 字符 / 上限 ${LENGTH_RATCHET.chars}${okChars ? '' : ' ← 超限'};${lines.length} 行 / 上限 ${LENGTH_RATCHET.lines}${okLines ? '' : ' ← 超限'}`,
  }
}

// 检查 5:近似重复句——去噪后同一句出现 ≥2 次 = 真冗余
// (同一行里出现多次只算一次出现;去噪后不到 SENT_MIN 字的短句不参与比对)
const SENT_MIN = 15

function normalizeSentence(s) {
  return s
    .replace(/[\s*`#|~()（）\-—]+/g, '') // 空白 + markdown 标记
    .replace(/[\p{P}\p{S}]/gu, '')      // 其余标点与符号
}

function auditDuplicateSentences(lines) {
  const seen = new Map()
  lines.forEach((line, i) => {
    for (const seg of line.split(/[。！？；]/)) {
      const norm = normalizeSentence(seg)
      if (norm.length < SENT_MIN) continue
      let e = seen.get(norm)
      if (!e) { e = { sample: norm, lines: new Set() }; seen.set(norm, e) }
      e.lines.add(i + 1)
    }
  })
  const bad = []
  for (const e of seen.values()) {
    if (e.lines.size < 2) continue
    const ls = [...e.lines].sort((a, b) => a - b)
    bad.push({ line: ls[0], text: `${e.sample.slice(0, 40)} / 出现 ${ls.length} 次 / 行号 ${ls.join(', ')}` })
  }
  return bad.sort((a, b) => a.line - b.line)
}

// 检查 4:两份副本一致性——按 /\r?\n/ 拆行后逐行比(只在默认文件时跑)
function auditCopies() {
  const a = readManualLines(MANUAL_REPO)
  const b = readManualLines(MANUAL_RUNTIME)
  const diff = []
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) diff.push({ line: i + 1, a: a[i], b: b[i] })
  }
  return { same: diff.length === 0, count: diff.length, first: diff[0] || null }
}

function printAuditCheck(ok, name, rows) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`)
  if (ok) return
  for (const r of rows) console.log(`    L${r.line}: ${r.text}`)
}

// 重复概念 + 篇幅棘轮同段报:不管通过与否都把实测值和棘轮基线说明印出来
function printAuditRatchet(dup, len) {
  const ok = dup.length === 0 && len.ok
  console.log(`[${ok ? 'PASS' : 'FAIL'}] 重复概念`)
  for (const r of dup) console.log(`    L${r.line}: ${r.text}`)
  console.log(`    ${len.text}`)
  console.log(`    ${RATCHET_NOTE}`)
}

function printAuditCopies(c) {
  if (c.same) { console.log('[PASS] 两份副本一致性'); return }
  console.log('[FAIL] 两份副本一致性')
  console.log(`    不同行数 ${c.count}`)
  console.log('    第一处不同:')
  console.log(`      仓库 L${c.first.line}: ${(c.first.a ?? '(缺失)').trim().slice(0, 80)}${firstDiffHint(c.first.a, c.first.b)}`)
  console.log(`      运行 L${c.first.line}: ${(c.first.b ?? '(缺失)').trim().slice(0, 80)}`)
}

// 两边前 80 字可能长得一模一样(差异在第 80 字之后),所以标出分歧从第几个字符开始
function firstDiffHint(a, b) {
  if (a === undefined || b === undefined) return ''
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return ` (第 ${i + 1} 字符起不同)`
}

function runAudit(file, isDefault) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const dup = auditDuplicateSymbols(lines)
  const len = auditLengthRatchet(text, lines)
  const orphan = auditOrphans(lines)
  const dead = auditDeadCode(lines)
  const dupSent = auditDuplicateSentences(lines)
  const copies = isDefault ? auditCopies() : null
  const dupBad = dup.length + (len.ok ? 0 : 1)
  const copyBad = copies && !copies.same ? 1 : 0
  const total = dupBad + orphan.length + dead.length + dupSent.length + copyBad
  const copyTag = copies ? (copies.same ? 'PASS' : 'FAIL') : 'SKIP'
  console.log(`\n=== 女仆手册体检:${file} ===`)
  printAuditRatchet(dup, len)
  printAuditCheck(orphan.length === 0, '孤儿引用', orphan)
  printAuditCheck(dead.length === 0, '已废机制残留', dead)
  printAuditCheck(dupSent.length === 0, '近似重复句', dupSent)
  if (copies) printAuditCopies(copies)
  else console.log('[SKIP] 两份副本一致性 (--file 指定了非默认文件)')
  console.log(`=== audit: ${total} 项违规 (重复概念 ${dupBad} / 孤儿引用 ${orphan.length} / 废机制 ${dead.length} / 近似重复句 ${dupSent.length} / 副本一致 ${copyTag}) ===`)
  return total
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
} else if (cmd === 'audit') {
  const fileIdx = args.indexOf('--file')
  const custom = fileIdx > -1 ? args[fileIdx + 1] : null
  const target = custom || MANUAL_REPO
  const isDefault = path.resolve(target).toLowerCase() === path.resolve(MANUAL_REPO).toLowerCase()
  if (!fs.existsSync(target)) {
    console.log(`[FAIL] 手册不存在:${target}`)
    process.exit(1)
  }
  process.exit(runAudit(target, isDefault) > 0 ? 1 : 0)
} else {
  console.log('用法: node maid-test.mjs list | l1 [--session <dir> | --all-sessions [--since <日期>]] | audit [--file <路径>]')
}

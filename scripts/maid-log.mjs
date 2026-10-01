#!/usr/bin/env node
// maid-log.mjs · 监工席工具:解码女仆会话日志(v4 = 拼接 zstd 帧,每帧内多行 JSONL)
// 用法: node maid-log.mjs <会话目录或 .zstd 文件> [--all] [--grep 关键词]
//   默认显示 assistant 发言 + 关键事件;--all 全量;--grep 过滤
import { zstdDecompressSync } from 'node:zlib'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
let file = args[0]
const showAll = args.includes('--all')
const grep = args.includes('--grep') ? args[args.indexOf('--grep') + 1] : null

// 支持传会话目录,自动找里面的日志文件
if (!file?.endsWith('.zstd')) {
  const entries = readdirSync(file, { recursive: true }).filter(f => f.endsWith('.zstd'))
  if (entries.length === 0) { console.error('该目录没有 .zstd 会话日志'); process.exit(1) }
  file = join(file, entries.sort().pop())
}

const buf = readFileSync(file)
const magic = Buffer.from('28b52ffd', 'hex')
const events = []
let i = 0
while (i < buf.length) {
  const m = buf.indexOf(magic, i)
  if (m < 0) break
  let next = buf.indexOf(magic, m + 4)
  if (next < 0) next = buf.length
  try {
    const text = zstdDecompressSync(buf.subarray(m, next)).toString('utf8')
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try { events.push(JSON.parse(line)) } catch { /* 截断行跳过 */ }
    }
  } catch { /* magic 误命中,跳过 */ }
  i = next
}
events.sort((a, b) => (a.seq ?? -1) - (b.seq ?? -1))

console.error(`# ${file.split(/[\\/]/).slice(-2)[0]} · ${events.length} 事件`)
for (const j of events) {
  const type = j.type ?? '?'
  const msg = j.data?.message
  const content = msg?.content
  let lines = []
  if (Array.isArray(content)) {
    for (const c of content) {
      if (!c.text) { if (showAll) lines.push(`[${c.type}]`); continue }
      if (c.type === 'reasoning' && !showAll && !grep) continue
      lines.push(`[${c.type}] ${c.text}`)
    }
  } else if (type === 'tool/result' || type === 'command/run' || showAll) {
    lines.push(JSON.stringify(j.data).slice(0, 300))
  }
  if (grep) lines = lines.filter(l => l.includes(grep))
  if (lines.length) {
    console.log(`\n== ${type}${msg?.role ? '/' + msg.role : ''} seq=${j.seq ?? '?'} ==`)
    for (const l of lines) console.log(l.slice(0, 600))
  }
}

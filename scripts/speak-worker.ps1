# speak-worker.ps1 · 女仆的嘴·后台工人(由 maid.ps1 say 甩出来,前台不等它)
# 职责:读任务 JSON -> 按到达顺序排队 -> 合成 -> 播放 -> 写日志 -> 删任务文件
# 用法: powershell -File speak-worker.ps1 -Job <任务JSON路径>
# 契约:不输出给前台(前台早已返回);真相写进 <LogDir>\voice.log 与 last.json,女仆下一跳可查。
param(
  [Parameter(Mandatory=$true)][string]$Job
)
$ErrorActionPreference = 'Stop'
$Scripts = 'C:\Users\Dao\Code\dao1023\anima\scripts'

function Write-VoiceLog([string]$LogDir, [hashtable]$Entry) {
  $line = ($Entry | ConvertTo-Json -Compress -Depth 4)
  try {
    $log = Join-Path $LogDir 'voice.log'
    Add-Content -Path $log -Value $line -Encoding UTF8
    Set-Content -Path (Join-Path $LogDir 'last.json') -Value $line -Encoding UTF8
    # 日志封顶:超过 500KB 只留最后 200 行
    if ((Get-Item $log).Length -gt 500KB) {
      $keep = @(Get-Content $log -Tail 200 -Encoding UTF8)
      Set-Content -Path $log -Value $keep -Encoding UTF8
    }
  } catch { }
}

$jobData = $null
try { $jobData = (Get-Content -Path $Job -Raw -Encoding UTF8) | ConvertFrom-Json } catch { exit 1 }
$LogDir = if ($jobData.logDir) { $jobData.logDir } else { Join-Path $env:TEMP 'anima-voice' }
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$text = [string]$jobData.text
$voice = if ($jobData.voice) { [string]$jobData.voice } else { 'maidvoice-001' }
$noPlay = [bool]$jobData.noPlay
$outFile = if ($jobData.outFile) { [string]$jobData.outFile } else { '' }

# ---- 排队:同目录下任务文件按到达时间先进先出;超过 180 秒没被处理的当作崩掉的工人清掉 ----
$mine = Get-Item -Path $Job
$waited = 0
while ($true) {
  $pending = @(Get-ChildItem -Path (Join-Path $LogDir 'job-*.json') -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)
  if ($pending.Count -eq 0) { break }
  $first = $pending[0]
  if ($first.FullName -eq $mine.FullName) { break }
  if (((Get-Date) - $first.LastWriteTime).TotalSeconds -gt 180) {
    Remove-Item -Path $first.FullName -Force -ErrorAction SilentlyContinue
    continue
  }
  Start-Sleep -Milliseconds 250
  $waited += 250
}

# 计时从"排到我"开始:ms 反映真正的合成+播放耗时,不含排队等待
$t0 = Get-Date

# ---- 合成 + 播放(在工人进程里同步做,前台不等) ----
$ok = $false; $err = ''; $wav = ''
try {
  $pargs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\speak.ps1",'-Text',$text,'-Voice',$voice)
  if ($noPlay) { $pargs += '-NoPlay' }
  if ($noPlay -and $outFile) { $pargs += @('-OutFile', $outFile) }
  $raw = & powershell @pargs 2>&1
  $parsed = $null
  try { $parsed = (@($raw) | ForEach-Object { $_.ToString() }) -join "`n" | ConvertFrom-Json } catch { }
  if ($parsed -and $parsed.ok) { $ok = $true; $wav = [string]$parsed.wav } else { $err = 'synth failed: ' + ((@($raw) -join ' ').Trim()) }
} catch { $err = $_.Exception.Message }

# 需要留档/交付的 wav:搬到指定路径(默认模式由 speak.ps1 自己播放,不搬)
if ($ok -and (-not $noPlay) -and $outFile) {
  try { Move-Item -Path $wav -Destination $outFile -Force; $wav = $outFile } catch { }
}
# 临时 wav 用完即删:放过 TEMP,除非调用方明确要留(-OutFile)
if ($ok -and (-not $outFile) -and (-not $noPlay) -and $wav -and (Test-Path $wav)) {
  try { Remove-Item -Path $wav -Force -ErrorAction SilentlyContinue } catch { }
}

$ms = [int](((Get-Date) - $t0).TotalMilliseconds)
Write-VoiceLog $LogDir @{
  ts        = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  ok        = $ok
  played    = ($ok -and (-not $noPlay))
  ms        = $ms
  voice     = $voice
  chars     = $text.Length
  wav       = $wav
  text      = ($text.Substring(0, [Math]::Min(40, $text.Length)))
  error     = $err
}
Remove-Item -Path $Job -Force -ErrorAction SilentlyContinue
exit 0

# maid.ps1 · 女仆的身体的唯一入口(感官与喉舌;企微/邮件/TTS 服务为外部直连)
# 子命令:probe(在不在) / face(眼睛) / screen(屏幕) / sense(综合) / say(嘴,默认后台发射) / voice(嘴的查证) / toast(通知) / popup(弹窗) / log(日志)
# 契约:成功输出一行 JSON 且 exit 0;任何失败(含异常)输出 {"ok":false,"error":...} 且 exit 1。结果不许不看就当成功。
# 注意 say 的契约不同:它**发射即返回**(合成+播放交给后台工人),返回 queued:true 就是成功的一半;
#      真正的"有没有出声"写进 <TEMP>\anima-voice\voice.log,可用 voice 子命令回查(需要当场确证时用 -Wait)。
param(
  [Parameter(Mandatory)][string]$Cmd,
  [switch]$Face, [switch]$Screen,
  [string]$Text = '', [string]$Meme = '', [string]$Title = '女仆',
  [int]$Seconds = 10, [string]$Gif = '', [string]$OutFile = '',
  [int]$Last = 10, [string]$Since = '', [string]$Until = '', [switch]$Pause, [switch]$Resume,
  [switch]$NoPlay, [switch]$Silent, [switch]$Long, [string]$Session = '',
  [string]$Voice = 'maidvoice-001', [switch]$Wait
)
$ErrorActionPreference = 'Stop'
$Scripts = 'C:\Users\Dao\Code\dao1023\anima\scripts'

function Fail([string]$msg) {
  Write-Output (@{ ok = $false; cmd = $Cmd; error = $msg } | ConvertTo-Json -Compress)
  exit 1
}

# 跑子进程并捕获输出;失败时返回 $null,调用方自行处置
function Run-Child([string]$exe, [string[]]$childArgs) {
  $out = & $exe @childArgs 2>&1
  if ($LASTEXITCODE -ne 0) { return $null }
  return (@($out) | ForEach-Object { $_.ToString() }) -join "`n"
}

try {
  switch ($Cmd) {

    # ---- 感官 -------------------------------------------------------------
    'probe' {
      $out = Run-Child 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\sense-master.ps1")
      if ($null -eq $out) { Fail "probe failed" }
      Write-Output $out
      exit 0
    }

    'face' {
      # 设备偶发占用:失败自动重试一次,这是规程不是可选
      $out = Run-Child 'node' @("$Scripts\sense-face.mjs")
      if ($null -eq $out) {
        Start-Sleep -Seconds 2
        $out = Run-Child 'node' @("$Scripts\sense-face.mjs")
        if ($null -eq $out) { Fail "face failed twice" }
      }
      Write-Output $out
      exit 0
    }

    'screen' {
      $out = Run-Child 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\sense-screen.ps1")
      if ($null -eq $out) { Fail "screen failed" }
      Write-Output $out
      exit 0
    }

    'sense' {
      # 探针必跑;眼睛(慢,20-40s)后台并行,屏幕近路;每路独立报成败,绝不静默
      $result = @{ ok = $true; cmd = 'sense' }

      $faceJob = $null
      if ($Face) {
        $tmp = [IO.Path]::GetTempFileName()
        $faceJob = Start-Process -FilePath 'node' -ArgumentList "`"$Scripts\sense-face.mjs`"" `
          -RedirectStandardOutput $tmp -RedirectStandardError "$tmp.err" -PassThru -NoNewWindow
      }
      try {
        $probeOut = Run-Child 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\sense-master.ps1")
        if ($null -eq $probeOut) { $result.probe = $null; $result.ok = $false; $result.error = 'probe failed' }
        else { $result.probe = $probeOut }

        if ($Screen) {
          $screenOut = Run-Child 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\sense-screen.ps1")
          if ($null -eq $screenOut) { $result.screen = $null; $result.ok = $false; $result.error = (@($result.error) + 'screen failed') }
          else { $result.screen = $screenOut }
        }

        if ($faceJob) {
          $faceJob.WaitForExit(90000) | Out-Null
          if (!$faceJob.HasExited) {
            $faceJob.Kill(); $faceJob.WaitForExit(5000) | Out-Null
            $result.face = $null; $result.ok = $false; $result.error = (@($result.error) + 'face timeout')
          } else {
            $faceOut = [string](Get-Content $tmp -Raw -ErrorAction SilentlyContinue).Trim()
            if ($faceOut) { $result.face = $faceOut }
            else { $result.face = $null; $result.ok = $false; $result.error = (@($result.error) + 'face no output') }
          }
        }
      } finally {
        if ($tmp) { Remove-Item $tmp, "$tmp.err" -ErrorAction SilentlyContinue }
      }
      if ($result.error -is [array]) { $result.error = $result.error -join '; ' }
      Write-Output ($result | ConvertTo-Json -Compress -Depth 4)
      exit 0
    }

    # ---- 喉舌 -------------------------------------------------------------
    'say' {
      if (-not $Text) { Fail 'say requires -Text' }
      $logDir = Join-Path $env:TEMP 'anima-voice'
      if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

      # -Wait:老办法,当场合成+播放完才返回(只在必须确证时用)
      if ($Wait) {
        $pargs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\speak.ps1",'-Text',$Text,'-Voice',$Voice,'-NoPlay')
        $out = Run-Child 'powershell' $pargs
        if ($null -eq $out) { Fail "say: synth failed" }
        $parsed = $null
        try { $parsed = $out | ConvertFrom-Json } catch { Fail "say: unparsable output: $out" }
        if (-not $parsed.wav) { Fail "say: no wav in output: $out" }
        $wavPath = $parsed.wav
        if ($OutFile) { Move-Item $wavPath $OutFile -Force; $wavPath = $OutFile }
        if (-not (Test-Path $wavPath)) { Fail "say: wav missing: $wavPath" }
        $played = $false
        if (-not $NoPlay) {
          try { $player = New-Object System.Media.SoundPlayer($wavPath); $player.PlaySync(); $played = $true } catch { $played = $false }
        }
        Write-Output (@{ ok = $true; cmd = 'say'; queued = $false; wav = $wavPath; played = $played } | ConvertTo-Json -Compress)
        exit 0
      }

      # 默认:发射即走——把任务写成 JSON 交给后台工人,前台立刻返回
      $jobPath = Join-Path $logDir ("job-{0}-{1}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), (Get-Random -Maximum 9999))
      $job = @{ text = $Text; voice = $Voice; noPlay = [bool]$NoPlay; outFile = $OutFile; logDir = $logDir } | ConvertTo-Json -Compress
      Set-Content -Path $jobPath -Value $job -Encoding UTF8
      $wargs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\speak-worker.ps1",'-Job',$jobPath)
      try {
        Start-Process powershell -ArgumentList $wargs -WindowStyle Hidden | Out-Null
      } catch {
        Remove-Item $jobPath -Force -ErrorAction SilentlyContinue
        Fail ("say: cannot launch worker: " + $_.Exception.Message)
      }
      Write-Output (@{ ok = $true; cmd = 'say'; queued = $true; voice = $Voice; chars = $Text.Length; log = (Join-Path $logDir 'voice.log') } | ConvertTo-Json -Compress)
      exit 0
    }

    # 嘴的查证:读最近几条出声记录(后台工人的真实结果)
    'voice' {
      $logDir = Join-Path $env:TEMP 'anima-voice'
      $log = Join-Path $logDir 'voice.log'
      $entries = @()
      if (Test-Path $log) {
        foreach ($l in @(Get-Content $log -Tail 5 -Encoding UTF8)) {
          if (-not $l.Trim()) { continue }
          try { $entries += ($l | ConvertFrom-Json) } catch { }
        }
      }
      $pending = @(Get-ChildItem -Path (Join-Path $logDir 'job-*.json') -ErrorAction SilentlyContinue).Count
      Write-Output (@{ ok = $true; cmd = 'voice'; pending = $pending; entries = $entries } | ConvertTo-Json -Compress -Depth 5)
      exit 0
    }

    # ---- 耳朵(ear.log 只读账本 + 暂停/恢复) --------------------------------
    'ear' {
      $earDir = Join-Path $env:TEMP 'anima-ear'
      $pauseFile = Join-Path $earDir 'PAUSED'
      if ($Pause) {
        New-Item -ItemType File -Force -Path $pauseFile | Out-Null
        Write-Output (@{ ok = $true; cmd = 'ear'; paused = $true } | ConvertTo-Json -Compress)
        exit 0
      }
      $pausedNow = Test-Path $pauseFile
      if ($Resume) {
        Remove-Item $pauseFile -ErrorAction SilentlyContinue
        Write-Output (@{ ok = $true; cmd = 'ear'; paused = $false } | ConvertTo-Json -Compress)
        exit 0
      }
      $entries = @()
      $log = Join-Path $earDir 'ear.log'
      if (Test-Path $log) {
        $lines = @(Get-Content $log -Tail 500 -Encoding UTF8)
        if ($Last -gt 0 -and $Last -lt 500) { $lines = @(Get-Content $log -Tail $Last -Encoding UTF8) }
        foreach ($l in $lines) {
          if (-not $l.Trim()) { continue }
          try { $e = $l | ConvertFrom-Json } catch { continue }
          if ($Since -and [datetime]$e.ts -lt [datetime]$Since) { continue }
          if ($Until -and [datetime]$e.ts -gt [datetime]$Until) { continue }
          if ($Text -and $e.text -notmatch [regex]::Escape($Text)) { continue }
          $entries += $e
        }
      }
      Write-Output (@{ ok = $true; cmd = 'ear'; paused = $pausedNow; count = $entries.Count; entries = $entries } | ConvertTo-Json -Compress -Depth 5)
      exit 0
    }

    'toast' {
      if (-not $Text) { Fail 'toast requires -Text' }
      $pargs = @('-WindowStyle','Hidden','-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\notify-toast.ps1",'-Title',$Title,'-Text',$Text)
      if ($Meme) { $pargs += @('-Meme', $Meme) }
      if ($Long) { $pargs += '-Long' }
      if ($Silent) { $pargs += '-Silent' }
      $out = Run-Child 'powershell' $pargs
      if ($null -eq $out) { Fail "toast failed" }
      Write-Output (@{ ok = $true; cmd = 'toast' } | ConvertTo-Json -Compress)
      exit 0
    }

    'popup' {
      if (-not $Text) { Fail 'popup requires -Text' }
      $pargs = @('-STA','-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\notify-popup.ps1",'-Title',$Title,'-Text',$Text,'-Seconds',$Seconds)
      if ($Meme) { $pargs += @('-Meme', $Meme) }
      if ($Gif) { $pargs += @('-Gif', $Gif) }
      $out = Run-Child 'powershell' $pargs
      if ($null -eq $out) { Fail "popup failed" }
      Write-Output (@{ ok = $true; cmd = 'popup' } | ConvertTo-Json -Compress)
      exit 0
    }

    # ---- 日志 -------------------------------------------------------------
    'log' {
      if (-not $Session) { Fail 'log requires -Session <session-dir>' }
      & node "$Scripts\maid-log.mjs" $Session
      if ($LASTEXITCODE -ne 0) { Fail "log failed (exit $LASTEXITCODE)" }
      exit 0
    }

    default { Fail "unknown cmd '$Cmd' (use probe/face/screen/sense/say/voice/toast/popup/log)" }
  }
} catch {
  Fail "unexpected: $($_.Exception.Message)"
}

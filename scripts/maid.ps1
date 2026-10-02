# maid.ps1 · 女仆的身体的唯一入口
# 子命令:probe(在不在) / face(眼睛) / screen(屏幕) / sense(综合) / say(嘴) / toast / popup(喉舌) / log(日志)
# 约定:成功输出一行 JSON 且 exit 0;失败输出 {"ok":false,"error":...} 且 exit 1。结果不许不看就当成功。
param(
  [Parameter(Mandatory)][string]$Cmd,
  [switch]$Face, [switch]$Screen,
  [string]$Text = '', [string]$Meme = '', [string]$Title = '女仆',
  [int]$Seconds = 10, [string]$Gif = '', [string]$OutFile = '',
  [switch]$NoPlay, [switch]$Silent, [switch]$Long, [string]$Session = ''
)
$ErrorActionPreference = 'Stop'
$Scripts = 'C:\Users\Dao\Code\dao1023\anima\scripts'

function Fail([string]$msg) {
  Write-Output (@{ ok = $false; cmd = $Cmd; error = $msg } | ConvertTo-Json -Compress)
  exit 1
}

switch ($Cmd) {

  # ---- 感官 -------------------------------------------------------------
  'probe' {
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$Scripts\sense-master.ps1"
    if ($LASTEXITCODE -ne 0) { Fail "probe failed (exit $LASTEXITCODE)" }
  }

  'face' {
    # 设备偶发占用:失败自动重试一次,这是规程不是可选
    $out = & node "$Scripts\sense-face.mjs" 2>&1
    if ($LASTEXITCODE -ne 0) {
      Start-Sleep -Seconds 2
      $out = & node "$Scripts\sense-face.mjs" 2>&1
      if ($LASTEXITCODE -ne 0) { Fail "face failed twice: $out" }
    }
    $out
  }

  'screen' {
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$Scripts\sense-screen.ps1"
    if ($LASTEXITCODE -ne 0) { Fail "screen failed (exit $LASTEXITCODE)" }
  }

  'sense' {
    # 探针必跑;眼睛(慢,20-40s)后台并行,屏幕近路;汇总一行
    $faceJob = $null
    if ($Face) {
      $tmp = [IO.Path]::GetTempFileName()
      $faceJob = Start-Process -FilePath 'node' -ArgumentList "`"$Scripts\sense-face.mjs`"" `
        -RedirectStandardOutput $tmp -RedirectStandardError "$tmp.err" -PassThru -NoNewWindow
    }
    $probeOut = & powershell -NoProfile -ExecutionPolicy Bypass -File "$Scripts\sense-master.ps1"
    $screenOut = ''
    if ($Screen) {
      $screenOut = (& powershell -NoProfile -ExecutionPolicy Bypass -File "$Scripts\sense-screen.ps1") -join "`n"
      if ($LASTEXITCODE -ne 0) { $screenOut = '' }
    }
    $faceOut = ''
    if ($faceJob) {
      $faceJob.WaitForExit(90000) | Out-Null
      if (!$faceJob.HasExited) { $faceJob.Kill(); $faceOut = '{"face":"timeout"}' }
      else { $faceOut = [string](Get-Content $tmp -Raw -ErrorAction SilentlyContinue).Trim() }
      Remove-Item $tmp, "$tmp.err" -ErrorAction SilentlyContinue
    }
    Write-Output (@{ ok = $true; cmd = 'sense'; probe = $probeOut; face = $faceOut; screen = $screenOut } | ConvertTo-Json -Compress -Depth 4)
  }

  # ---- 喉舌 -------------------------------------------------------------
  'say' {
    if (-not $Text) { Fail 'say requires -Text' }
    $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\speak.ps1",'-Text',$Text,'-NoPlay')
    $out = & powershell @args 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "say failed: $out" }
    $wav = ($out | ConvertFrom-Json).wav
    if (-not ($OutFile)) { $OutFile = $wav }
    else { Move-Item $wav $OutFile -Force }
    if (-not $NoPlay) {
      $player = New-Object System.Media.SoundPlayer($OutFile)
      $player.PlaySync()
    }
    Write-Output (@{ ok = $true; cmd = 'say'; wav = $OutFile; played = (-not $NoPlay) } | ConvertTo-Json -Compress)
  }

  'toast' {
    if (-not $Text) { Fail 'toast requires -Text' }
    $args = @('-WindowStyle','Hidden','-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\notify-toast.ps1",'-Title',$Title,'-Text',$Text)
    if ($Meme) { $args += @('-Meme', $Meme) }
    if ($Long) { $args += '-Long' }
    if ($Silent) { $args += '-Silent' }
    $out = & powershell @args 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "toast failed: $out" }
    Write-Output (@{ ok = $true; cmd = 'toast' } | ConvertTo-Json -Compress)
  }

  'popup' {
    if (-not $Text) { Fail 'popup requires -Text' }
    $args = @('-STA','-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\notify-popup.ps1",'-Title',$Title,'-Text',$Text,'-Seconds',$Seconds)
    if ($Meme) { $args += @('-Meme', $Meme) }
    if ($Gif) { $args += @('-Gif', $Gif) }
    $out = & powershell @args 2>&1
    if ($LASTEXITCODE -ne 0) { Fail "popup failed: $out" }
    Write-Output (@{ ok = $true; cmd = 'popup' } | ConvertTo-Json -Compress)
  }

  # ---- 日志 -------------------------------------------------------------
  'log' {
    if (-not $Session) { Fail 'log requires -Session <session-dir>' }
    & node "$Scripts\maid-log.mjs" $Session
    if ($LASTEXITCODE -ne 0) { Fail "log failed (exit $LASTEXITCODE)" }
  }

  default { Fail "unknown cmd '$Cmd' (use probe/face/screen/sense/say/toast/popup/log)" }
}

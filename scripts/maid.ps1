# maid.ps1 · 女仆的身体的唯一入口(感官与喉舌;企微/邮件/TTS 服务为外部直连)
# 子命令:probe(在不在) / face(眼睛) / screen(屏幕) / sense(综合) / say(嘴) / toast(通知) / popup(弹窗) / log(日志)
# 契约:成功输出一行 JSON 且 exit 0;任何失败(含异常)输出 {"ok":false,"error":...} 且 exit 1。结果不许不看就当成功。
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
      $pargs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"$Scripts\speak.ps1",'-Text',$Text,'-NoPlay')
      $out = Run-Child 'powershell' $pargs
      if ($null -eq $out) { Fail "say: synth failed" }
      $parsed = $null
      try { $parsed = $out | ConvertFrom-Json } catch { Fail "say: unparsable output: $out" }
      if (-not $parsed.wav) { Fail "say: no wav in output: $out" }
      $wavPath = $parsed.wav
      if ($OutFile) {
        Move-Item $wavPath $OutFile -Force
        $wavPath = $OutFile
      }
      if (-not (Test-Path $wavPath)) { Fail "say: wav missing: $wavPath" }
      $played = $false
      if (-not $NoPlay) {
        try {
          $player = New-Object System.Media.SoundPlayer($wavPath)
          $player.PlaySync()
          $played = $true
        } catch { $played = $false }  # 合成成功但播放失败:不算整体失败,如实标注
      }
      Write-Output (@{ ok = $true; cmd = 'say'; wav = $wavPath; played = $played } | ConvertTo-Json -Compress)
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

    default { Fail "unknown cmd '$Cmd' (use probe/face/screen/sense/say/toast/popup/log)" }
  }
} catch {
  Fail "unexpected: $($_.Exception.Message)"
}

# 女仆的嘴:文本 -> MOSS-TTS-Nano 合成(本机 5050) -> 播放
# 用法: powershell -File speak.ps1 -Text "主人,早上好" [-Voice maidvoice-001] [-OutFile 路径] [-NoPlay]
param(
  [Parameter(Mandatory=$true)][string]$Text,
  [string]$Voice = "maidvoice-001",
  [string]$OutFile,
  [switch]$NoPlay
)
$ErrorActionPreference = "Stop"
$out = if ($OutFile) { $OutFile } else { Join-Path $env:TEMP ("maid-speak-{0}.wav" -f (Get-Random)) }

$body = @{ text = $Text; voice = $Voice; seed = 11 } | ConvertTo-Json
try {
  Invoke-WebRequest -Uri "http://127.0.0.1:5050/synthesize" -Method Post `
    -ContentType "application/json; charset=utf-8" -Body $body -OutFile $out -UseBasicParsing | Out-Null
} catch {
  Write-Output (@{ ok=$false; error="TTS server unreachable: " + $_.Exception.Message } | ConvertTo-Json -Compress)
  exit 1
}

if (-not $NoPlay) {
  $player = New-Object System.Media.SoundPlayer($out)
  $player.PlaySync()
}
Write-Output (@{ ok=$true; wav=$out; voice=$Voice; chars=$Text.Length } | ConvertTo-Json -Compress)

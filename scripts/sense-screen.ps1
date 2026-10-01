# sense-screen.ps1 · 截屏感知:ffmpeg gdigrab 抓桌面存图,只看不操作
# 用法: pwsh -NoProfile -File sense-screen.ps1 [输出路径]
param([string]$Out = (Join-Path $PSScriptRoot '.screen.jpg'))

$ff = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ff) { Write-Output (ConvertTo-Json @{ error = 'ffmpeg not found' }); exit 1 }

& ffmpeg -hide_banner -loglevel error -f gdigrab -framerate 2 -i desktop -frames:v 3 -vf "scale=1280:-1" -update 1 -y $Out 2>$null
if (Test-Path $Out) {
  $kb = [int]((Get-Item $Out).Length / 1KB)
  Write-Output (ConvertTo-Json @{ saved = $Out; size_kb = $kb })
} else {
  Write-Output (ConvertTo-Json @{ error = 'capture failed' })
}

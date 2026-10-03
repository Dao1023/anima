# sense-screen.ps1 · 截屏感知:ffmpeg gdigrab 抓桌面存图,只看不操作
# 用法: pwsh -NoProfile -File sense-screen.ps1 [输出路径]
param([string]$Out = (Join-Path $PSScriptRoot '.screen.jpg'))

$ff = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ff) { Write-Output (ConvertTo-Json @{ error = 'ffmpeg not found' }); exit 1 }

# 1) 清掉残留 ffmpeg(摄像头/屏幕捕获是独占的,僵尸进程会锁死设备)
Get-Process ffmpeg -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300
# 2) 先删旧文件,杜绝"失败后旧图冒充新图";删除失败必须报错,不许静默捡旧图
$staleError = $null
try { Remove-Item $Out -Force -ErrorAction Stop } catch { $staleError = $_.Exception.Message }
$preExists = Test-Path $Out

& ffmpeg -hide_banner -loglevel error -f gdigrab -framerate 2 -i desktop -frames:v 3 -vf "scale=1280:-1" -update 1 -y $Out 2>$null
$fresh = (Test-Path $Out) -and ((Get-Item $Out).Length -gt 5000) -and ((Get-Item $Out).LastWriteTime -gt (Get-Date).AddSeconds(-30))
if ($fresh) {
  $kb = [int]((Get-Item $Out).Length / 1KB)
  Write-Output (ConvertTo-Json @{ saved = $Out; size_kb = $kb; captured_at = (Get-Date -Format 'HH:mm:ss') })
} else {
  # 旧图还在且新图没写成 → 这是"拿到了陈旧画面",必须如实说,不能报成功
  if ($preExists -or $staleError) {
    Write-Output (ConvertTo-Json @{ error = 'capture failed AND stale frame still present (stale image is NOT fresh data)'; stale = $true; stale_error = $staleError })
  } else {
    Write-Output (ConvertTo-Json @{ error = 'capture failed'; note = '旧图已删,此为真实失败' })
  }
  exit 1
}

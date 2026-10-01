# dsh-anima 一键安装到 desktop profile
# 用法:先完全退出 DeepSeek Harness 桌面客户端,再右键"使用 PowerShell 运行"本脚本
# 幂等:重复运行安全;出错自动回滚 package.json
#
# 教训(2026-10-01 实录):
#  - Windows PowerShell 5.1 的 `Set-Content -Encoding UTF8` 会写 BOM,
#    DSH 的 JSON.parse 见 BOM 即炸 -> 桌面端崩溃循环。必须用 .NET API 写无 BOM UTF-8。
#  - 老 pnpm 不认 --no-fund/--no-audit,一律不带旗标。
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$pkgPath    = Join-Path $profileDir 'package.json'
$pluginSrc  = 'C:\Users\Dao\Code\dao1023\anima\plugin'
$utf8NoBom  = New-Object System.Text.UTF8Encoding($false)

Write-Host "== dsh-anima 安装器 ==" -ForegroundColor Cyan

# 0. 前置检查
if (-not (Test-Path $pkgPath)) { throw "找不到 $pkgPath — desktop profile 不存在?" }
if (-not (Test-Path (Join-Path $pluginSrc 'lib\index.js'))) { throw "插件未构建: $pluginSrc\lib\index.js 缺失,先在 plugin 目录 npm run build" }
$proc = Get-Process -Name '*deepseek*','*dsh*' -ErrorAction SilentlyContinue
if ($proc) {
  Write-Host "检测到疑似 DSH 进程在运行: $($proc.Name -join ', ')" -ForegroundColor Yellow
  $ans = Read-Host '建议先完全退出桌面客户端。仍要继续? (y/N)'
  if ($ans -ne 'y') { exit 1 }
}

# 1. 备份
Copy-Item $pkgPath "$pkgPath.bak-anima" -Force
Write-Host "[1/4] 已备份 package.json -> package.json.bak-anima"

# 2. 注入依赖 + bundle 条目(幂等),无 BOM 写出
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$changed = $false
if (-not $pkg.dependencies.PSObject.Properties['dsh-anima']) {
  $pkg.dependencies | Add-Member -NotePropertyName 'dsh-anima' -NotePropertyValue "link:$($pluginSrc -replace '\\','/')" -Force
  $changed = $true
}
if ($pkg.dsh.profile.bundles -notcontains 'dsh-anima') {
  $pkg.dsh.profile.bundles += 'dsh-anima'
  $changed = $true
}
if (-not $changed) { Write-Host "[2/4] package.json 已包含 dsh-anima,跳过注入" }
else {
  [System.IO.File]::WriteAllText($pkgPath, ($pkg | ConvertTo-Json -Depth 10), $utf8NoBom)
  Write-Host "[2/4] 已注入依赖 + bundles 条目(无 BOM)"
}

# 3. pnpm 安装(link 本地目录;不带任何旗标,兼容新旧 pnpm)
Push-Location $profileDir
try {
  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pnpm) { & pnpm install 2>&1 | Write-Host }
  else {
    Write-Host 'PATH 无 pnpm,尝试 corepack...'
    & corepack pnpm install 2>&1 | Write-Host
  }
  if ($LASTEXITCODE -ne 0) { throw "pnpm install 失败 (exit $LASTEXITCODE)" }
} finally { Pop-Location }

# 4. 验证 + BOM 自检
$linked = Join-Path $profileDir 'node_modules\dsh-anima\lib\index.js'
$head = Get-Content $pkgPath -AsByteStream -TotalCount 3 -ErrorAction SilentlyContinue
if (-not $head) { $head = Get-Content $pkgPath -Encoding Byte -TotalCount 3 }
if (($head -join ' ') -eq '239 187 191') { throw 'package.json 带 BOM,这会让桌面端崩溃!检查写入方式' }
if (Test-Path $linked) {
  Write-Host "[4/4] 验证通过: link 已落地,package.json 无 BOM" -ForegroundColor Green
  Write-Host ''
  Write-Host '安装完成! (重)启动桌面客户端 -> 任意会话里说"查一下我的任务"即可验收。' -ForegroundColor Green
  Write-Host '如需卸载: 还原 package.json.bak-anima 后在 profile 目录跑 pnpm install。'
} else {
  Write-Host "验证失败: $linked 不存在,回滚 package.json..." -ForegroundColor Red
  Copy-Item "$pkgPath.bak-anima" $pkgPath -Force
  throw '安装未完成,已回滚'
}

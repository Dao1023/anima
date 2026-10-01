# notify-toast.ps1 · 女仆的手:Windows 系统通知
# 用法:
#   pwsh -File notify-toast.ps1 -Text "主人,该喝水了"
#   pwsh -File notify-toast.ps1 -Text "早——" -Title "女仆" -Image "C:\path\meme.png"
#   pwsh -File notify-toast.ps1 -Text "干得漂亮!" -Long          # 长驻 25s
param(
  [Parameter(Mandatory)][string]$Text,
  [string]$Title = '',
  [string]$Image = '',
  [string]$Meme = '',      # 表情包前缀,如 praise / nudge / morning;随机挑一张
  [switch]$Long,
  [switch]$Silent   # 不响声
)

$ErrorActionPreference = 'Stop'

# -Meme: 从 ~/.anima/memes 按关键词匹配文件名随机挑一张(命名[意思]_[人物]_[动作])
if ($Meme -and -not $Image) {
  $dir = Join-Path $env:USERPROFILE '.anima\memes'
  $pick = Get-ChildItem $dir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -match '\.(png|jpg|jpeg|gif)$' -and $_.Name -match [regex]::Escape($Meme) } |
    Get-Random -Count 1
  if ($pick) { $Image = $pick.FullName }
}

$ErrorActionPreference = 'Stop'

# 加载 WinRT(零依赖,PoSh7 直接用)
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]

# AUMID:借用开始菜单里已注册的应用,免注册弹 toast
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'

$t = [System.Security.SecurityElement]::Escape($Text)
$titleXml = if ($Title) { "<text>$([System.Security.SecurityElement]::Escape($Title))</text>" } else { '' }
$imgXml   = if ($Image -and (Test-Path $Image)) { "<image placement='hero' src='file:///$($Image -replace '\\','/')'/>" } else { '' }
$duration = if ($Long) { 'long' } else { 'short' }
$sound    = if ($Silent) { ' silent=' + "'" + 'true' + "'" + '' } else { '' }

$xml = @"
<toast duration="$duration"$sound>
  <visual>
    <binding template="ToastGeneric">
      $titleXml
      <text>$t</text>
      $imgXml
    </binding>
  </visual>
</toast>
"@

$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$toast = New-Object Windows.UI.Notifications.ToastNotification($doc)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
Write-Output "toast shown: $Text"

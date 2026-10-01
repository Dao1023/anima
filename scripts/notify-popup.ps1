# notify-popup.ps1 · 女仆的手(进阶):桌面动图弹窗
# WPF 无边框置顶窗,支持动画 GIF + 多行文字,自动关闭
# 用法(必须 -STA,WPF 要求):
#   powershell -STA -NoProfile -ExecutionPolicy Bypass -File notify-popup.ps1 -Text "主人~" -Gif "C:\...\meme.gif" -Seconds 8
#   powershell -STA ... -File notify-popup.ps1 -Text "干得漂亮" -Meme "欸嘿"
param(
  [Parameter(Mandatory)][string]$Text,
  [string]$Title = '女仆',
  [string]$Gif = '',
  [string]$Meme = '',      # 关键词,从 ~/.anima/memes 挑,同 notify-toast
  [int]$Seconds = 10
)

$ErrorActionPreference = 'Stop'
if ($Meme -and -not $Gif) {
  $dir = Join-Path $env:USERPROFILE '.anima\memes'
  $pick = Get-ChildItem $dir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -match '\.(png|jpg|jpeg|gif)$' -and $_.Name -match [regex]::Escape($Meme) } |
    Get-Random -Count 1
  if ($pick) { $Gif = $pick.FullName }
}

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" SizeToContent="WidthAndHeight">
  <Border Background="#F2FFFFFF" CornerRadius="14" Padding="18,14"
          BorderBrush="#FFD8B4E8" BorderThickness="1.5">
    <StackPanel>
      <TextBlock x:Name="TitleText" Text="$Title" FontSize="12" Foreground="#FF9C6BB3"
                 FontWeight="SemiBold" Margin="0,0,0,6"/>
      <Image x:Name="MemeImage" MaxWidth="240" MaxHeight="240" Stretch="Uniform"/>
      <TextBlock x:Name="BodyText" Text="$Text" FontSize="14" Foreground="#FF3A3A3A"
                 TextWrapping="Wrap" MaxWidth="260" Margin="0,6,0,0"/>
    </StackPanel>
  </Border>
</Window>
"@

# XAML 里的 XML 转义由调用方保证;这里替换占位防注入失败
$escT = [System.Security.SecurityElement]::Escape($Title)
$escB = [System.Security.SecurityElement]::Escape($Text)
$xaml = $xaml.Replace('$Title', $escT).Replace('$Text', $escB)

$window = [Windows.Markup.XamlReader]::Parse($xaml)

if ($Gif -and (Test-Path $Gif)) {
  $img = $window.FindName('MemeImage')
  $src = New-Object System.Windows.Media.Imaging.BitmapImage
  $src.BeginInit()
  $src.UriSource = [Uri]((Resolve-Path $Gif).Path)
  $src.CacheOption = 'OnLoad'
  $src.EndInit()
  $img.Source = $src
  $img.Visibility = 'Visible'
}

# 右下角,贴任务栏上方
$window.Add_Loaded({
  $wa = [System.Windows.SystemParameters]::WorkArea
  $window.Left = $wa.Right - $window.ActualWidth - 24
  $window.Top = $wa.Bottom - $window.ActualHeight - 24
})
# 点一下就关(不打扰)
$window.Add_MouseDown({ $window.Close() })

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds($Seconds)
$timer.Add_Tick({ $window.Close(); $timer.Stop() })

$window.Show()
$timer.Start()
$dispatcher = [System.Windows.Threading.Dispatcher]::CurrentDispatcher
$end = (Get-Date).AddSeconds($Seconds + 5)
while ((Get-Date) -lt $end -and $window.IsVisible) {
  $dispatcher.Invoke([Action]{}, [System.Windows.Threading.DispatcherPriority]::Background)
  Start-Sleep -Milliseconds 100
}
Write-Output "popup shown: $Text"

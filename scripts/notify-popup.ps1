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

# 自藏控制台:弹窗不该带黑框(无论调用方式如何都生效)
Add-Type -Name Win -Namespace Native -MemberDefinition '
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();'
$hwnd = [Native.Win]::GetConsoleWindow()
if ($hwnd -ne [IntPtr]::Zero) { [Native.Win]::ShowWindow($hwnd, 0) | Out-Null }
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
  $path = (Resolve-Path $Gif).Path
  if ($path -match '\.gif$') {
    $dec = [System.Windows.Media.Imaging.GifBitmapDecoder]::new([Uri]$path,
            [System.Windows.Media.Imaging.BitmapCreateOptions]::None,
            [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
    if ($dec.Frames.Count -gt 1) {
      # 手动逐帧播放:预解码全部帧(避免播放中解码卡顿),50ms/帧 ≈ 20fps
      $frames = @($dec.Frames | ForEach-Object { $_ })
      $img.Source = $frames[0]
      $script:frameIdx = 0
      $anim = New-Object System.Windows.Threading.DispatcherTimer
      $anim.Interval = [TimeSpan]::FromMilliseconds(33)
      $anim.Add_Tick({
        $script:frameIdx = ($script:frameIdx + 1) % $frames.Count
        $img.Source = $frames[$script:frameIdx]
      })
      $anim.Start()
    } else {
      $img.Source = $dec.Frames[0]
    }
  } else {
    # 静态图(png/jpg):BitmapImage 通吃
    $src = New-Object System.Windows.Media.Imaging.BitmapImage
    $src.BeginInit()
    $src.UriSource = [Uri]$path
    $src.CacheOption = 'OnLoad'
    $src.EndInit()
    $img.Source = $src
  }
  $img.Visibility = 'Visible'
}

# 屏幕中上位置,保证看见;Loaded 后用实际尺寸定位
$window.Add_Loaded({
  $wa = [System.Windows.SystemParameters]::WorkArea
  $window.Left = ($wa.Right - $window.ActualWidth) / 2
  $window.Top = $wa.Top + 80
})
# 点一下就关(不打扰)
$window.Add_MouseDown({ $window.Close() })

# 原生消息循环全速泵帧(手摇泵 sleep+Invoke 有开销,帧率上不去)
$window.Show()

$autoClose = New-Object System.Windows.Threading.DispatcherTimer
$autoClose.Interval = [TimeSpan]::FromSeconds($Seconds)
$autoClose.Add_Tick({ $window.Close() })
$autoClose.Start()

$app = New-Object System.Windows.Application
$app.ShutdownMode = 'OnMainWindowClose'
$null = $app.Run($window)
Write-Output "popup shown: $Text"

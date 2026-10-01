# maid-widget.ps1 · 桌面常驻小组件:今日三件事
# 无边框置顶便签:显示按重要性排序的前 3 个活跃任务,10 分钟自刷新,可拖动,右键退出
# 用法: powershell -STA -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File maid-widget.ps1
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

# 自藏控制台
Add-Type -Name Win -Namespace Native -MemberDefinition '
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();'
$hwnd = [Native.Win]::GetConsoleWindow()
if ($hwnd -ne [IntPtr]::Zero) { [Native.Win]::ShowWindow($hwnd, 0) | Out-Null }

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
Add-Type -AssemblyName System.Data

$DB = Join-Path $env:USERPROFILE '.anima\archive.db'

function Get-TopTasks([int]$n = 3) {
  # 读库用 node 子进程(node:sqlite 是我们的家,PS 侧不引 SQLite 驱动)
  $rows = @()
  $json = & node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});const now=Math.floor(Date.now()/1000);const DAY=86400;const rows=db.prepare(\`"SELECT t.id,t.title,t.drive,t.priority,s.deadline,s.anchor,s.expected_duration FROM tasks t LEFT JOIN schedule s ON s.task_id=t.id WHERE t.status='active'\`").all();const imp=r=>r.drive==='start'?Math.log(Math.max(r.anchor&&r.expected_duration?(now-r.anchor)/r.expected_duration:1e-4,1e-4)):-Math.log(Math.max((r.deadline-now)/DAY,1e-4));rows.sort((a,b)=>imp(b)-imp(a));console.log(JSON.stringify(rows.slice(0,$n).map(r=>({title:r.title,drive:r.drive,imp:Math.round(imp(r)*100)/100,ddl:r.deadline?Math.round((r.deadline-now)/DAY*10)/10:null,since:r.anchor?Math.round((now-r.anchor)/DAY*10)/10:null}))))" $DB 2>$null
  if ($json) { try { $rows = $json | ConvertFrom-Json } catch {} }
  return $rows
}

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" Width="252" SizeToContent="Height">
  <Border Background="#F7FBF7FB" CornerRadius="12" Padding="14,10" BorderBrush="#FFE0D5EC" BorderThickness="1">
    <StackPanel>
      <Grid>
        <TextBlock Text="今日三件事" FontSize="12" FontWeight="SemiBold" Foreground="#FF9C6BB3"/>
        <TextBlock x:Name="Updated" Text="" FontSize="9" Foreground="#FFB9B9B9" HorizontalAlignment="Right"/>
      </Grid>
      <StackPanel x:Name="List" Margin="0,8,0,0"/>
      <TextBlock Text="拖动移动 · 右键退出 · 10 分钟自刷新" FontSize="9" Foreground="#FFC9C9C9" Margin="0,8,0,0"/>
    </StackPanel>
  </Border>
</Window>
"@

$window = [Windows.Markup.XamlReader]::Parse($xaml.OuterXml)
$list = $window.FindName('List')
$updated = $window.FindName('Updated')

function Refresh-List {
  $list.Children.Clear()
  $tasks = Get-TopTasks 3
  if ($tasks.Count -eq 0) {
    $t = New-Object System.Windows.Controls.TextBlock
    $t.Text = '档案里没有活跃任务'; $t.FontSize = 12; $t.Foreground = '#FF999999'
    $list.Children.Add($t) | Out-Null
  }
  $i = 0
  foreach ($t in $tasks) {
    $i++
    $line = New-Object System.Windows.Controls.TextBlock
    $line.Margin = '0,4,0,4'; $line.TextWrapping = 'Wrap'
    $run1 = New-Object System.Windows.Documents.Run("$i. ")
    $run1.Foreground = '#FF9C6BB3'; $run1.FontWeight = 'Bold'
    $run2 = New-Object System.Windows.Documents.Run($t.title)
    $line.Inlines.Add($run1); $line.Inlines.Add($run2)
    $footer = if ($t.drive -eq 'end') { if ($t.ddl -ne $null -and $t.ddl -lt 0) { "逾期 $([math]::Abs($t.ddl)) 天" } elseif ($t.ddl -ne $null) { "剩 $t.ddl 天" } else { '' } }
              else { if ($t.since -ne $null) { "$t.since 天没做" } else { '' } }
    if ($footer) {
      $run3 = New-Object System.Windows.Documents.Run("  $footer")
      $run3.FontSize = 10; $run3.Foreground = if ($footer -match '逾期') { '#FFE05252' } else { '#FF999999' }
      $line.Inlines.Add($run3)
    }
    $list.Children.Add($line) | Out-Null
  }
  $updated.Text = (Get-Date -Format 'HH:mm') + ' 更新'
}

# 拖动
$window.Add_MouseLeftButtonDown({ $window.DragMove() })

# 右键退出
$ctx = New-Object System.Windows.Controls.ContextMenu
$mi = New-Object System.Windows.Controls.MenuItem
$mi.Header = '退出小组件'
$mi.Add_Click({ $window.Close() })
$ctx.Items.Add($mi) | Out-Null
$window.ContextMenu = $ctx

# 右下角,任务栏上方
$window.Add_Loaded({
  $wa = [System.Windows.SystemParameters]::WorkArea
  $window.Left = $wa.Right - $window.ActualWidth - 20
  $window.Top = $wa.Bottom - $window.ActualHeight - 48
})

$window.Add_Loaded({ Refresh-List })

# 10 分钟自刷新
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMinutes(10)
$timer.Add_Tick({ Refresh-List })
$timer.Start()

$app = New-Object System.Windows.Application
$app.ShutdownMode = 'OnMainWindowClose'
$null = $app.Run($window)

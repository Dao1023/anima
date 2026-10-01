# sense-master.ps1 · 女仆的感知探针
# 返回主人状态的原始事实(JSON),判断留给女仆(闹钟就是闹钟,女仆才是决策者)
# 用法: pwsh -File sense-master.ps1
$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Sense {
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("psapi.dll")] public static extern uint GetModuleBaseName(IntPtr h, string mod, System.Text.StringBuilder name, uint size);
  [DllImport("user32.dll")] public static extern bool IsUserSessionLocked(); // 不存在,用 WTS 代替
}
"@ -ErrorAction SilentlyContinue

# 输入空闲
$lii = New-Object Sense+LASTINPUTINFO
$lii.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf([type][Sense+LASTINPUTINFO])
$idleSec = -1
if ([Sense]::GetLastInputInfo([ref]$lii)) {
  $idleSec = [int](([Environment]::TickCount) - $lii.dwTime) / 1000
}

# 前台窗口(进程名 + 标题)
$fgProc = $null; $fgTitle = $null
$hwnd = [Sense]::GetForegroundWindow()
if ($hwnd -ne [IntPtr]::Zero) {
  $winPid = 0
  [Sense]::GetWindowThreadProcessId($hwnd, [ref]$winPid) | Out-Null
  $fgProc = (Get-Process -Id $winPid -ErrorAction SilentlyContinue).Name
  $sb2 = New-Object System.Text.StringBuilder 512
  [Sense]::GetWindowText($hwnd, $sb2, 512) | Out-Null
  $fgTitle = $sb2.ToString()
}

# 会话锁状态(通过 query 走不通时,用空闲+时段推断的兜底由女仆做)
$locked = $false
try {
  $q = query user 2>$null
  if ($q -match '\bDisc\b') { $locked = $true }
} catch {}

# 系统与显示
$os = Get-CimInstance Win32_OperatingSystem
$bootTime = $os.LastBootUpTime
$uptimeMin = [int]((Get-Date) - $bootTime).TotalMinutes

# 声音是否在放(看音乐/视频进程) —— 粗信号
$media = Get-Process | Where-Object { $_.Name -match 'spotify|cloudmusic|QQMusic|potplayer|vlc|mpv' } | Select-Object -First 1

[pscustomobject]@{
  now               = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  idle_minutes      = [math]::Round($idleSec / 60, 1)
  last_input_ago    = "$([math]::Round($idleSec/60,0)) 分钟前有键鼠活动"
  session_locked    = $locked
  foreground_proc   = $fgProc
  foreground_title  = $fgTitle
  boot_time         = $bootTime
  uptime_minutes    = $uptimeMin
  media_proc        = $media.Name
} | ConvertTo-Json -Compress

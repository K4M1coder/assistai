param([int]$Port=18210,[int]$Seconds=30,[switch]$PreflightOnly,[switch]$DisableHostVisibleVidmem)
$ErrorActionPreference='Stop'
if($Port -lt 1024 -or $Port -gt 65535 -or $Seconds -lt 1 -or $Seconds -gt 120){throw 'Invalid port or duration'}
$root=Split-Path -Parent $PSScriptRoot
$engine=Join-Path $env:USERPROFILE '.lmstudio/extensions/backends/llama.cpp-win-x86_64-vulkan-avx2-2.71.0/llama-server.exe'
$folder=Join-Path $env:USERPROFILE '.lmstudio/models/LiquidAI/LFM3-Omni-2B-GGUF'
$model=Join-Path $folder 'LFM3-Omni-2B-Q4_K_M.gguf'
$projector=Join-Path $folder 'mmproj-LFM3-Omni-2B-F16.gguf'
foreach($file in @($engine,$model,$projector)){if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw "Missing required file: $file"}}
if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){throw 'Trial port is already occupied; no process was stopped'}
$adapter='luid_0x00000000_0x00013269_phys_0'
function Get-Resources {
  $samples=@((Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage","\GPU Adapter Memory($adapter)\Shared Usage").CounterSamples)
  $d=@($samples | Where-Object Path -like '*\dedicated usage');$s=@($samples | Where-Object Path -like '*\shared usage')
  if($d.Count -ne 1 -or $s.Count -ne 1){throw 'GPU telemetry unavailable or ambiguous'}
  return @{at=[DateTimeOffset]::UtcNow.ToString('o');dedicated=[long]$d[0].CookedValue;shared=[long]$s[0].CookedValue;availableRam=[long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1024}
}
$baseline=Get-Resources
$allowed=$baseline.dedicated -le 18GB -and $baseline.shared -le 128MB -and $baseline.availableRam -ge 10GB
if($PreflightOnly){@{allowed=$allowed;baseline=$baseline;sharedPreflightLimit=128MB;dedicatedPreflightLimit=18GB;minimumAvailableRam=10GB}|ConvertTo-Json -Compress; if(!$allowed){exit 1}; exit 0}
if(!$allowed){throw 'Insufficient observed trial headroom; no process was started'}
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$prefix=Join-Path $root ".cache/assistant/lfm3-omni-idle-$stamp"
$argsList=@('-m',('"'+$model+'"'),'--mmproj',('"'+$projector+'"'),'--host','127.0.0.1','--port',[string]$Port,'-c','4096','-ngl','99','-np','1','-b','512','-ub','256','-fa','on','-ctk','q8_0','-ctv','q8_0','--load-mode','none','--no-host','--cache-ram','0')
$envNames=@('GGML_VK_DISABLE_COOPMAT','GGML_VK_ALLOW_SYSMEM_FALLBACK','GGML_VK_DISABLE_HOST_VISIBLE_VIDMEM')
$savedEnv=@{};foreach($name in $envNames){$savedEnv[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
  [Environment]::SetEnvironmentVariable('GGML_VK_DISABLE_COOPMAT','1','Process')
  [Environment]::SetEnvironmentVariable('GGML_VK_ALLOW_SYSMEM_FALLBACK',$null,'Process')
  [Environment]::SetEnvironmentVariable('GGML_VK_DISABLE_HOST_VISIBLE_VIDMEM',$(if($DisableHostVisibleVidmem){'1'}else{$null}),'Process')
  $process=Start-Process -FilePath $engine -ArgumentList $argsList -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$prefix.stdout" -RedirectStandardError "$prefix.stderr" -PassThru
} finally {foreach($name in $envNames){[Environment]::SetEnvironmentVariable($name,$savedEnv[$name],'Process')}}
$null=$process.Handle;$reason='duration elapsed';$ready=$false;$deadline=[DateTime]::UtcNow.AddSeconds($Seconds)
try {
  while([DateTime]::UtcNow -lt $deadline){
    $process.Refresh();if($process.HasExited){$reason='server exited';break}
    try {$sample=Get-Resources} catch {$reason='telemetry unavailable';break}
    ($sample|ConvertTo-Json -Compress)|Add-Content -LiteralPath "$prefix.samples.jsonl" -Encoding utf8
    if($sample.dedicated -gt 22GB -or $sample.shared -gt 256MB -or $sample.availableRam -lt 6GB){$reason='resource threshold';break}
    if(!$ready){try {$health=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 1; $ready=$health.status -eq 'ok'} catch {}}
  }
} finally {
  $process.Refresh();if(!$process.HasExited){Stop-Process -Id $process.Id -Force;$process.WaitForExit()}
}
@{reason=$reason;ready=$ready;baseline=$baseline;disableHostVisibleVidmem=[bool]$DisableHostVisibleVidmem;exitCode=$process.ExitCode;logs=$prefix}|ConvertTo-Json -Compress
if($reason -ne 'duration elapsed' -or !$ready){exit 1}

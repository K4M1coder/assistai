param([int]$TimeoutSeconds = 180)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$engine = Join-Path $env:USERPROFILE '.lmstudio/extensions/backends/llama.cpp-win-x86_64-vulkan-avx2-2.71.0/llama-server.exe'
$folder = Join-Path $env:USERPROFILE '.lmstudio/models/lmstudio-community/Bonsai-27B-GGUF'
$model = Join-Path $folder 'Bonsai-27B-Q1_0.gguf'
$projector = Join-Path $folder 'mmproj-Bonsai-27B-BF16.gguf'
foreach ($f in @($engine,$model,$projector)) { if (!(Test-Path -LiteralPath $f)) { throw "Missing: $f" } }
if (Get-NetTCPConnection -LocalPort 18080,18089 -State Listen -ErrorAction SilentlyContinue) { throw 'Stop the agent server and ensure trial port is free.' }
$adapter='luid_0x00000000_0x00013269_phys_0'
function resources {
 $x=@((Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage","\GPU Adapter Memory($adapter)\Shared Usage").CounterSamples)
 if($x.Count -ne 2){throw 'GPU telemetry unavailable'}
 $d=@($x | Where-Object Path -like '*\dedicated usage');$s=@($x | Where-Object Path -like '*\shared usage')
 if($d.Count -ne 1 -or $s.Count -ne 1){throw 'Ambiguous GPU telemetry'}
 return @{ at=[DateTimeOffset]::UtcNow.ToString('o'); dedicated=[long]$d[0].CookedValue; shared=[long]$s[0].CookedValue; available_ram=[long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1024 }
}
$base=resources
if($base.dedicated -gt 10GB -or $base.available_ram -lt 8GB){throw 'Insufficient preflight headroom'}
$stamp=[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$sample=Join-Path $root ".cache/bonsai-memory-$stamp.jsonl"
$out=Join-Path $root ".cache/bonsai-$stamp.stdout.log"
$err=Join-Path $root ".cache/bonsai-$stamp.stderr.log"
$env:GGML_VK_DISABLE_COOPMAT='1'
Remove-Item Env:GGML_VK_ALLOW_SYSMEM_FALLBACK -ErrorAction SilentlyContinue
$argsList=@('-m', $model, '--mmproj', $projector, '--host','127.0.0.1','--port','18089','-c','8192','-ngl','99','-np','1','-b','512','-ub','256','-fa','on','-ctk','q8_0','-ctv','q8_0','--load-mode','none','--no-host','--cache-ram','0')
$p=Start-Process -FilePath $engine -ArgumentList $argsList -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
$null=$p.Handle
$deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$reason='timeout'
try {
 while(!$p.HasExited -and [DateTime]::UtcNow -lt $deadline){
  try {$r=resources} catch {$reason='telemetry unavailable';break}
  ($r|ConvertTo-Json -Compress)|Add-Content -LiteralPath $sample -Encoding utf8
  if($r.dedicated -gt 18GB){$reason='dedicated threshold';break}
  if($r.shared-$base.shared -gt 256MB){$reason='shared growth threshold';break}
  if($r.available_ram -lt 6GB){$reason='RAM reserve';break}
  $p.Refresh()
 }
 if($p.HasExited){$reason='process exited'}
} finally {if(!$p.HasExited){Stop-Process -Id $p.Id -Force;$p.WaitForExit()}}
@{reason=$reason;exit_code=$p.ExitCode;baseline=$base;samples=$sample;stdout=$out;stderr=$err}|ConvertTo-Json -Compress -Depth 4

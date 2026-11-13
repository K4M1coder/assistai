param([int]$Port=18089)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if($Port -lt 1024 -or $Port -gt 65535){throw 'Choose a port from 1024 to 65535'}
if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){throw 'Demo port is already in use; no process was stopped'}
$adapter='luid_0x00000000_0x00013269_phys_0'
$counters=@((Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage","\GPU Adapter Memory($adapter)\Shared Usage").CounterSamples)
$dedicated=@($counters | Where-Object Path -like '*\dedicated usage');$shared=@($counters | Where-Object Path -like '*\shared usage')
if($dedicated.Count -ne 1 -or $shared.Count -ne 1){throw 'GPU telemetry unavailable or ambiguous'}
$available=[long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory*1024
if($available -lt 8GB -or $dedicated[0].CookedValue -gt 22GB -or $shared[0].CookedValue -gt 256MB){throw 'Insufficient observed headroom for the demo'}
$runtime=Join-Path $root '.cache/assistant'
$null=New-Item -ItemType Directory -Path $runtime -Force
$sample=Join-Path $runtime "demo-$Port-resource.json"
$metadata=Join-Path $runtime "demo-$Port-processes.json"
if(Test-Path -LiteralPath $metadata){throw 'Demo ownership record exists; inspect it before starting another instance'}
$sampler=$null;$gateway=$null
try {
  $shell=(Get-Process -Id $PID).Path
  $sampler=Start-Process -FilePath $shell -ArgumentList @('-NoProfile','-File',(Join-Path $root 'scripts/write-windows-budget-sample.ps1'),'-Adapter',$adapter,'-OutputPath',$sample) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime "demo-$Port-sampler.stdout") -RedirectStandardError (Join-Path $runtime "demo-$Port-sampler.stderr") -PassThru
  $null=$sampler.Handle
  $env:ASSISTAI_GATEWAY_PORT=[string]$Port; $env:ASSISTAI_DB_PATH=':memory:'; $env:ASSISTAI_ENABLE_SESSION_RESUME='1'
  $env:ASSISTAI_LFM_REALTIME_URL=''; $env:ASSISTAI_LFM_TRANSCRIPT_ASR_URL=''; $env:ASSISTAI_OPENCODE_URL='http://127.0.0.1:18085'
  $env:ASSISTAI_LLM_URL='http://127.0.0.1:18084/v1'; $env:ASSISTAI_VISION_URL='http://127.0.0.1:18080/v1'
  $env:ASSISTAI_TTS_URL='http://127.0.0.1:18081'; $env:ASSISTAI_ASR_URL='ws://127.0.0.1:18082/asr'
  $env:ASSISTAI_BUDGET_SAMPLE_PATH=$sample; $env:ASSISTAI_RESOURCE_STATUS_PATH=$sample
  $env:ASSISTAI_SHARED_RESERVATIONS_PATH=Join-Path $runtime 'task-reservations.sqlite'
  # Absolute shared use is compared to 256 MiB, since a clean pre-model baseline is unavailable.
  $env:ASSISTAI_BUDGET_BASELINE_SHARED_BYTES='0'; $env:ASSISTAI_TASK_VRAM_ESTIMATE_BYTES=[string](512MB); $env:ASSISTAI_TASK_RAM_ESTIMATE_BYTES=[string](3GB)
  $gateway=Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @((Join-Path $root 'prototype/gateway.mjs')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime "demo-$Port-gateway.stdout") -RedirectStandardError (Join-Path $runtime "demo-$Port-gateway.stderr") -PassThru
  $null=$gateway.Handle
  $deadline=[DateTime]::UtcNow.AddSeconds(15);$ready=$false
  do {
    $gateway.Refresh();$sampler.Refresh();if($gateway.HasExited -or $sampler.HasExited){throw 'Demo service exited during startup'}
    try {
      $health=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
      $resources=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/resources" -TimeoutSec 2
      $listener=Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
      $ready=$health.session_resume_enabled -eq $true -and $resources.admission -eq 'advisory' -and $resources.status -in @('observed','low') -and $listener.OwningProcess -eq $gateway.Id
    } catch { $ready=$false }
    if(!$ready){Start-Sleep -Milliseconds 250}
  } until($ready -or [DateTime]::UtcNow -gt $deadline)
  if(!$ready){throw 'Demo readiness check failed'}
  $record=@{port=$Port;gatewayPid=$gateway.Id;gatewayStartedUtc=$gateway.StartTime.ToUniversalTime().ToString('o');samplerPid=$sampler.Id;samplerStartedUtc=$sampler.StartTime.ToUniversalTime().ToString('o');samplePath=$sample;history='volatile'}
  $record | ConvertTo-Json -Compress | Set-Content -LiteralPath $metadata -Encoding utf8
  @{url="http://127.0.0.1:$Port/";gatewayPid=$gateway.Id;samplerPid=$sampler.Id;resources=$resources;history='volatile';agent='existing read-only fixture';record=$metadata} | ConvertTo-Json -Compress -Depth 4
} catch {
  foreach($p in @($gateway,$sampler)){if($null -ne $p){$p.Refresh();if(!$p.HasExited){Stop-Process -Id $p.Id -Force;$p.WaitForExit()}}}
  throw
}

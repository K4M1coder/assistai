param(
  [Parameter(Mandatory=$true)][string]$Workspace,
  [int]$TimeoutSeconds = 120,
  [switch]$PreflightOnly
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$workspacePath = (Resolve-Path -LiteralPath $Workspace).Path
$cachePath = (Resolve-Path -LiteralPath (Join-Path $root '.cache')).Path
if (!$workspacePath.StartsWith($cachePath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Workspace must be inside .cache' }
foreach ($file in @('calculator.py','opencode.json')) { if (!(Test-Path -LiteralPath (Join-Path $workspacePath $file))) { throw "Missing fixture: $file" } }
if (Get-NetTCPConnection -LocalPort 18090,18091 -State Listen -ErrorAction SilentlyContinue) { throw 'Trial ports are already in use' }
$adapter = 'luid_0x00000000_0x00013269_phys_0'
$trackedIds = @((Get-NetTCPConnection -LocalPort 18080,18081,18082,18084,18085,18088 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique)
$children = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()
function Sample-Resources {
  $samples = @((Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage", "\GPU Adapter Memory($adapter)\Shared Usage").CounterSamples)
  $dedicated = @($samples | Where-Object Path -like '*\dedicated usage')
  $shared = @($samples | Where-Object Path -like '*\shared usage')
  if ($dedicated.Count -ne 1 -or $shared.Count -ne 1) { throw 'Ambiguous GPU counters' }
  $ids = @($trackedIds) + @($children | ForEach-Object { $_.Id })
  $processes = @(foreach ($id in ($ids | Select-Object -Unique)) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p) { @{ id=$p.Id; name=$p.ProcessName; workingSetBytes=$p.WorkingSet64; privateBytes=$p.PrivateMemorySize64 } }
  })
  $pagefiles = @(Get-CimInstance Win32_PageFileUsage | ForEach-Object { @{ currentMiB=$_.CurrentUsage; allocatedMiB=$_.AllocatedBaseSize } })
  return @{ observedAt = [DateTimeOffset]::UtcNow.ToString('o'); dedicatedBytes = [long]$dedicated[0].CookedValue; sharedBytes = [long]$shared[0].CookedValue; availableRamBytes = [long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1024; processes=$processes; pagefiles=$pagefiles }
}
function Assert-Resources($sample, [long]$minimumRam) {
  if ($sample.availableRamBytes -lt $minimumRam) { throw 'Available RAM below reserve' }
  if ($sample.dedicatedBytes -gt 22GB) { throw 'Dedicated GPU planning threshold exceeded' }
  if ($sample.sharedBytes -gt 256MB) { throw 'Shared GPU usage above conservative absolute threshold' }
}
$initial = Sample-Resources
if ($PreflightOnly) {
  $initial | ConvertTo-Json -Compress -Depth 5
  Assert-Resources $initial 8GB
  return
}
Assert-Resources $initial 8GB
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$prefix = Join-Path $root ".cache/voice-agent-edit-$stamp"
$samplePath = "$prefix.sample.json"
$logPath = "$prefix.samples.jsonl"
$reason = 'not started'
function Save-Sample($sample) {
  $json = $sample | ConvertTo-Json -Compress -Depth 5
  [IO.File]::WriteAllText($samplePath, $json, [Text.UTF8Encoding]::new($false))
  Add-Content -LiteralPath $logPath -Value $json -Encoding utf8
}
function Start-Owned($file, $argsList, $workdir, $label) {
  $p = Start-Process -FilePath $file -ArgumentList $argsList -WorkingDirectory $workdir -WindowStyle Hidden -RedirectStandardOutput "$prefix.$label.stdout" -RedirectStandardError "$prefix.$label.stderr" -PassThru
  $null = $p.Handle; $children.Add($p); return $p
}
try {
  Save-Sample $initial
  $opencode = Join-Path $root 'node_modules/opencode-ai/bin/opencode.exe'
  $node = (Get-Command node.exe).Source
  $agent = Start-Owned $opencode @('serve','--hostname','127.0.0.1','--port','18090') $workspacePath 'agent'
  $env:ASSISTAI_GATEWAY_PORT='18091'; $env:ASSISTAI_OPENCODE_URL='http://127.0.0.1:18090'; $env:ASSISTAI_LFM_REALTIME_URL=''
  $env:ASSISTAI_DB_PATH=':memory:'; $env:ASSISTAI_BUDGET_SAMPLE_PATH=$samplePath; $env:ASSISTAI_BUDGET_BASELINE_SHARED_BYTES='0'
  $env:ASSISTAI_TASK_VRAM_ESTIMATE_BYTES=[string](128MB); $env:ASSISTAI_TASK_RAM_ESTIMATE_BYTES=[string](128MB)
  $gateway = Start-Owned $node @((Join-Path $root 'prototype/gateway.mjs')) $root 'gateway'
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do {
    $sample = Sample-Resources; Save-Sample $sample; Assert-Resources $sample 6GB
    if ($agent.HasExited -or $gateway.HasExited) { throw 'Trial service exited during startup' }
    try { $healthy = (Invoke-RestMethod -Uri 'http://127.0.0.1:18091/health' -TimeoutSec 2).status -eq 'running' } catch { $healthy = $false }
  } until ($healthy -or [DateTime]::UtcNow -gt $deadline)
  if (!$healthy) { throw 'Gateway startup timeout' }
  $env:ASSISTAI_PROBE_WORKSPACE=$workspacePath; $env:ASSISTAI_TEST_VOICE_URL='ws://127.0.0.1:18091/voice'
  $probe = Start-Owned $node @((Join-Path $root 'scripts/probe-voice-agent-edit.mjs')) $root 'probe'
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    $sample = Sample-Resources; Save-Sample $sample; Assert-Resources $sample 6GB
    if ($agent.HasExited -or $gateway.HasExited) { throw 'Trial service exited during probe' }
    $probe.Refresh()
  } until ($probe.HasExited -or [DateTime]::UtcNow -gt $deadline)
  if (!$probe.HasExited) { throw 'Probe timed out' }
  $reason = if ($probe.ExitCode -eq 0) { 'probe passed' } else { "probe failed: $($probe.ExitCode)" }
} catch { $reason = $_.Exception.Message }
finally {
  foreach ($p in $children) { $p.Refresh(); if (!$p.HasExited) { Stop-Process -Id $p.Id -Force; $p.WaitForExit() } }
}
@{ reason=$reason; baseline=$initial; samples=$logPath; probe_stdout="$prefix.probe.stdout"; probe_stderr="$prefix.probe.stderr"; agent_stderr="$prefix.agent.stderr"; gateway_stderr="$prefix.gateway.stderr" } | ConvertTo-Json -Compress -Depth 4
if ($reason -ne 'probe passed') { exit 1 }

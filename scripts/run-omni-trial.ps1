param([int]$TimeoutSeconds = 180, [ValidateSet('french', 'english')][string]$Language = 'french', [ValidateRange(4, 30)][int]$ChunkCount = 4)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root '.cache/llama-cpp-omni-build/bin/Release/llama-omni-test-duplex.exe'
$source = Join-Path $root '.cache/llama-cpp-omni'
$model = Join-Path $root '.cache/minicpm-omni/MiniCPM-o-4_5-Q4_K_M.gguf'
$prefix = Join-Path $root ".cache/omni-$Language/${Language}_"
$log = Join-Path $root '.cache/omni-trial.stdout.log'
$err = Join-Path $root '.cache/omni-trial.stderr.log'
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$samples = Join-Path $root ".cache/omni-trial-memory-$stamp.jsonl"
$output = Join-Path $root ".cache/omni-output-$Language-$stamp"
foreach ($file in @($exe, $model) + @(0..($ChunkCount - 1) | ForEach-Object { "${prefix}$($_.ToString('0000')).wav" })) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Missing trial input: $file" }
}
if (Get-NetTCPConnection -LocalPort 18080,18084 -State Listen -ErrorAction SilentlyContinue) { throw 'Stop both existing model servers before this trial.' }
$adapter = 'luid_0x00000000_0x00013269_phys_0'
$queries = @("\GPU Adapter Memory($adapter)\Dedicated Usage", "\GPU Adapter Memory($adapter)\Shared Usage")
function Read-Resources([int]$TrialPid = 0) {
    $values = @((Get-Counter -Counter $queries).CounterSamples)
    $d = @($values | Where-Object { $_.Path -like '*\dedicated usage' })
    $s = @($values | Where-Object { $_.Path -like '*\shared usage' })
    if ($d.Count -ne 1 -or $s.Count -ne 1) { throw 'GPU telemetry unavailable or ambiguous.' }
    $os = Get-CimInstance Win32_OperatingSystem
    $result = @{ dedicated = [long]$d[0].CookedValue; shared = [long]$s[0].CookedValue; available_ram = [long]$os.FreePhysicalMemory * 1024; at = [DateTimeOffset]::UtcNow.ToString('o'); process_dedicated = $null; process_shared = $null }
    if ($TrialPid -gt 0) {
        try {
            $counters = @((Get-Counter -Counter @("\GPU Process Memory(pid_$TrialPid*)\Dedicated Usage", "\GPU Process Memory(pid_$TrialPid*)\Shared Usage") -ErrorAction Stop).CounterSamples | Where-Object { $_.Path -like "*$adapter*" })
            $pd = @($counters | Where-Object { $_.Path -like '*\dedicated usage' })
            $ps = @($counters | Where-Object { $_.Path -like '*\shared usage' })
            if ($pd.Count -eq 1 -and $ps.Count -eq 1) { $result.process_dedicated = [long]$pd[0].CookedValue; $result.process_shared = [long]$ps[0].CookedValue }
        } catch { } # The GPU process counter may not exist before the first allocation.
    }
    return $result
}
$baseline = Read-Resources
if ($baseline.dedicated -gt 12GB -or $baseline.available_ram -lt 8GB) { throw 'Insufficient starting headroom for the native model.' }
New-Item -ItemType Directory -Force -Path $output | Out-Null
$env:GGML_VK_DISABLE_COOPMAT = '1'
$env:GGML_VK_DISABLE_HOST_VISIBLE_VIDMEM = '1'
$env:GGML_VK_MEMORY_LOGGER = '1'
$env:ASSISTAI_VK_SYNC_UPLOAD_LIMIT = '16777216'
Remove-Item Env:GGML_VK_ALLOW_SYSMEM_FALLBACK -ErrorAction SilentlyContinue
$trialArguments = @('-m', $model, '-c', '4096', '-ngl', '99', '--low-host-memory', '--q8-kv', '--test', $prefix, "$ChunkCount", '--stream-interval', '1000', '-o', $output)
$p = Start-Process -FilePath $exe -ArgumentList $trialArguments -WorkingDirectory $source -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err -PassThru
$null = $p.Handle # Retain the process handle so Windows PowerShell can read the exit code.
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$reason = 'completed'
try {
    while (-not $p.HasExited) {
        if ([DateTime]::UtcNow -gt $deadline) { $reason = 'timeout'; break }
        try { $r = Read-Resources -TrialPid $p.Id } catch { $reason = 'telemetry unavailable'; break }
        ($r | ConvertTo-Json -Compress) | Add-Content -LiteralPath $samples -Encoding utf8
        if ($r.dedicated -gt 22GB) { $reason = 'dedicated GPU threshold exceeded'; break }
        if ($r.shared - $baseline.shared -gt 256MB) { $reason = 'shared GPU growth threshold exceeded'; break }
        if ($r.available_ram -lt 6GB) { $reason = 'available RAM below reserve'; break }
        $p.Refresh()
    }
} finally {
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force; $p.WaitForExit() }
}
$p.WaitForExit()
@{ reason = $reason; exit_code = $p.ExitCode; baseline = $baseline; stdout = $log; stderr = $err; samples = $samples; output = $output } | ConvertTo-Json -Depth 5 -Compress
if ($reason -ne 'completed' -or $p.ExitCode -ne 0) { exit 1 }

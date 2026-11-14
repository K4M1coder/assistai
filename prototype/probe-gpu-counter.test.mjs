import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('GPU process counter selection excludes other processes and adapters', {skip:process.platform !== 'win32'}, () => {
  const command = String.raw`. ./scripts/get-probe-gpu-memory.ps1
$counters=@(
  [pscustomobject]@{InstanceName='pid_42_luid_a_phys_0';Path='\gpu process memory(pid_42_luid_a_phys_0)\shared usage';CookedValue=23},
  [pscustomobject]@{InstanceName='pid_43_luid_a_phys_0';Path='\gpu process memory(pid_43_luid_a_phys_0)\shared usage';CookedValue=99},
  [pscustomobject]@{InstanceName='pid_42_luid_b_phys_0';Path='\gpu process memory(pid_42_luid_b_phys_0)\shared usage';CookedValue=88},
  [pscustomobject]@{InstanceName='pid_42_luid_a_phys_0';Path='\gpu process memory(pid_42_luid_a_phys_0)\dedicated usage';CookedValue=11}
)
@(Select-ProbeGpuCounters $counters @(42) 'luid_a_phys_0') | ConvertTo-Json -Compress`;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const counters=JSON.parse(result.stdout);
  assert.deepEqual(counters.map(({pid,kind,bytes})=>({pid,kind,bytes})),[
    {pid:42,kind:'sharedBytes',bytes:23},{pid:42,kind:'dedicatedBytes',bytes:11},
  ]);
});

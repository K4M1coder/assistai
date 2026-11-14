import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('shape guard reserves shared-memory headroom before starting an XPU process', {skip:process.platform !== 'win32'}, () => {
  const command=String.raw`. ./scripts/haru-shape-guard.ps1
$sample=@{modelBusy=$false;dedicatedBytes=11GB;sharedBytes=204MB;availableRamBytes=12GB}
$results=@{}
try {Assert-HaruShapeSample $sample 10GB 96MB; $results.preflight='accepted'} catch {$results.preflight=$_.Exception.Message}
try {Assert-HaruShapeSample $sample 8GB; $results.runtime='accepted'} catch {$results.runtime=$_.Exception.Message}
$sample.sharedBytes=137MB
try {Assert-HaruShapeSample $sample 10GB 96MB; $results.low='accepted'} catch {$results.low=$_.Exception.Message}
$sample.modelBusy=$true
try {Assert-HaruShapeSample $sample 10GB 96MB; $results.busy='accepted'} catch {$results.busy=$_.Exception.Message}
$results | ConvertTo-Json -Compress`;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const value=JSON.parse(result.stdout);
  assert.match(value.preflight,/headroom/);
  assert.equal(value.runtime,'accepted');
  assert.equal(value.low,'accepted');
  assert.match(value.busy,/busy/);
});

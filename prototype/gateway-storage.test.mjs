import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

test('gateway can use volatile in-memory session history', {timeout:10000}, async t => {
  const reservation=http.createServer();
  reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  const child=spawn(process.execPath,['prototype/gateway.mjs'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,ASSISTAI_GATEWAY_PORT:String(port),ASSISTAI_DB_PATH:':memory:'}});
  let stderr=''; child.stderr.on('data',chunk=>{stderr+=chunk});
  t.after(()=>child.kill());
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(`Gateway startup timeout: ${stderr}`)),5000);
    child.once('exit',code=>{clearTimeout(timer);reject(Error(`Gateway exited ${code}: ${stderr}`));});
    child.stdout.on('data',chunk=>{if(chunk.toString().includes('Experimental voice gateway')){clearTimeout(timer);resolve();}});
  });
  const response=await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status,200);
  assert.equal((await response.json()).history_storage,'volatile');
});

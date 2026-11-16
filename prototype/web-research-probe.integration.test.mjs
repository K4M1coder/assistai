import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';

test('web research probe declines when no operator terminal is available', {timeout:10000}, async t => {
  const server = new WebSocketServer({port:0,host:'127.0.0.1'});
  await once(server,'listening');
  let approved;
  server.on('connection', socket => {
    socket.send(JSON.stringify({type:'session.capabilities',workspace_label:'Search uses hosted Exa'}));
    socket.send(JSON.stringify({type:'asr.ready'}));
    socket.on('message', raw => {
      const event = JSON.parse(raw);
      if (event.type === 'text') socket.send(JSON.stringify({type:'task.approval_requested',approval_id:'id',original_request:event.text,task:'Find the official Nantes website'}));
      if (event.type === 'task.approval') approved = event.approved;
    });
  });
  t.after(async () => { for (const client of server.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); });
  const child = spawn(process.execPath, ['scripts/probe-web-research.mjs'], {
    windowsHide:true, stdio:['ignore','ignore','pipe'], env:{...process.env,ASSISTAI_TEST_VOICE_URL:`ws://127.0.0.1:${server.address().port}/voice`},
  });
  let error = ''; child.stderr.on('data', chunk => {error += chunk;});
  const [code] = await once(child,'exit');
  assert.equal(code,1);
  assert.equal(approved,false);
  assert.match(error,/interactive approval unavailable/);
});

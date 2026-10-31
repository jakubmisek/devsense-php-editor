const { WebSocket } = require('ws');
const { PhpEditor } = require('./dist/index.js');

(async () => {
  let failures = 0;
  function check(name, cond) {
    console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
    if (!cond) failures++;
  }

  const editor = new PhpEditor({ port: 0, host: '127.0.0.1' });
  const port = await editor.start();
  check('start returns a port', typeof port === 'number' && port > 0);
  check('getPort matches', editor.getPort() === port);
  check('getUrl', editor.getUrl() === `ws://127.0.0.1:${port}`);
  check('isRunning', editor.isRunning() === true);

  // Connect WS client
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((res) => (ws.once('open', res)));

  let initResponse = null;
  ws.on('message', (raw) => {
    initResponse = JSON.parse(raw.toString('utf8'));
  });

  // Send initialize request
  const initReq = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      processId: 1,
      rootUri: null,
      capabilities: {},
      initializationOptions: {},
    },
  };
  ws.send(JSON.stringify(initReq));

  // Wait for response
  await new Promise((res) => setTimeout(res, 3000));

  check('initialize response received', initResponse !== null);
  check('initialize response id=1', initResponse && initResponse.id === 1);
  check('initialize response has result', initResponse && !!initResponse.result);
  check('initialize result has capabilities', initResponse && initResponse.result && !!initResponse.result.capabilities);

  // shutdown/exit handshake
  const shutdownReq = { jsonrpc: '2.0', id: 2, method: 'shutdown', params: null };
  ws.send(JSON.stringify(shutdownReq));
  await new Promise((res) => setTimeout(res, 1000));
  ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'exit' }));
  await new Promise((res) => setTimeout(res, 500));
  ws.close();

  await editor.stop();

  check('no failures', failures === 0);
  console.log(failures === 0 ? '\n✅ M2 verification PASSED' : `\n❌ ${failures} check(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('❌ Verification error:', err);
  process.exit(1);
});

/* Reinicia o TizenBrew e, assim que o servico subir, aponta para o modulo novo. */
'use strict';
var http = require('http');
var W = require('ws');
var TV = '192.168.2.106';
var APPID = 'xvvl3S1bvH.TizenBrewStandalone';
var MOD = process.argv[2] || 'gh/ViniACardozo/tizen-piped-tv@v2.5.12';
var OLD = process.argv[3] || 'gh/ViniACardozo/tizen-piped-tv@v2.5.10';

function req(method) {
  return new Promise(function (res) {
    var body = method === 'POST' ? JSON.stringify({ id: APPID, action_type: 'DEEP_LINK' }) : '';
    var r = http.request({ host: TV, port: 8001, path: '/api/v2/applications/' + APPID, method: method, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 8000 }, function (s) {
      s.resume(); s.on('end', res);
    });
    r.on('error', function () { res(); });
    r.on('timeout', function () { r.destroy(); res(); });
    r.end(body);
  });
}

function tryWs() {
  return new Promise(function (res) {
    var ws = new W('ws://' + TV + ':8081', { perMessageDeflate: false });
    var done = false;
    ws.on('open', function () {
      if (done) return; done = true;
      ws.send(JSON.stringify({ type: 10, payload: { action: 'remove', module: OLD } }));
      ws.send(JSON.stringify({ type: 10, payload: { action: 'add', module: MOD } }));
      ws.send(JSON.stringify({ type: 10, payload: { action: 'autolaunch', module: MOD } }));
      setTimeout(function () { ws.send(JSON.stringify({ type: 4, payload: true })); }, 700);
      setTimeout(function () { try { ws.close(); } catch (e) {} res(true); }, 2000);
    });
    ws.on('error', function () { if (!done) { done = true; res(false); } });
    setTimeout(function () { if (!done) { done = true; try { ws.close(); } catch (e) {} res(false); } }, 2500);
  });
}

(async function () {
  await req('DELETE');
  console.log('parado');
  await new Promise(function (r) { setTimeout(r, 2500); });
  await req('POST');
  console.log('iniciado');
  for (var i = 0; i < 12; i++) {
    await new Promise(function (r) { setTimeout(r, 2000); });
    if (await tryWs()) { console.log('servico ok, modulo apontado para ' + MOD); process.exit(0); }
  }
  console.log('servico nao subiu');
  process.exit(1);
})();

/* Pede ao TizenBrew para (re)abrir o modulo ViniTube em modo debug. */
'use strict';
var W = require('ws');

var TV = '192.168.2.106';
var NAME = process.argv[2] || 'gh/ViniACardozo/tizen-piped-tv@v2.5.8';
var ws = new W('ws://' + TV + ':8081', { perMessageDeflate: false });
var mod = null, launched = false;

ws.on('open', function () { console.log('aberto'); ws.send(JSON.stringify({ type: 4, payload: true })); });

ws.on('message', function (raw) {
  var d; try { d = JSON.parse(raw.toString()); } catch (e) { return; }
  if (d.type === 4 && !mod) {
    mod = (d.payload || []).filter(function (m) { return m.fullName === NAME; })[0];
    if (!mod) { console.log('modulo nao encontrado'); process.exit(1); }
    console.log('modulo ' + mod.fullName + ' appPath ' + mod.appPath);
    ws.send(JSON.stringify({ type: 10, payload: { action: 'autolaunch', module: NAME } }));
    ws.send(JSON.stringify({ type: 5, payload: mod }));
    setTimeout(function () {
      ws.send(JSON.stringify({ type: 3, payload: { tvIP: '127.0.0.1' } }));
      console.log('reLaunch pedido');
    }, 800);
  }
  if (d.type === 8) console.log('ERRO ' + JSON.stringify(d.payload));
});

setTimeout(function () { process.exit(0); }, 6000);
ws.on('error', function (e) { console.log('WS ' + e.message); process.exit(1); });

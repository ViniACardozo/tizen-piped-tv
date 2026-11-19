/* Dirige o TizenBrewInstaller via websocket local: conecta na TV e instala o TizenBrew. */
'use strict';
var W = require('ws');
var ws = new W('ws://localhost:8091', { perMessageDeflate: false });
var sent = false;

function send(type, payload) { ws.send(JSON.stringify({ type: type, payload: payload })); console.log('>> ' + type + ' ' + JSON.stringify(payload)); }

ws.on('open', function () {
  console.log('conectado ao instalador');
  send(6, '192.168.2.106');
  setTimeout(function () {
    if (!sent) { sent = true; console.log('sem resposta do ConnectToTV, tentando instalar mesmo assim'); send(1, { url: 'reisxd/TizenBrew' }); }
  }, 12000);
});

ws.on('message', function (raw) {
  var d; try { d = JSON.parse(raw.toString()); } catch (e) { return; }
  console.log('<< ' + d.type + ' ' + JSON.stringify(d.payload).slice(0, 400));
  if (d.type === 6 && d.payload && d.payload.success && !sent) {
    sent = true;
    console.log('TV conectada, iniciando instalacao');
    send(1, { url: 'reisxd/TizenBrew' });
  }
});

setTimeout(function () { process.exit(0); }, 120000);
ws.on('error', function (e) { console.log('WS ' + e.message); process.exit(1); });

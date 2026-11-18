/* Opera o websocket do TizenBrew (8081): list/add/remove/auto <module>. */
'use strict';
var W = require('ws');

var TV = '192.168.2.106';
var CMD = process.argv[2] || 'list';
var MOD = process.argv[3] || 'gh/ViniACardozo/tizen-piped-tv@v2.5.2';

var ws = new W('ws://' + TV + ':8081', { perMessageDeflate: false });
var step = 0;

function send(o) { ws.send(JSON.stringify(o)); console.log('>> ' + JSON.stringify(o)); }

ws.on('open', function () {
  if (CMD === 'list') send({ type: 4 });
  else if (CMD === 'add') { send({ type: 10, payload: { action: 'add', module: MOD } }); setTimeout(function () { send({ type: 4, payload: true }); }, 1500); }
  else if (CMD === 'remove') { send({ type: 10, payload: { action: 'remove', module: MOD } }); setTimeout(function () { send({ type: 4, payload: true }); }, 1500); }
  else if (CMD === 'auto') { send({ type: 10, payload: { action: 'autolaunch', module: MOD } }); setTimeout(function () { send({ type: 4, payload: true }); }, 1500); }
  else { console.log('comando desconhecido'); }
  setTimeout(function () { try { ws.close(); } catch (e) {} process.exit(0); }, 5000);
});

ws.on('message', function (raw) { console.log('<< ' + raw.toString().slice(0, 2000)); });
ws.on('error', function (e) { console.log('ERRO ' + e.message); process.exit(1); });

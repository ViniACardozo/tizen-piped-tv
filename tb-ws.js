/* Fala com o websocket do TizenBrew (8081): lista e altera modulos. */
'use strict';
var W = require('ws');

var TV = '192.168.2.106';
var ws = new W('ws://' + TV + ':8081', { perMessageDeflate: false });
var done = false;

function send(obj) { ws.send(JSON.stringify(obj)); }
function finish(code) { if (done) return; done = true; try { ws.close(); } catch (e) {} setTimeout(function () { process.exit(code); }, 200); }

ws.on('open', function () {
  console.log('ABERTO');
  send({ type: 4 });
  setTimeout(function () { send({ type: 2, data: 'gh/ViniACardozo/tizen-piped-tv@v2.5.2' }); }, 500);
  setTimeout(function () { finish(0); }, 6000);
});
ws.on('message', function (raw) { console.log('MSG ' + raw.toString().slice(0, 1500)); });
ws.on('error', function (e) { console.log('ERRO ' + e.message); finish(1); });

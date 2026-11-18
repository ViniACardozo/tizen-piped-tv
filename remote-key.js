/* Envia uma tecla do controle remoto Samsung para a TV. */
'use strict';
var W = require('ws');
var KEY = process.argv[2] || 'KEY_ENTER';
var TV = '192.168.2.106';
var NAME = Buffer.from('ViniTubePC').toString('base64');
var url = 'wss://' + TV + ':8002/api/v2/channels/samsung.remote.control?name=' + NAME + '&token=97767224';
var ws = new W(url, { perMessageDeflate: false, rejectUnauthorized: false });

ws.on('open', function () {
  var msg = { method: 'ms.remote.control', params: { Cmd: 'Click', DataOfCmd: KEY, TypeOfRemote: 'SendRemoteKey' } };
  ws.send(JSON.stringify(msg));
  console.log('enviado ' + KEY);
  setTimeout(function () { ws.close(); process.exit(0); }, 1200);
});
ws.on('message', function (m) { var s = m.toString(); if (s.indexOf('token') > -1) console.log(s.slice(0, 200)); });
ws.on('error', function (e) { console.log('ERRO ' + e.message); process.exit(1); });

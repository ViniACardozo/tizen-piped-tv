/* Envia uma sequencia de teclas do controle remoto Samsung. */
'use strict';
var W = require('ws');
var TV = '192.168.2.106';
var NAME = Buffer.from('ViniTubePC').toString('base64');
var KEYS = process.argv.slice(2);
var url = 'wss://' + TV + ':8002/api/v2/channels/samsung.remote.control?name=' + NAME + '&token=97767224';
var ws = new W(url, { perMessageDeflate: false, rejectUnauthorized: false });

function press(k) {
  return new Promise(function (res) {
    var msg = { method: 'ms.remote.control', params: { Cmd: 'Click', DataOfCmd: k, TypeOfRemote: 'SendRemoteKey' } };
    ws.send(JSON.stringify(msg));
    console.log('key ' + k);
    setTimeout(res, 450);
  });
}

ws.on('open', function () {
  (async function () {
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      if (k.indexOf('WAIT') === 0) { await new Promise(function (r) { setTimeout(r, Number(k.slice(4)) || 1000); }); console.log('wait ' + k.slice(4)); continue; }
      await press(k);
    }
    ws.close();
    process.exit(0);
  })();
});
ws.on('message', function (m) { var s = m.toString(); if (s.indexOf('"token"') > -1) console.log('token ok'); });
ws.on('error', function (e) { console.log('ERRO ' + e.message); process.exit(1); });

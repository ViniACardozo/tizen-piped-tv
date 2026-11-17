/* Shell na TV via adbhost (protocolo sdb, porta 8001). */
'use strict';
var adbhost = require('adbhost');

var HOST = '192.168.2.106';
var PORT = 26101;
var CMD = process.argv[2] || 'shell:echo ok';

var conn = adbhost.createConnection({ host: HOST, port: PORT });
var onPacket = conn._onPacket;
conn._onPacket = function () {
  var p = this._packet;
  console.log('[ADB RX]', p && p.cmd, p && p.arg1, p && p.arg2, p && p.dataLength, p && p.data && p.data.toString());
  return onPacket.apply(this, arguments);
};
conn._stream.on('error', function (e) {
  console.error('[ERR]', e.message);
  process.exit(1);
});
conn.on('connect', function () {
  console.log('[+] SDB handshake concluido em ' + HOST + ':' + PORT);
  var s = conn.createStream(CMD);
  var out = '';
  s.on('close', function () { console.log('[STREAM CLOSE]'); });
  s.on('data', function (d) { out += d; });
  s.on('end', function () {
    console.log('[OUT]');
    console.log(out);
    process.exit(0);
  });
  s.on('close', function () {
    console.log('[OUT]');
    console.log(out);
    process.exit(0);
  });
  s.on('error', function (e) {
    console.error('[SHELL ERR]', e.message);
    process.exit(1);
  });
});
setTimeout(function () {
  console.error('[TIMEOUT]');
  process.exit(2);
}, 20000);

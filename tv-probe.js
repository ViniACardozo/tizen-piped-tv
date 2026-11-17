/* Dump cru do primeiro pacote da porta 8001 da TV. */
'use strict';
var net = require('net');

var s = net.connect({ host: '192.168.2.106', port: 8001 }, function () {
  console.log('[+] tcp conectado');
  s.write('CNXN\x00\x00\x00\x01\x00\x10\x00\x00\x07\x00\x00\x00"device::sdb\x00tizen\x00'); // primeira tentativa: CNXN adb
});
var buf = [];
s.on('data', function (d) {
  buf.push(d);
  var all = Buffer.concat(buf);
  console.log('[BYTES]', all.length, all.slice(0, 128).toString('hex'));
  console.log('[ASCII]', JSON.stringify(all.slice(0, 160).toString('ascii')));
  s.destroy();
  process.exit(0);
});
s.on('error', function (e) { console.error('[ERR]', e.message); process.exit(1); });
setTimeout(function () { console.error('[TIMEOUT]'); process.exit(2); }, 10000);
/* Cliente sdb sobre WebSocket (canal /api/v2/channels/sdb na porta 8001). */
'use strict';
var WebSocket = require('ws');

var TV = '192.168.2.106';
var HOSTNAME = 'SMITH-PC';
var CMD = process.argv[2] || 'shell:cat /home/owner/share/tizenbrewConfig.json';

function u32(buf, off) {
  return buf.readUInt32LE(off);
}

var ADB = {
  A_VERSION: 0x01000000,
  A_MAXDATA: 4096,
  CMD_CNXN: 0x4e584843, // "CNXN"
  CMD_OPEN: 0x4e45504f, // "OPEN"
  CMD_OKAY: 0x59414b4f, // "OKAY"
  CMD_CLSE: 0x45534c43, // "CLSE"
  CMD_WRTE: 0x45545257  // "WRTE"
};

function adbPacket(cmd, arg0, arg1, data) {
  data = data || Buffer.alloc(0);
  var h = Buffer.alloc(24);
  h.writeUInt32LE(cmd, 0);
  h.writeUInt32LE(arg0, 4);
  h.writeUInt32LE(arg1, 8);
  h.writeUInt32LE(data.length, 12);
  var crc = 0;
  for (var i = 0; i < data.length; i++) crc = (crc + data[i]) & 0xffffffff;
  h.writeUInt32LE(crc, 16);
  h.writeUInt32LE(cmd ^ 0xffffffff, 20);
  return Buffer.concat([h, data]);
}

function parsePacket(buf) {
  return {
    cmd: u32(buf, 0),
    arg0: u32(buf, 4),
    arg1: u32(buf, 8),
    len: u32(buf, 12),
    data: buf.slice(24)
  };
}

function cmdName(c) {
  for (var k in ADB) {
    if (ADB[k] === c) return k;
  }
  return '0x' + c.toString(16);
}

var wsUrl = 'ws://' + TV + ':8001/api/v2/channels/sdb?name=' + Buffer.from(HOSTNAME).toString('base64');
console.log('[WS]', wsUrl);

var ws = new WebSocket(wsUrl.Replace ? wsUrl : wsUrl, { headers: { 'User-Agent': 'SMITH/1.0' } });
var buf = [];
var registered = false;
var cnxnDone = false;
var streamIds = { local: 20000, remote: -1 };
var gotData = '';

ws.on('open', function () {
  console.log('[+] websocket aberto');
  var msg = JSON.stringify({
    event: 'register',
    host: HOSTNAME,
    version: '1.0',
    deviceIP: TV,
    app: 'true'
  });
  console.log('[>]', msg);
  ws.send(msg);
});

ws.on('message', function (data, isBinary) {
  if (!isBinary) {
    var txt = data.toString();
    console.log('[<] texto:', txt.slice(0, 400));
    var j = null;
    try { j = JSON.parse(txt); } catch (e) {}
    if (j && j.event === 'appControl' && !registered) {
      registered = true;
      console.log('[>] echo appControl (challenge)');
      ws.send(JSON.stringify({ event: 'appControl', payload: j.payload }));
      setTimeout(function () {
        console.log('[>] CNXN adb');
        ws.send(adbPacket(ADB.CMD_CNXN, ADB.A_VERSION, ADB.A_MAXDATA, Buffer.from('host::')));
      }, 300);
    }
    return;
  }
  var raw = Buffer.from(data);
  buf.push(raw);
  var all = Buffer.concat(buf);
  while (all.length >= 24) {
    var pkt = parsePacket(all);
    if (all.length < 24 + pkt.len) break;
    var body = pkt.data;
    all = all.slice(24 + pkt.len);
    console.log('[adb]', cmdName(pkt.cmd), 'arg0=' + pkt.arg0, 'arg1=' + pkt.arg1, 'len=' + pkt.len, body.length ? JSON.stringify(body.toString('ascii').slice(0, 80)) : '');

    if (pkt.cmd === ADB.CMD_CNXN) {
      cnxnDone = true;
      console.log('[>] OPEN ' + CMD);
      ws.send(adbPacket(ADB.CMD_OPEN, streamIds.local, 0, Buffer.from(CMD)));
    } else if (pkt.cmd === ADB.CMD_OKAY && !streamIds.remote) {
      streamIds.remote = pkt.arg0;
    } else if (pkt.cmd === ADB.CMD_WRTE) {
      gotData += body.toString('utf8');
      ws.send(adbPacket(ADB.CMD_OKAY, pkt.arg0, pkt.arg1));
    } else if (pkt.cmd === ADB.CMD_CLSE) {
      console.log('[OUT]');
      console.log(gotData);
      process.exit(0);
    }
  }
  buf = [all];
});

ws.on('error', function (e) {
  console.error('[WS ERR]', e.message);
  process.exit(1);
});

setTimeout(function () {
  console.error('[TIMEOUT]');
  console.log('[OUT PARCIAL]');
  console.log(gotData);
  process.exit(2);
}, 25000);
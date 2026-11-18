/* Varre portas da TV procurando o Web Inspector (CDP). */
'use strict';
var net = require('net');
var http = require('http');

var HOST = '192.168.2.106';
var START = 30000;
var END = 50000;
var BATCH = 600;
var TIMEOUT = 120;

function testPort(p) {
  return new Promise(function (resolve) {
    var s = new net.Socket();
    var done = false;
    function fin(ok) {
      if (done) return;
      done = true;
      try { s.destroy(); } catch (e) {}
      resolve(ok ? p : 0);
    }
    s.setTimeout(TIMEOUT);
    s.once('connect', function () { fin(true); });
    s.once('timeout', function () { fin(false); });
    s.once('error', function () { fin(false); });
    s.connect(p, HOST);
  });
}

function probeCDP(port) {
  return new Promise(function (resolve) {
    var req = http.get({ host: HOST, port: port, path: '/json/list', timeout: 1500 }, function (res) {
      var b = '';
      res.on('data', function (d) { b += d; });
      res.on('end', function () {
        var ok = false;
        try {
          var j = JSON.parse(b);
          ok = Array.isArray(j) && j.length > 0;
          if (ok) console.log('CDP TARGETS @' + port + ': ' + j.map(function (t) { return (t.type || '') + ' ' + (t.url || t.title || ''); }).join(' | ').slice(0, 600));
        } catch (e) {}
        resolve(ok ? port : 0);
      });
    });
    req.on('error', function () { resolve(0); });
    req.on('timeout', function () { req.destroy(); resolve(0); });
  });
}

(async function () {
  var hits = [];
  for (var base = START; base < END; base += BATCH) {
    var ps = [];
    for (var p = base; p < Math.min(base + BATCH, END); p++) ps.push(testPort(p));
    var res = await Promise.all(ps);
    res.forEach(function (p) { if (p) hits.push(p); });
    if (hits.length) console.log('abertas ate ' + (base + BATCH) + ': ' + hits.join(','));
  }
  console.log('PORTAS ABERTAS: ' + (hits.join(',') || 'nenhuma'));
  for (var i = 0; i < hits.length; i++) await probeCDP(hits[i]);
  process.exit(0);
})();
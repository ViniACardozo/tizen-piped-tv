/* Monitora portas CDP da TV por um tempo, imprimindo alvos novos. */
'use strict';
var net = require('net');
var http = require('http');
var H = '192.168.2.106';
var START = Number(process.argv[2] || 30000);
var END = Number(process.argv[3] || 50000);
var SECS = Number(process.argv[4] || 40);
var seen = {};
var t0 = Date.now();

function probe(p) {
  return new Promise(function (res) {
    var done = false;
    var s = new net.Socket();
    function fin(ok) {
      if (done) return; done = true;
      try { s.destroy(); } catch (e) {}
      res(ok ? p : 0);
    }
    s.setTimeout(120);
    s.once('connect', function () { fin(true); });
    s.once('timeout', function () { fin(false); });
    s.once('error', function () { fin(false); });
    s.connect(p, H);
  });
}

function targets(p, cb) {
  var req = http.get({ host: H, port: p, path: '/json/list', timeout: 1200 }, function (res) {
    var b = '';
    res.on('data', function (d) { b += d; });
    res.on('end', function () {
      try { var j = JSON.parse(b); cb(j.map(function (t) { return (t.url || t.title || '').slice(0, 90); }).join(' | ')); }
      catch (e) { cb(''); }
    });
  });
  req.on('error', function () { cb(''); });
  req.on('timeout', function () { req.destroy(); cb(''); });
}

function sweep() {
  var queue = [];
  for (var p = START; p < END; p++) queue.push(p);
  var idx = 0;
  function worker() {
    if (idx >= queue.length) return;
    var p = queue[idx++];
    probe(p).then(function (ok) {
      if (ok && !seen[p]) {
        targets(p, function (u) {
          if (u) { seen[p] = u; console.log(((Date.now() - t0) / 1000).toFixed(1) + 's PORT ' + p + ' ' + u); }
        });
      }
      worker();
    });
  }
  for (var i = 0; i < 300; i++) worker();
}

sweep();
setInterval(sweep, 1500);
setTimeout(function () { process.exit(0); }, SECS * 1000);

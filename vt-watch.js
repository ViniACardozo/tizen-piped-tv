/* Vigia a TV e injeta o ViniTube em qualquer pagina do YouTube TV que aparecer. */
'use strict';
var http = require('http');
var net = require('net');
var fs = require('fs');
var W = require('ws');

var TV = '192.168.2.106';
var START = 30000;
var END = 50000;
var SRC = fs.readFileSync(__dirname + '/dist/userScript.js', 'utf8');
var last = {};
var lastLaunch = 0;

function launchApp() {
  if (Date.now() - lastLaunch < 45000) return;
  lastLaunch = Date.now();
  var body = JSON.stringify({ id: 'xvvl3S1bvH.TizenBrewStandalone', action_type: 'DEEP_LINK' });
  var r = http.request({
    host: TV, port: 8001,
    path: '/api/v2/applications/xvvl3S1bvH.TizenBrewStandalone',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: 6000
  }, function (s) { s.resume(); console.log(new Date().toISOString().slice(11, 19) + ' app lancado'); });
  r.on('error', function () {});
  r.on('timeout', function () { r.destroy(); });
  r.end(body);
}

function tcp(port) {
  return new Promise(function (res) {
    var s = new net.Socket();
    var done = false;
    function fin(ok) { if (done) return; done = true; try { s.destroy(); } catch (e) {} res(ok); }
    s.setTimeout(120);
    s.once('connect', function () { fin(true); });
    s.once('timeout', function () { fin(false); });
    s.once('error', function () { fin(false); });
    s.connect(port, TV);
  });
}

function list(port) {
  return new Promise(function (res) {
    var r = http.get({ host: TV, port: port, path: '/json/list', timeout: 900 }, function (s) {
      var b = '';
      s.on('data', function (d) { b += d; });
      s.on('end', function () { try { res(JSON.parse(b)); } catch (e) { res(null); } });
    });
    r.on('error', function () { res(null); });
    r.on('timeout', function () { r.destroy(); res(null); });
  });
}

function scan() {
  return new Promise(function (resolve) {
    var ports = [];
    for (var p = START; p < END; p++) ports.push(p);
    var idx = 0, active = 0, out = [];
    function next() {
      if (idx >= ports.length) { if (active === 0) resolve(out); return; }
      var port = ports[idx++];
      active++;
      tcp(port).then(function (ok) {
        if (!ok) { active--; next(); return; }
        list(port).then(function (l) {
          if (l) {
            for (var i = 0; i < l.length; i++) if (l[i].webSocketDebuggerUrl) out.push({ port: port, t: l[i] });
          }
          active--;
          next();
        });
      });
    }
    for (var i = 0; i < 300; i++) next();
  });
}

function inject(entry) {
  return new Promise(function (resolve) {
    var key = entry.port + '|' + entry.t.id;
    var url = entry.t.webSocketDebuggerUrl.replace('localhost', TV).replace('127.0.0.1', TV);
    var ws = new W(url, { perMessageDeflate: false });
    var id = 0, wait = {};
    function send(m, p) {
      return new Promise(function (res, rej) {
        var i = ++id;
        wait[i] = { res: res, rej: rej };
        ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
        setTimeout(function () { if (wait[i]) { delete wait[i]; rej(new Error('timeout ')); } }, 15000);
      });
    }
    ws.on('message', function (raw) {
      var m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      if (m.id && wait[m.id]) { var w = wait[m.id]; delete wait[m.id]; if (m.error) w.rej(new Error('cdp')); else w.res(m.result); }
    });
    ws.on('error', function () { resolve(false); });
    ws.on('open', function () {
      (async function () {
        try {
          await send('Page.enable', {});
          await send('Page.addScriptToEvaluateOnNewDocument', { source: SRC });
          var cur = entry.t.url || '';
          if (cur.indexOf('youtube.com') === -1) {
            await send('Page.navigate', { url: 'https://www.youtube.com/tv' });
            console.log(new Date().toISOString().slice(11, 19) + ' navegou ' + cur);
          } else {
            await send('Page.reload', { ignoreCache: false });
            console.log(new Date().toISOString().slice(11, 19) + ' recarregou youtube');
          }
          last[key] = Date.now();
          resolve(true);
        } catch (e) {
          resolve(false);
        } finally { try { ws.close(); } catch (e) {} }
      })();
    });
  });
}

async function cycle() {
  try {
    var found = await scan();
    if (!found.length) { launchApp(); return; }
    for (var i = 0; i < found.length; i++) {
      var e = found[i];
      var url = e.t.url || '';
      if (url.indexOf('youtube.com') > -1 || url.indexOf('tizenbrew-ui') > -1) {
        var key = e.port + '|' + e.t.id;
        if (last[key] && Date.now() - last[key] < 45000) continue;
        await inject(e);
      }
    }
  } catch (e) {
    console.log('erro ' + e.message);
  }
}

console.log('vigiando ' + TV);
cycle();
setInterval(cycle, 15000);

/* ViniTube - service autonomo: acha o webview depurado, injeta o userscript e abre o YouTube TV. */
(function () {
  'use strict';

  var MODULE = 'gh/ViniACardozo/tizen-piped-tv@v2.5.13';
  var SCRIPT_URL = 'https://cdn.jsdelivr.net/' + MODULE + '/dist/userScript.js';
  var TARGET_URL = 'https://www.youtube.com/tv';
  var scanning = false;

  function log(m) { try { console.log('[vinitube] ' + m); } catch (e) {} }

  var WS = null;
  try { WS = require('ws-new'); } catch (e) {}
  if (!WS) { try { WS = require('ws'); } catch (e) {} }
  if (!WS) { try { WS = require('ws-old'); } catch (e) {} }

  var http = require('http');

  function getJSON(port) {
    return new Promise(function (res) {
      var r = http.get({ host: '127.0.0.1', port: port, path: '/json/list', timeout: 700 }, function (s) {
        var b = '';
        s.on('data', function (d) { b += d; });
        s.on('end', function () {
          try { res(JSON.parse(b)); } catch (e) { res(null); }
        });
      });
      r.on('error', function () { res(null); });
      r.on('timeout', function () { r.destroy(); res(null); });
    });
  }

  function tcp(port) {
    return new Promise(function (res) {
      var s = require('net').Socket();
      var done = false;
      function fin(ok) { if (done) return; done = true; try { s.destroy(); } catch (e) {} res(ok); }
      s.setTimeout(120);
      s.once('connect', function () { fin(true); });
      s.once('timeout', function () { fin(false); });
      s.once('error', function () { fin(false); });
      s.connect(port, '127.0.0.1');
    });
  }

  function findTargets() {
    return new Promise(function (resolve) {
      var ports = [];
      for (var p = 30000; p < 50000; p++) ports.push(p);
      var idx = 0, active = 0, out = [];
      function next() {
        if (idx >= ports.length) {
          if (active === 0) resolve(out);
          return;
        }
        var port = ports[idx++];
        active++;
        tcp(port).then(function (ok) {
          if (!ok) { active--; next(); return; }
          getJSON(port).then(function (list) {
            if (list) {
              for (var i = 0; i < list.length; i++) {
                if (list[i].webSocketDebuggerUrl) out.push({ port: port, target: list[i] });
              }
            }
            active--;
            next();
          });
        });
      }
      for (var i = 0; i < 200; i++) next();
    });
  }

  function fetchScript() {
    return new Promise(function (res, rej) {
      var mod = null;
      try { mod = require('https'); } catch (e) { return rej(e); }
      var r = mod.get(SCRIPT_URL, function (s) {
        if (s.statusCode !== 200) { s.resume(); return rej(new Error('http ' + s.statusCode)); }
        var b = '';
        s.setEncoding('utf8');
        s.on('data', function (d) { b += d; });
        s.on('end', function () { res(b); });
      });
      r.on('error', rej);
      r.setTimeout(8000, function () { r.destroy(); rej(new Error('timeout')); });
    });
  }

  function injectInto(t) {
    return new Promise(function (resolve) {
      var Script = null;
      var url = t.target.webSocketDebuggerUrl.replace('localhost', '127.0.0.1');
      var ws = new WS(url, { perMessageDeflate: false });
      var id = 0, wait = {};

      function send(method, params) {
        return new Promise(function (res, rej) {
          var i = ++id;
          wait[i] = { res: res, rej: rej };
          ws.send(JSON.stringify({ id: i, method: method, params: params || {} }));
          setTimeout(function () { if (wait[i]) { delete wait[i]; rej(new Error('timeout ' + method)); } }, 15000);
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
            if (!Script) Script = await fetchScript();
            await send('Page.enable', {});
            await send('Page.addScriptToEvaluateOnNewDocument', { source: Script });
            await send('Runtime.evaluate', { expression: Script });
            var cur = t.target.url || '';
            if (cur.indexOf('youtube.com') === -1) await send('Page.navigate', { url: TARGET_URL });
            log('injetado em ' + cur);
            resolve(true);
          } catch (e) {
            log('falha: ' + e.message);
            resolve(false);
          } finally {
            try { ws.close(); } catch (e) {}
          }
        })();
      });
    });
  }

  async function tick() {
    if (scanning) return;
    scanning = true;
    try {
      var list = await findTargets();
      if (!list.length) { scanning = false; return; }
      var page = null;
      for (var i = 0; i < list.length; i++) {
        var u = list[i].target.url || '';
        if (u.indexOf('youtube.com') > -1) { page = list[i]; break; }
      }
      if (!page) {
        for (var j = 0; j < list.length; j++) {
          if ((list[j].target.url || '').indexOf('tizenbrew-ui') > -1) { page = list[j]; break; }
        }
      }
      if (page) await injectInto(page);
    } catch (e) {
      log('erro ' + e.message);
    }
    scanning = false;
  }

  try {
    if (typeof tizen !== 'undefined' && tizen && tizen.tvinputdevice) {
      ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'MediaTrackNext', 'MediaTrackPrevious', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'].forEach(function (k) {
        try { tizen.tvinputdevice.registerKey(k); } catch (e) {}
      });
    }
  } catch (e) {}

  log('service iniciado');
  setTimeout(tick, 4000);
  setInterval(tick, 15000);
})();

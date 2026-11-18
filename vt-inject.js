/* Injeta o userscript do ViniTube no WebView do TizenBrew via CDP e tira screenshot. */
'use strict';
var http = require('http');
var fs = require('fs');
var W = require('ws');

var TV = '192.168.2.106';
var PORT = Number(process.argv[2] || 36051);
var INJECT = process.argv[3] !== 'noinject';
var SHOT = process.argv[4] || 'vt-after.png';

function list() {
  return new Promise(function (res, rej) {
    var r = http.get({ host: TV, port: PORT, path: '/json/list', timeout: 5000 }, function (s) {
      var b = '';
      s.on('data', function (d) { b += d; });
      s.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    });
    r.on('error', rej);
    r.on('timeout', function () { r.destroy(); rej(new Error('timeout')); });
  });
}

list().then(function (targets) {
  console.log('TARGETS: ' + targets.map(function (t) { return t.url; }).join(' | '));
  var page = targets.filter(function (t) { return t.webSocketDebuggerUrl; })[0];
  if (!page) { console.log('sem target'); process.exit(1); }

  var url = page.webSocketDebuggerUrl.replace('localhost', TV).replace('127.0.0.1', TV);
  var ws = new W(url, { perMessageDeflate: false });
  var id = 0, waiting = {};

  function send(method, params) {
    return new Promise(function (res, rej) {
      var i = ++id;
      waiting[i] = { res: res, rej: rej };
      ws.send(JSON.stringify({ id: i, method: method, params: params || {} }));
      setTimeout(function () { if (waiting[i]) { delete waiting[i]; rej(new Error('timeout ' + method)); } }, 40000);
    });
  }

  ws.on('message', function (raw) {
    var m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (m.id && waiting[m.id]) {
      var w = waiting[m.id];
      delete waiting[m.id];
      if (m.error) w.rej(new Error(JSON.stringify(m.error)));
      else w.res(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      var d = m.params.exceptionDetails || {};
      console.log('[exc]', d.text, (d.exception && d.exception.description || '').slice(0, 200));
    }
  });

  ws.on('open', function () {
    (async function () {
      try {
        await send('Page.enable', {});
        await send('Runtime.enable', {});

        if (INJECT) {
          var src = fs.readFileSync(__dirname + '/dist/userScript.js', 'utf8');
          await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
          console.log('script registrado (' + src.length + ' bytes)');
        }

        var cur = page.url || '';
        if (cur.indexOf('youtube.com') === -1) {
          console.log('navegando para youtube.com/tv');
          await send('Page.navigate', { url: 'https://www.youtube.com/tv' });
        } else {
          console.log('recarregando pagina atual');
          await send('Page.reload', { ignoreCache: false });
        }

        await new Promise(function (r) { setTimeout(r, 16000); });

        var chk = await send('Runtime.evaluate', {
          expression: '(function(){return JSON.stringify({hook: !!window.__vinitube, title: document.title, hidden: document.querySelectorAll("[data-vt-hidden]").length, url: location.href})})()',
          returnByValue: true
        });
        console.log('CHECK: ' + (chk.result && chk.result.value));

        var s = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(SHOT, Buffer.from(s.data, 'base64'));
        console.log('SAVED ' + SHOT);
        ws.close();
        process.exit(0);
      } catch (e) {
        console.log('ERRO ' + e.message);
        process.exit(1);
      }
    })();
  });

  ws.on('error', function (e) { console.log('WS ' + e.message); process.exit(1); });
}).catch(function (e) { console.log('LIST ' + e.message); process.exit(1); });
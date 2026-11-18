/* CDP client para a TV: avalia JS e tira screenshot da pagina do modulo. */
'use strict';
var http = require('http');
var fs = require('fs');
var W = require('ws');

var TV = '192.168.2.106';
var PORT = Number(process.argv[2] || 35533);
var MODE = process.argv[3] || 'eval';
var ARG = process.argv.slice(4).join(' ') || '';

function listTargets() {
  return new Promise(function (resolve, reject) {
    var req = http.get({ host: TV, port: PORT, path: '/json/list', timeout: 4000 }, function (res) {
      var b = '';
      res.on('data', function (d) { b += d; });
      res.on('end', function () {
        try { resolve(JSON.parse(b)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', function () { req.destroy(); reject(new Error('timeout')); });
  });
}

listTargets().then(function (targets) {
  var page = null;
  for (var i = 0; i < targets.length; i++) {
    if (targets[i].webSocketDebuggerUrl && /index\.html/.test(targets[i].url || '')) { page = targets[i]; break; }
  }
  if (!page) page = targets[0];
  if (!page || !page.webSocketDebuggerUrl) {
    console.log('sem target com ws');
    process.exit(1);
  }
  var url = page.webSocketDebuggerUrl.replace('127.0.0.1', TV).replace('localhost', TV);
  console.log('TARGET', page.url);

  var ws = new W(url, { perMessageDeflate: false });
  var id = 0;
  var waiting = {};

  function send(method, params) {
    return new Promise(function (resolve, reject) {
      var myId = ++id;
      waiting[myId] = { resolve: resolve, reject: reject };
      ws.send(JSON.stringify({ id: myId, method: method, params: params || {} }));
      setTimeout(function () {
        if (waiting[myId]) { delete waiting[myId]; reject(new Error('timeout ' + method)); }
      }, 30000);
    });
  }

  ws.on('message', function (raw) {
    var m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (m.id && waiting[m.id]) {
      var w = waiting[m.id];
      delete waiting[m.id];
      if (m.error) w.reject(new Error(JSON.stringify(m.error)));
      else w.resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      var args = (m.params.args || []).map(function (a) {
        return a.value !== undefined ? a.value : (a.description || a.type);
      }).join(' ');
      console.log('[console.' + m.params.type + ']', args);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      var d = m.params.exceptionDetails || {};
      console.log('[exception]', d.text, d.exception && d.exception.description ? d.exception.description.slice(0, 400) : '');
    }
    if (m.method === 'Log.entryAdded') {
      console.log('[log]', m.params.entry.level, m.params.entry.text, m.params.entry.url || '');
    }
  });

  ws.on('open', function () {
    (async function () {
      try {
        await send('Runtime.enable', {});
        try { await send('Log.enable', {}); } catch (e) {}
        try { await send('Page.enable', {}); } catch (e) {}

        if (MODE === 'evalfile') {
          var fexpr = fs.readFileSync(ARG.trim(), 'utf8');
          var fr = await send('Runtime.evaluate', { expression: fexpr, awaitPromise: true, returnByValue: true, userGesture: true });
          if (fr.exceptionDetails) console.log('EXCEPTION', JSON.stringify(fr.exceptionDetails).slice(0, 500));
          else console.log('RESULT:', typeof fr.result.value === 'string' ? fr.result.value : JSON.stringify(fr.result.value));
        } else if (MODE === 'eval') {
          var expr = ARG || '1+1';
          var r = await send('Runtime.evaluate', {
            expression: expr,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true
          });
          if (r.exceptionDetails) {
            console.log('EXCEPTION', JSON.stringify(r.exceptionDetails).slice(0, 800));
          } else {
            console.log('RESULT:', typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value));
          }
        } else if (MODE === 'shot') {
          var s = await send('Page.captureScreenshot', { format: 'png' });
          var file = ARG || 'tv-shot.png';
          fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
          console.log('SAVED', file);
        } else if (MODE === 'listen') {
          var ms = Number(ARG) || 12000;
          console.log('listening ' + ms + 'ms');
          await new Promise(function (res) { setTimeout(res, ms); });
        } else if (MODE === 'reload') {
          await send('Page.reload', { ignoreCache: true });
          console.log('reloaded');
        }
        ws.close();
        process.exit(0);
      } catch (e) {
        console.log('ERRO', e.message);
        process.exit(1);
      }
    })();
  });

  ws.on('error', function (e) {
    console.log('WS ERRO', e.message);
    process.exit(1);
  });
}).catch(function (e) {
  console.log('LIST ERRO', e.message);
  process.exit(1);
});
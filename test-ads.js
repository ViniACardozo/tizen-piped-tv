/* Abre um video e observa se aparece anuncio (pre-roll) por 40s. */
'use strict';
var http = require('http');
var fs = require('fs');
var W = require('ws');

var TV = '192.168.2.106';
var PORT = Number(process.argv[2] || 33195);
var VID = process.argv[3] || 'dQw4w9WgXcQ';
var SHOT = process.argv[4] || 'vt-adtest.png';

function list() {
  return new Promise(function (res, rej) {
    http.get({ host: TV, port: PORT, path: '/json/list', timeout: 5000 }, function (s) {
      var b = '';
      s.on('data', function (d) { b += d; });
      s.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

list().then(function (targets) {
  var page = targets.filter(function (t) { return t.webSocketDebuggerUrl; })[0];
  var url = page.webSocketDebuggerUrl.replace('localhost', TV).replace('127.0.0.1', TV);
  var ws = new W(url, { perMessageDeflate: false });
  var id = 0, wait = {};
  function send(m, p) {
    return new Promise(function (res, rej) {
      var i = ++id;
      wait[i] = { res: res, rej: rej };
      ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
      setTimeout(function () { if (wait[i]) { delete wait[i]; rej(new Error('timeout ' + m)); } }, 40000);
    });
  }
  ws.on('message', function (raw) {
    var m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (m.id && wait[m.id]) { var w = wait[m.id]; delete wait[m.id]; m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
  });

  function probe() {
    return send('Runtime.evaluate', {
      expression: '(function(){var p=document.querySelector(".html5-video-player");var v=document.querySelector("video");return JSON.stringify({ver:window.__vtVer,t:document.title,ad:p?p.classList.contains("ad-showing"):null,m:p?!!p.querySelector(".ytp-ad-module,.ytp-ad-player-overlay,.ytp-ad-image-overlay"):null,adDivs:document.querySelectorAll("[class*=ytp-ad]").length,cur:v?(v.currentTime|0):null,dur:v?(v.duration|0):null,vol:v?v.muted:null})})()',
      returnByValue: true
    });
  }

  ws.on('open', function () {
    (async function () {
      await send('Page.enable', {});
      var src = fs.readFileSync(__dirname + '/dist/userScript.js', 'utf8');
      await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
      await send('Page.navigate', { url: 'https://www.youtube.com/tv#/watch?v=' + VID });
      for (var i = 0; i < 10; i++) {
        await new Promise(function (r) { setTimeout(r, 4000); });
        var r = await probe();
        console.log((i * 4 + 4) + 's ' + r.result.value);
      }
      var s = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(SHOT, Buffer.from(s.data, 'base64'));
      console.log('SAVED ' + SHOT);
      process.exit(0);
    })().catch(function (e) { console.log('ERRO ' + e.message); process.exit(1); });
  });
  ws.on('error', function (e) { console.log('WS ' + e.message); process.exit(1); });
});

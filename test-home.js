/* Injeta o userscript, vai para a home do YouTube TV e inspeciona patrocinados. */
'use strict';
var http = require('http');
var fs = require('fs');
var W = require('ws');

var TV = '192.168.2.106';
var PORT = Number(process.argv[2] || 33195);
var SHOT = process.argv[3] || 'vt-home3.png';

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
  ws.on('open', function () {
    (async function () {
      await send('Page.enable', {});
      var src = fs.readFileSync(__dirname + '/dist/userScript.js', 'utf8');
      await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
      await send('Page.navigate', { url: 'https://www.youtube.com/tv' });
      await new Promise(function (r) { setTimeout(r, 15000); });
      var r = await send('Runtime.evaluate', {
        expression: '(function(){var o=[];var a=document.querySelectorAll("[data-vt-hidden]");for(var i=0;i<a.length;i++){var b=a[i].getBoundingClientRect();o.push({lbl:a[i].getAttribute("data-vt-lbl"),x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0})}var s=[];var all=document.querySelectorAll("body *");for(var j=0;j<all.length;j++){var e=all[j];if(e.childElementCount>1)continue;var t=(e.textContent||"").trim();if(t.length&&t.length<=45&&/patrocinado|sponsored|promovido|an[uú]ncio/i.test(t)){var c=e.getBoundingClientRect();s.push(t.slice(0,25)+" @"+(c.x|0)+","+(c.y|0)+" "+(c.width|0)+"x"+(c.height|0))}}return JSON.stringify({ver:window.__vtVer,title:document.title,url:location.href,hidden:o,lbls:s.slice(0,10)})})()',
        returnByValue: true
      });
      console.log('RES ' + r.result.value);
      var s = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(SHOT, Buffer.from(s.data, 'base64'));
      console.log('SAVED ' + SHOT);
      process.exit(0);
    })().catch(function (e) { console.log('ERRO ' + e.message); process.exit(1); });
  });
  ws.on('error', function (e) { console.log('WS ' + e.message); process.exit(1); });
});

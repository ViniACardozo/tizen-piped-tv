/* Recebe beacons do userscript rodando na TV. */
'use strict';
var http = require('http');
var url = require('url');
http.createServer(function (req, res) {
  var u = url.parse(req.url, true);
  var d = u.query.d || '';
  try { d = decodeURIComponent(d); } catch (e) {}
  console.log(new Date().toISOString().slice(11, 19) + ' ' + (u.pathname || '') + ' ' + d);
  res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
  res.end('ok');
}).listen(9099, '0.0.0.0', function () { console.log('beacon server on 9099'); });

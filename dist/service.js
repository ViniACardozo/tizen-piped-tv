/* ViniTube - service de diagnostico (TizenBrew). Reporta ao PC via HTTP. */
(function () {
  'use strict';

  var HOST = '192.168.2.102';
  var PORT = 9099;

  function post(obj) {
    try {
      var http = require('http');
      var body = encodeURIComponent(JSON.stringify(obj));
      var req = http.request({ host: HOST, port: PORT, path: '/svc?d=' + body, method: 'GET' });
      req.on('error', function () {});
      req.end();
    } catch (e) {}
  }

  post({ ev: 'boot', node: typeof process !== 'undefined' ? process.version : 'no-process', plat: typeof process !== 'undefined' ? process.platform : '' });

  var cp = null;
  try { cp = require('child_process'); post({ ev: 'cp', ok: true }); }
  catch (e) { post({ ev: 'cp', ok: false, msg: String(e.message || e) }); }

  if (cp) {
    var cmds = [
      'id',
      'which sdb',
      'ls /usr/bin | grep -i sdb',
      'ls /home/owner/share',
      'cat /home/owner/share/tizenbrewConfig.json',
      'ls /home/owner'
    ];
    cmds.forEach(function (c) {
      try {
        cp.exec(c, function (err, stdout, stderr) {
          post({ ev: 'exec', cmd: c, err: err ? String(err).slice(0, 150) : '', out: String(stdout || '').slice(0, 500), serr: String(stderr || '').slice(0, 200) });
        });
      } catch (e) {
        post({ ev: 'exec-fail', cmd: c, msg: String(e.message || e) });
      }
    });
  }

  try {
    if (typeof tizen !== 'undefined' && tizen && tizen.tvinputdevice) {
      ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'MediaTrackNext', 'MediaTrackPrevious', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'].forEach(function (k) {
        try { tizen.tvinputdevice.registerKey(k); } catch (e) {}
      });
    }
  } catch (e) {}

  setInterval(function () {}, 60000);
})();

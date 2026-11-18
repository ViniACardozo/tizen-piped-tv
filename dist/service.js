/* PipedTV Player - service Node (TizenBrew). Registra as teclas de midia no app. */
(function () {
  'use strict';

  var K = [
    'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
    'MediaFastForward', 'MediaRewind', 'MediaTrackNext', 'MediaTrackPrevious',
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'
  ];

  try {
    if (typeof tizen !== 'undefined' && tizen && tizen.tvinputdevice) {
      for (var i = 0; i < K.length; i++) {
        try { tizen.tvinputdevice.registerKey(K[i]); } catch (e) {}
      }
    }
  } catch (e) {}

  /* mantem o service vivo sem consumir CPU */
  setInterval(function () {}, 60000);
})();
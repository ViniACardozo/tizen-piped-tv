/* PipedTV Player - patch injetado no YouTube TV (TizenBrew mods).
   Roda antes do player: remove adPlacements/playerAds, bloqueia endpoints de anuncio,
   limpa overlays do DOM e evita pausa por anuncio. */
(function () {
  'use strict';

  if (window.__pipedtvPlayer) return;
  window.__pipedtvPlayer = true;

  var AD_FIELDS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakParams', 'adParams', 'adBreakHeartbeatParams', 'playerAdParams'];
  var AD_URL = [
    /\/pagead\//i,
    /\/api\/stats\/ads/i,
    /\/api\/stats\/atr/i,
    /doubleclick\.net/i,
    /googleadservices/i,
    /\/ptracking/i,
    /\/adunit/i,
    /\/get_midroll_/i,
    /\/api\/stats\/playback/i
  ];

  function isAdUrl(u) {
    if (!u) return false;
    u = String(u);
    for (var i = 0; i < AD_URL.length; i++) if (AD_URL[i].test(u)) return true;
    return false;
  }

  /* remove campos de anuncio recursivamente */
  function scrub(o, depth) {
    if (!o || typeof o !== 'object' || depth > 8) return o;
    if (Array.isArray(o)) {
      for (var i = 0; i < o.length; i++) scrub(o[i], depth + 1);
      return o;
    }
    for (var k in o) {
      if (AD_FIELDS.indexOf(k) >= 0) { try { delete o[k]; } catch (e) {} continue; }
      var v = o[k];
      if (v && typeof v === 'object') scrub(v, depth + 1);
    }
    return o;
  }

  /* JSON.parse hook */
  var origParse = JSON.parse;
  try {
    JSON.parse = function () {
      var r = origParse.apply(this, arguments);
      try { scrub(r, 0); } catch (e) {}
      return r;
    };
  } catch (e) {}

  /* ytInitialPlayerResponse / ytInitialData setters */
  ['ytInitialPlayerResponse', 'ytInitialData', 'ytInitialReachability'].forEach(function (name) {
    var store;
    try {
      var d = Object.getOwnPropertyDescriptor(window, name);
      if (d && d.get) return;
      Object.defineProperty(window, name, {
        configurable: true,
        get: function () { return store; },
        set: function (v) { try { scrub(v, 0); } catch (e) {} store = v; }
      });
    } catch (e) {}
  });

  /* fetch hook: bloqueia anuncio e limpa JSON */
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (isAdUrl(url)) {
        return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return origFetch.apply(this, arguments).then(function (res) {
        try {
          var ct = res.headers.get('content-type') || '';
          if (ct.indexOf('json') >= 0) {
            return res.clone().text().then(function (t) {
              var j;
              try { j = origParse(t); } catch (e) { return res; }
              scrub(j, 0);
              return new Response(JSON.stringify(j), { status: res.status, statusText: res.statusText, headers: res.headers });
            }).catch(function () { return res; });
          }
        } catch (e) {}
        return res;
      });
    };
  }

  /* XHR hook */
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ad = isAdUrl(url);
    return origOpen.apply(this, arguments);
  };
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this.__ad) { try { this.abort(); } catch (e) {} return; }
    return origSend.apply(this, arguments);
  };

  /* CSS de emergencia */
  try {
    var st = document.createElement('style');
    st.textContent =
      '.ytp-ad-module,.ytp-ad-overlay-container,.ytp-ad-image-overlay,.ytp-ad-player-overlay,.ytp-ad-text-overlay,.ytp-ad-survey,.ytp-ad-progress,.ytp-ad-skip-button-container{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}' +
      '.ad-showing .video-ads,.ad-showing .ytp-ad-module{display:none!important}' +
      'ytd-display-ad-renderer,ytd-promoted-sparkles-web-renderer,ytd-ad-slot-renderer,ytm-promoted-sparkles-web-renderer{display:none!important}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}

  /* observa o player e neutraliza estado de anuncio */
  function cleanAds() {
    try {
      var nodes = document.querySelectorAll('.ytp-ad-module,.ytp-ad-overlay-container,.ytp-ad-image-overlay,.ytp-ad-player-overlay,.ytp-ad-text-overlay');
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n && n.parentNode) n.parentNode.removeChild(n);
      }
      var player = document.querySelector('.html5-video-player');
      if (player) {
        if (player.classList.contains('ad-showing')) player.classList.remove('ad-showing');
        if (player.classList.contains('ad-interrupting')) player.classList.remove('ad-interrupting');
      }
      var skip = document.querySelector('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button');
      if (skip) skip.click();
    } catch (e) {}
  }

  try {
    var mo = new MutationObserver(function () { cleanAds(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(cleanAds, 1500);
  } catch (e) {}

  /* permite voltar com o botao Return sem sair do app */
  try {
    var keyHandler = function (e) {
      var kc = e.keyCode || e.which;
      if (kc === 10009 && window.history && window.history.length > 1) {
        try { window.history.back(); } catch (er) {}
      }
    };
    document.addEventListener('keydown', keyHandler, true);
  } catch (e) {}
})();
/* ViniTube Player - patch injetado no YouTube TV (TizenBrew mods).
   - remove adPlacements/playerAds e bloqueia endpoints de anuncio
   - esconde cards "Patrocinado"
   - troca a marca para ViniTube (titulo, logo, splash) */
(function () {
  'use strict';

  if (window.__vinitube) return;
  window.__vinitube = true;

  var BRAND = 'ViniTube';

  var AD_FIELDS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakParams', 'adParams', 'adBreakHeartbeatParams', 'playerAdParams'];
  var AD_URL = [
    /\/pagead\//i, /\/api\/stats\/ads/i, /\/api\/stats\/atr/i, /doubleclick\.net/i,
    /googleadservices/i, /\/ptracking/i, /\/adunit/i, /\/get_midroll_/i, /\/api\/stats\/playback/i
  ];
  var SPONSOR_TXT = /^(patrocinado|patrocinado por|sponsored|promoted|an[uú]ncio)$/i;

  function isAdUrl(u) {
    if (!u) return false;
    u = String(u);
    for (var i = 0; i < AD_URL.length; i++) if (AD_URL[i].test(u)) return true;
    return false;
  }

  function scrub(o, d) {
    if (!o || typeof o !== 'object' || d > 8) return o;
    if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) scrub(o[i], d + 1); return o; }
    for (var k in o) {
      if (AD_FIELDS.indexOf(k) >= 0) { try { delete o[k]; } catch (e) {} continue; }
      var v = o[k];
      if (v && typeof v === 'object') scrub(v, d + 1);
    }
    return o;
  }

  /* ---- JSON / fetch / xhr ---- */
  var origParse = JSON.parse;
  try {
    JSON.parse = function () {
      var r = origParse.apply(this, arguments);
      try { scrub(r, 0); } catch (e) {}
      return r;
    };
  } catch (e) {}

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

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (isAdUrl(url)) return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
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

  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__ad = isAdUrl(u);
    return origOpen.apply(this, arguments);
  };
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this.__ad) { try { this.abort(); } catch (e) {} return; }
    return origSend.apply(this, arguments);
  };

  /* ---- CSS ---- */
  function injectCss() {
    if (document.getElementById('vt-css')) return;
    var st = document.createElement('style');
    st.id = 'vt-css';
    st.textContent =
      '.ytp-ad-module,.ytp-ad-overlay-container,.ytp-ad-image-overlay,.ytp-ad-player-overlay,.ytp-ad-text-overlay,.ytp-ad-survey,.ytp-ad-progress,.ytp-ad-skip-button-container{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}' +
      '.ad-showing .video-ads,.ad-showing .ytp-ad-module{display:none!important}' +
      'ytd-display-ad-renderer,ytd-promoted-sparkles-web-renderer,ytd-ad-slot-renderer,ytm-promoted-sparkles-web-renderer{display:none!important}';
    (document.head || document.documentElement).appendChild(st);
  }
  injectCss();

  /* ---- splash ViniTube ---- */
  var splash = null;
  function showSplash() {
    if (!document.body || splash) return;
    splash = document.createElement('div');
    splash.id = 'vt-splash';
    splash.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0f0f0f;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Roboto,Arial,sans-serif;color:#fff;';
    splash.innerHTML =
      '<div style="display:flex;align-items:center;gap:18px">' +
      '<span style="display:inline-flex;align-items:center;justify-content:center;width:88px;height:62px;background:#ff0000;border-radius:16px;font-size:34px;line-height:1">&#9654;</span>' +
      '<span style="font-size:52px;font-weight:800;letter-spacing:-1px">Vini<span style="color:#ff5c5c">Tube</span></span>' +
      '</div>' +
      '<div style="margin-top:28px;width:54px;height:54px;border:6px solid #242424;border-top-color:#ff0000;border-radius:50%;animation:vtspin .9s linear infinite"></div>' +
      '<style>@keyframes vtspin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(splash);
    setTimeout(hideSplash, 3200);
  }
  function hideSplash() {
    if (!splash) return;
    splash.style.transition = 'opacity .4s ease';
    splash.style.opacity = '0';
    setTimeout(function () { if (splash && splash.parentNode) splash.parentNode.removeChild(splash); splash = null; }, 450);
  }

  /* ---- marca ---- */
  function replaceIn(el) {
    if (!el) return;
    try {
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      var n;
      while ((n = w.nextNode())) {
        if (/YouTube/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/YouTube/g, BRAND);
      }
    } catch (e) {}
  }

  function brandLogo() {
    try {
      document.title = BRAND;
      var hdr = document.querySelector('header, [role="banner"], ytlr-tv-app-header, .header, #header');
      if (hdr) replaceIn(hdr);

      var logos = document.querySelectorAll('img[src*="logo" i], ytlr-logo img, #logo img, [aria-label="YouTube" i] img');
      for (var i = 0; i < logos.length; i++) {
        var img = logos[i];
        if (img.getAttribute('data-vt')) continue;
        img.setAttribute('data-vt', '1');
        var wrap = img.parentNode;
        if (!wrap) continue;
        img.style.display = 'none';
        var span = document.createElement('span');
        span.textContent = BRAND;
        span.style.cssText = 'font-family:Roboto,Arial,sans-serif;font-size:30px;font-weight:800;color:#fff;letter-spacing:-0.5px;display:inline-block;vertical-align:middle';
        span.appendChild(Object.assign(document.createElement('span'), { textContent: '' }));
        wrap.appendChild(span);
      }
    } catch (e) {}
  }

  /* ---- patrocinados ---- */
  function hideSponsored() {
    try {
      var nodes = document.querySelectorAll('ytlr-badge, .badge, span, div');
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.childElementCount > 0) continue;
        var t = (n.textContent || '').trim();
        if (!t || !SPONSOR_TXT.test(t)) continue;
        var card = n.closest('ytlr-tile, ytlr-grid-tile, [class*="tile" i], [class*="card" i], ytd-rich-item-renderer');
        if (!card) {
          var p = n;
          for (var k = 0; k < 5 && p; k++) { p = p.parentElement; if (p && p.querySelectorAll('img').length) { card = p; break; } }
        }
        if (card && card.style.display !== 'none') card.style.display = 'none';
      }
    } catch (e) {}
  }

  function cleanAds() {
    try {
      var nodes = document.querySelectorAll('.ytp-ad-module,.ytp-ad-overlay-container,.ytp-ad-image-overlay,.ytp-ad-player-overlay,.ytp-ad-text-overlay');
      for (var i = 0; i < nodes.length; i++) if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
      var p = document.querySelector('.html5-video-player');
      if (p) {
        if (p.classList.contains('ad-showing')) p.classList.remove('ad-showing');
        if (p.classList.contains('ad-interrupting')) p.classList.remove('ad-interrupting');
      }
      var skip = document.querySelector('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button');
      if (skip) skip.click();
    } catch (e) {}
  }

  /* ---- loop ---- */
  var busy = false;
  function tick() {
    if (busy) return;
    busy = true;
    try {
      hideSponsored();
      cleanAds();
      brandLogo();
    } catch (e) {}
    busy = false;
  }

  function start() {
    injectCss();
    showSplash();
    document.title = BRAND;
    brandLogo();
    try {
      new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
    setInterval(tick, 1800);
    tick();
    setTimeout(hideSplash, 6000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  /* botao voltar do controle: usa historico em vez de sair do app */
  try {
    document.addEventListener('keydown', function (e) {
      var kc = e.keyCode || e.which;
      if (kc === 10009 && window.history && window.history.length > 1) { try { window.history.back(); } catch (er) {} }
    }, true);
  } catch (e) {}
})();
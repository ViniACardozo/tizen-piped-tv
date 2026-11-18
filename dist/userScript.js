/* ViniTube Player - patch injetado no YouTube TV (TizenBrew mods).
   Bloqueia anuncio, esconde patrocinados e troca a marca para ViniTube. */
(function () {
  'use strict';

  if (window.__vinitube) return;
  window.__vinitube = true;

  var BRAND = 'ViniTube';
  var AD_FIELDS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakParams', 'adParams', 'adBreakHeartbeatParams', 'playerAdParams'];
  var AD_URL = [/\/pagead\//i, /\/api\/stats\/ads/i, /\/api\/stats\/atr/i, /doubleclick\.net/i, /googleadservices/i, /\/ptracking/i, /\/adunit/i, /\/get_midroll_/i];
  var SPONSOR = /patrocinado|sponsored|promoted|an[uú]ncio publicit/i;

  function isAd(u) {
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

  var parse0 = JSON.parse;
  try {
    JSON.parse = function () {
      var r = parse0.apply(this, arguments);
      try { scrub(r, 0); } catch (e) {}
      return r;
    };
  } catch (e) {}

  ['ytInitialPlayerResponse', 'ytInitialData'].forEach(function (n) {
    var store;
    try {
      var d = Object.getOwnPropertyDescriptor(window, n);
      if (d && d.get) return;
      Object.defineProperty(window, n, { configurable: true, get: function () { return store; }, set: function (v) { try { scrub(v, 0); } catch (e) {} store = v; } });
    } catch (e) {}
  });

  var f0 = window.fetch;
  if (f0) {
    window.fetch = function (inp) {
      var u = typeof inp === 'string' ? inp : (inp && inp.url) || '';
      if (isAd(u)) return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return f0.apply(this, arguments).then(function (r) {
        try {
          if ((r.headers.get('content-type') || '').indexOf('json') >= 0) {
            return r.clone().text().then(function (t) {
              var j;
              try { j = parse0(t); } catch (e) { return r; }
              scrub(j, 0);
              return new Response(JSON.stringify(j), { status: r.status, statusText: r.statusText, headers: r.headers });
            }).catch(function () { return r; });
          }
        } catch (e) {}
        return r;
      });
    };
  }

  var o0 = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { this.__ad = isAd(u); return o0.apply(this, arguments); };
  var s0 = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () { if (this.__ad) { try { this.abort(); } catch (e) {} return; } return s0.apply(this, arguments); };

  function css() {
    if (document.getElementById('vt-css')) return;
    var st = document.createElement('style');
    st.id = 'vt-css';
    st.textContent =
      '.ytp-ad-module,.ytp-ad-overlay-container,.ytp-ad-image-overlay,.ytp-ad-player-overlay,.ytp-ad-text-overlay,.ytp-ad-survey,.ytp-ad-progress,.ytp-ad-skip-button-container{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}' +
      '.ad-showing .video-ads,.ad-showing .ytp-ad-module{display:none!important}' +
      'ytd-display-ad-renderer,ytd-promoted-sparkles-web-renderer,ytd-ad-slot-renderer,ytm-promoted-sparkles-web-renderer{display:none!important}';
    (document.head || document.documentElement).appendChild(st);
  }
  css();

  /* ---------- splash ---------- */
  var splash = null;
  function logoMarkup(size) {
    var pad = Math.round(size * 0.16);
    return '<span style="display:inline-flex;align-items:center;justify-content:center;width:' + size + 'px;height:' + Math.round(size * 0.7) + 'px;background:#ff0000;border-radius:' + pad + 'px;color:#fff;font-size:' + Math.round(size * 0.38) + 'px;line-height:1;margin-right:' + Math.round(size * 0.2) + 'px">&#9654;</span>' +
      '<span style="font-weight:800;letter-spacing:-0.6px;color:#fff;font-size:' + size + 'px">Vini<span style="color:#ff5c5c">Tube</span></span>';
  }

  function showSplash() {
    if (!document.body || splash) return;
    splash = document.createElement('div');
    splash.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;background:#0f0f0f;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Roboto,Arial,sans-serif';
    splash.innerHTML = '<div style="display:flex;align-items:center;font-size:54px">' + logoMarkup(54) + '</div>' +
      '<div style="margin-top:30px;width:52px;height:52px;border:6px solid #242424;border-top-color:#ff0000;border-radius:50%;animation:vtspin .9s linear infinite"></div>' +
      '<style>@keyframes vtspin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(splash);
    setTimeout(hideSplash, 3000);
  }
  function hideSplash() {
    if (!splash) return;
    splash.style.transition = 'opacity .4s ease';
    splash.style.opacity = '0';
    setTimeout(function () { if (splash && splash.parentNode) splash.parentNode.removeChild(splash); splash = null; }, 450);
  }

  /* ---------- marca ---------- */
  function textSwap(root) {
    if (!root) return;
    try {
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      var n;
      while ((n = w.nextNode())) {
        if (n.nodeValue && n.nodeValue.indexOf('YouTube') >= 0) n.nodeValue = n.nodeValue.split('YouTube').join(BRAND);
      }
    } catch (e) {}
  }

  function brand() {
    try {
      if (document.title !== BRAND) document.title = BRAND;

      var head = document.querySelector('header, [role="banner"], ytlr-tv-app-header, .header, #header, #masthead-container');
      if (head) {
        if (!head.getAttribute('data-vt')) {
          head.setAttribute('data-vt', '1');
          var marks = head.querySelectorAll('img, svg, yt-icon, .logo, [class*="logo" i]');
          for (var i = 0; i < marks.length; i++) {
            var m = marks[i];
            var box = m.getBoundingClientRect();
            if (box.width > 10 && box.width < 420 && box.left < window.innerWidth * 0.45) {
              if (m.tagName === 'IMG' || m.tagName === 'svg' || m.tagName === 'YT-ICON') {
                var holder = document.createElement('span');
                holder.style.cssText = 'display:inline-flex;align-items:center;font-size:26px;vertical-align:middle';
                holder.innerHTML = logoMarkup(26);
                m.parentNode.insertBefore(holder, m);
                m.style.display = 'none';
                break;
              }
            }
          }
        }
        textSwap(head);
      }

      var links = document.querySelectorAll('a[aria-label*="YouTube" i], [aria-label="YouTube"]');
      for (var j = 0; j < links.length; j++) {
        links[j].setAttribute('aria-label', BRAND);
        if (!links[j].getAttribute('data-vt')) {
          links[j].setAttribute('data-vt', '1');
        }
      }
    } catch (e) {}
  }

  /* ---------- patrocinados ---------- */
  function hideSponsored() {
    try {
      var all = document.querySelectorAll('span, div, p, ytlr-badge, [class*="badge" i], [class*="label" i]');
      for (var i = 0; i < all.length; i++) {
        var n = all[i];
        if (n.childElementCount > 0) continue;
        var t = (n.textContent || '').trim();
        if (!t || t.length > 40 || !SPONSOR.test(t)) continue;
        var card = n.closest('ytlr-tile, ytlr-grid-tile, [class*="tile" i], [class*="card" i], [class*="item" i]');
        if (!card) {
          var p = n;
          for (var k = 0; k < 6 && p; k++) {
            p = p.parentElement;
            if (p && p.querySelector && p.querySelector('img')) { card = p; break; }
          }
        }
        if (card && card.style.display !== 'none') {
          card.style.display = 'none';
          card.setAttribute('data-vt-hidden', '1');
        }
      }
    } catch (e) {}
  }

  function playerAds() {
    try {
      var a = document.querySelectorAll('.ytp-ad-module,.ytp-ad-overlay-container,.ytp-ad-image-overlay,.ytp-ad-player-overlay,.ytp-ad-text-overlay');
      for (var i = 0; i < a.length; i++) if (a[i].parentNode) a[i].parentNode.removeChild(a[i]);
      var p = document.querySelector('.html5-video-player');
      if (p) {
        if (p.classList.contains('ad-showing')) p.classList.remove('ad-showing');
        if (p.classList.contains('ad-interrupting')) p.classList.remove('ad-interrupting');
      }
      var sk = document.querySelector('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button');
      if (sk) sk.click();
    } catch (e) {}
  }

  var busy = false;
  function tick() {
    if (busy) return;
    busy = true;
    try { playerAds(); hideSponsored(); brand(); } catch (e) {}
    busy = false;
  }

  function start() {
    css();
    showSplash();
    brand();
    try { new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    setInterval(tick, 1200);
    tick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  try {
    document.addEventListener('keydown', function (e) {
      if ((e.keyCode || e.which) === 10009 && window.history && window.history.length > 1) {
        try { window.history.back(); } catch (er) {}
      }
    }, true);
  } catch (e) {}
})();
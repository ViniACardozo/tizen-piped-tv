/* ViniTube - patch para o YouTube TV (TizenBrew mods / injecao CDP).
   Bloqueia anuncio, esconde patrocinados e troca a marca para ViniTube. */
(function () {
  'use strict';

  var VER = '2.5.4';
  if (window.__vtVer === VER) return;
  window.__vtVer = VER;
  window.__vinitube = true;

  var BRAND = 'ViniTube';
  var AD_FIELDS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakParams', 'adParams', 'adBreakHeartbeatParams', 'playerAdParams'];
  var AD_URL = [/\/pagead\//i, /\/api\/stats\/ads/i, /\/api\/stats\/atr/i, /doubleclick\.net/i, /googleadservices/i, /\/ptracking/i, /\/adunit/i, /\/get_midroll_/i];
  var SPONSOR = /patrocinado|sponsored|promovido|promoted|an[uú]ncio/i;

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

  var jsonParse = JSON.parse;
  try {
    JSON.parse = function () {
      var r = jsonParse.apply(this, arguments);
      try { scrub(r, 0); } catch (e) {}
      return r;
    };
  } catch (e) {}

  ['ytInitialPlayerResponse', 'ytInitialData'].forEach(function (n) {
    var store;
    try {
      var d = Object.getOwnPropertyDescriptor(window, n);
      if (d && d.get) return;
      Object.defineProperty(window, n, {
        configurable: true,
        get: function () { return store; },
        set: function (v) { try { scrub(v, 0); } catch (e) {} store = v; }
      });
    } catch (e) {}
  });

  var fetch0 = window.fetch;
  if (fetch0) {
    window.fetch = function (inp) {
      var u = typeof inp === 'string' ? inp : (inp && inp.url) || '';
      if (isAd(u)) return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return fetch0.apply(this, arguments);
    };
  }

  var xo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { this.__vtAd = isAd(u); return xo.apply(this, arguments); };
  var xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () { if (this.__vtAd) { try { this.abort(); } catch (e) {} return; } return xs.apply(this, arguments); };

  /* ---------- css ---------- */
  function css() {
    if (document.getElementById('vt-css')) return;
    var host = document.head || document.documentElement;
    if (!host) return;
    var st = document.createElement('style');
    st.id = 'vt-css';
    st.textContent =
      '.ytp-ad-module,.ytp-ad-overlay-container,.ytp-ad-image-overlay,.ytp-ad-player-overlay,.ytp-ad-text-overlay,.ytp-ad-survey,.ytp-ad-progress,.ytp-ad-skip-button-container{display:none!important;opacity:0!important;pointer-events:none!important}' +
      '.ad-showing .video-ads,.ad-showing .ytp-ad-module{display:none!important}';
    host.appendChild(st);
  }
  css();

  /* ---------- selo ---------- */
  function mark(size) {
    var box = document.createElement('span');
    box.style.cssText = 'display:inline-flex;align-items:center';
    var tri = document.createElement('span');
    tri.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:' + size + 'px;height:' + Math.round(size * 0.7) + 'px;background:#ff0000;border-radius:' + Math.round(size * 0.17) + 'px;color:#fff;font-size:' + Math.round(size * 0.4) + 'px;line-height:1;margin-right:' + Math.round(size * 0.22) + 'px';
    tri.textContent = '\u25B6';
    var word = document.createElement('span');
    word.style.cssText = 'font:800 ' + size + 'px Roboto,Arial,sans-serif;letter-spacing:-0.6px;color:#fff;white-space:nowrap';
    word.textContent = 'Vini';
    var tail = document.createElement('span');
    tail.style.color = '#ff5c5c';
    tail.textContent = 'Tube';
    word.appendChild(tail);
    box.appendChild(tri);
    box.appendChild(word);
    return box;
  }

  var splash = null;
  function splashShow() {
    if (!document.body || splash) return;
    splash = document.createElement('div');
    splash.setAttribute('data-vt', '1');
    splash.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;background:#0f0f0f;display:flex;flex-direction:column;align-items:center;justify-content:center';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center';
    var brandBox = mark(52);
    row.appendChild(brandBox);
    splash.appendChild(row);
    var spin = document.createElement('div');
    spin.style.cssText = 'margin-top:28px;width:52px;height:52px;border:6px solid #242424;border-top-color:#ff0000;border-radius:50%;animation:vtspin .9s linear infinite';
    splash.appendChild(spin);
    var kf = document.createElement('style');
    kf.id = 'vt-kf';
    kf.textContent = '@keyframes vtspin{to{transform:rotate(360deg)}}';
    (document.head || document.documentElement).appendChild(kf);
    document.body.appendChild(splash);
    setTimeout(splashHide, 2800);
  }
  function splashHide() {
    if (!splash) return;
    splash.style.transition = 'opacity .4s ease';
    splash.style.opacity = '0';
    setTimeout(function () { if (splash && splash.parentNode) splash.parentNode.removeChild(splash); splash = null; }, 420);
  }

  /* ---------- marca ---------- */
  var cover = null;
  function brand() {
    try {
      if (document.title !== BRAND) document.title = BRAND;

      var le = document.querySelector('ytlr-logo-entity');
      if (!le) return;
      var r = le.getBoundingClientRect();
      if (r.width < 10) return;

      if (!cover) {
        cover = document.createElement('div');
        cover.setAttribute('data-vt', '1');
        cover.style.cssText = 'position:fixed;display:flex;align-items:center;background:#0f0f0f;z-index:2147482000;pointer-events:none';
        document.body.appendChild(cover);
      }
      var h = Math.round(r.height) || 40;
      var size = Math.max(18, Math.min(30, Math.round(h * 0.42)));
      cover.style.left = Math.round(r.left) + 'px';
      cover.style.top = Math.round(r.top) + 'px';
      cover.style.height = h + 'px';
      cover.style.minWidth = Math.round(r.width) + 'px';
      var sig = size + '/' + Math.round(r.width);
      if (cover.getAttribute('data-sig') !== sig) {
        cover.setAttribute('data-sig', sig);
        while (cover.firstChild) cover.removeChild(cover.firstChild);
        cover.appendChild(mark(size));
      }

      var lbl = document.querySelectorAll('[aria-label*="YouTube" i]');
      for (var i = 0; i < lbl.length; i++) lbl[i].setAttribute('aria-label', BRAND);
    } catch (e) {}
  }

  /* ---------- patrocinados ---------- */
  function sponsored() {
    try {
      var vw = window.innerWidth || 1920;
      var vh = window.innerHeight || 1080;
      var nodes = document.querySelectorAll('span, div, p, yt-formatted-string');
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.childElementCount > 0) continue;
        var t = (n.textContent || '').trim();
        if (!t || t.length > 45) continue;
        if (!SPONSOR.test(t)) continue;
        var p = n, hit = null;
        for (var k = 0; k < 14 && p; k++) {
          p = p.parentElement;
          if (!p || p === document.body || p === document.documentElement) break;
          var r = p.getBoundingClientRect();
          if (r.width < vw * 0.16 || r.height < vh * 0.1) continue;
          if (p.querySelectorAll('img, video').length > 3) break;
          hit = p;
          break;
        }
        var done = hit;
        if (!done) {
          var q = n.parentElement;
          for (var j = 0; j < 3 && q && q !== document.body; j++) q = q.parentElement;
          if (q && q !== document.body) done = q;
        }
        if (done && done.style.display !== 'none') {
          done.style.display = 'none';
          done.setAttribute('data-vt-hidden', '1');
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
    try { css(); playerAds(); sponsored(); brand(); } catch (e) {}
    busy = false;
  }

  function start() {
    css();
    splashShow();
    brand();
    try { new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    setInterval(tick, 1000);
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
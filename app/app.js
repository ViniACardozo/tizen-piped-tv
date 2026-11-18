/* Piped TV v1.4.0 - modulo TizenBrew. YouTube TV: menu lateral, inscricoes locais, biblioteca. */
(function () {
  'use strict';

  var APP = '#app';
  var CACHE = 'pipedtv_cache';
  var HIST = 'pipedtv_hist';

  var DEFAULTS = {
    instances: [
      'pipedapi.ducks.party',
      'pipedapi.wireway.ch',
      'api.piped.private.coffee',
      'pipedapi.adminforge.de',
      'pipedapi.kavin.rocks',
      'piped.video'
    ],
    instance: 0,
    region: 'BR',
    codecPref: 'avc1',
    maxHeight: 1080,
    useProxies: true,
    subs: []
  };

  function proxyList() {
    return [
      { name: 'direto', build: function (u) { return u; } },
      { name: 'allorigins', build: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },
      { name: 'codetabs', build: function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); } }
    ];
  }

  var AVC_ITAGS = { 5: 240, 18: 360, 34: 360, 35: 480, 59: 480, 82: 360, 83: 480, 84: 720, 85: 1080, 22: 720, 37: 1080 };
  var ITAG_H = {
    5: 240, 18: 360, 34: 360, 35: 480, 59: 480, 82: 360, 83: 480, 84: 720, 85: 1080, 22: 720, 37: 1080, 38: 3072,
    133: 240, 134: 360, 135: 480, 136: 720, 137: 1080, 138: 2160, 264: 1440, 265: 2160, 266: 2160, 298: 720, 299: 1080,
    243: 360, 244: 480, 247: 720, 248: 1080, 271: 1440, 272: 2160, 278: 144, 302: 720, 303: 1080, 308: 1440, 313: 2160,
    394: 144, 395: 240, 396: 360, 397: 480, 398: 720, 399: 1080, 400: 1440, 401: 2160
  };

  var state = loadState();
  var view = null;
  var list = [];
  var listIndex = -1;
  var cands = [];
  var candIndex = 0;
  var hlsObj = null;
  var curVideo = null;
  var curQuery = '';
  var retryId = null;
  var focusables = [];
  var focusedEl = null;
  var osdTimer = null;
  var token = 0;
  var videoEl = null;
  var status = { mode: 'ok', text: 'iniciando', via: '' };
  var offline = false;

  /* ---------- util ---------- */

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return (r || document).querySelectorAll(s); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function views(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' bi de visualizacoes';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' mi de visualizacoes';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + ' mil visualizacoes';
    return n + ' visualizacoes';
  }

  function isLive(d) { return Number(d) < 0 || Number(d) === 0; }

  function dur(d) {
    d = Number(d) || 0;
    if (d <= 0) return 'AO VIVO';
    var h = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60), s = Math.floor(d % 60);
    if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function vidId(u) {
    if (!u) return null;
    var m = String(u).match(/[?&]v=([\w-]{6,})/);
    if (m) return m[1];
    m = String(u).match(/(?:youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
    return m ? m[1] : null;
  }

  function chanId(u) {
    if (!u) return null;
    var m = String(u).match(/\/channel\/([\w-]+)/);
    return m ? m[1] : null;
  }

  function loadState() {
    var s;
    try { s = JSON.parse(localStorage.getItem('pipedtv') || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    for (var k in DEFAULTS) if (!(k in s)) s[k] = DEFAULTS[k];
    return s;
  }
  function saveState() { try { localStorage.setItem('pipedtv', JSON.stringify(state)); } catch (e) {} }
  function cGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function cSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function hostOf(i) { return String(state.instances[i] || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''); }
  function curHost() { return hostOf(state.instance); }

  function osd(t, ms) {
    var o = $('#osd');
    if (!o) return;
    o.textContent = t;
    o.className = 'show';
    if (osdTimer) clearTimeout(osdTimer);
    osdTimer = setTimeout(function () { o.className = ''; }, ms || 1600);
  }

  function setView(v) { view = v; }

  /* ---------- icons (SVG inline) ---------- */

  var I = {
    home: '<svg viewBox="0 0 24 24"><path d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3z"/></svg>',
    trend: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8v5h-2V9.8l-6 6-4-4-6 6z"/></svg>',
    subs: '<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4zm2 4h12v2H6zm2 4h8v2H8zm4 4h0"/><path d="M3 20h18v2H3z"/></svg>',
    lib: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 100 18 9 9 0 000-18zm1 9.4V7h-2v6l4.5 2.7 1-1.7z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><path d="M10.5 3a7.5 7.5 0 105.9 12.1l4.3 4.3 1.4-1.4-4.3-4.3A7.5 7.5 0 0010.5 3zm0 2a5.5 5.5 0 110 11 5.5 5.5 0 010-11z"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm9 4c0-.5 0-1-.1-1.5l2-1.5-2-3.4-2.3 1a8 8 0 00-2.6-1.5L15.6 3h-3.2l-.4 2.1A8 8 0 009.4 6.6L7 5.6 5 9l2 1.5a8.6 8.6 0 000 3L5 15l2 3.4 2.4-1a8 8 0 002.6 1.5l.4 2.1h3.2l.4-2.1a8 8 0 002.6-1.5l2.3 1 2-3.4-2-1.5c.1-.5.1-1 .1-1.5z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>'
  };

  /* ---------- network ---------- */

  function getJSON(url, to) {
    return new Promise(function (res, rej) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; rej(new Error('timeout')); } }, to || 7000);
      fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' }).then(function (r) {
        if (done) return;
        if (!r.ok) { done = true; clearTimeout(t); rej(new Error('HTTP ' + r.status)); return; }
        return r.text().then(function (x) {
          if (done) return;
          done = true; clearTimeout(t);
          try { res(JSON.parse(x)); } catch (e) { rej(new Error('json invalido')); }
        });
      }).catch(function (e) {
        if (done) return;
        done = true; clearTimeout(t);
        rej(new Error(e && e.message ? e.message : 'falha'));
      });
    });
  }

  function race(url) {
    var ps = state.useProxies ? proxyList() : [proxyList()[0]];
    return new Promise(function (res, rej) {
      var pend = ps.length, fin = false, errs = [];
      ps.forEach(function (p) {
        getJSON(p.build(url), 8000).then(function (j) {
          if (fin) return;
          fin = true;
          res({ data: j, via: p.name });
        }).catch(function (e) {
          errs.push(p.name + ':' + e.message);
          if (--pend <= 0 && !fin) { fin = true; var er = new Error('sem rota'); er.details = errs; rej(er); }
        });
      });
    });
  }

  function api(path) {
    var order = [];
    for (var i = 0; i < state.instances.length; i++) order.push((state.instance + i) % state.instances.length);
    var errs = [];
    return new Promise(function (res, rej) {
      var k = 0;
      function step() {
        if (k >= order.length) {
          var e = new Error('sem resposta do Piped'); e.details = errs; rej(e); return;
        }
        var idx = order[k++], h = hostOf(idx);
        status.text = 'consultando ' + h; paintStatus();
        race('https://' + h + path).then(function (r) {
          if (r.data && r.data.error) { errs.push(h + ': ' + String(r.data.error).slice(0, 60)); return step(); }
          state.instance = idx; saveState();
          res({ data: r.data, host: h, via: r.via });
        }).catch(function (e) { errs.push(h + ': ' + e.message); step(); });
      }
      step();
    });
  }

  /* ---------- shell ---------- */

  function nav(active) {
    function item(key, label, icon, action) {
      return '<button class="navitem focusable' + (active === key ? ' on' : '') + '" data-action="' + action + '">' +
        '<span class="nico">' + icon + '</span><span class="nlabel">' + label + '</span></button>';
    }
    return '<aside class="rail">' +
      '<div class="rlogo"><span class="tri">&#9654;</span><span class="wm">Piped<em>TV</em></span></div>' +
      item('home', 'Inicio', I.home, 'home') +
      item('trend', 'Em alta', I.trend, 'trend') +
      item('subs', 'Inscricoes', I.subs, 'subs') +
      item('lib', 'Biblioteca', I.lib, 'lib') +
      item('search', 'Buscar', I.search, 'search') +
      item('settings', 'Ajustes', I.gear, 'settings') +
      '</aside>';
  }

  function shell(inner, active) {
    return '<div class="wrap">' + nav(active) +
      '<div class="main"><header class="hdr">' +
      '<span class="htitle">' + esc(status.text) + '</span>' +
      (status.via ? '<span class="hvia">' + esc(status.via) + '</span>' : '') +
      '<span class="hchip">' + esc(curHost()) + '</span>' +
      '</header>' + inner + '</div></div>';
  }

  function paintStatus() {
    var t = $('.htitle');
    if (t) t.textContent = status.text;
    var v = $('.hvia');
    if (v) v.textContent = status.via || '';
  }

  /* ---------- views ---------- */

  function center(kind, title, detail, actions) {
    var act = '';
    for (var i = 0; i < actions.length; i++) act += '<button class="cbtn focusable" data-action="' + actions[i].action + '">' + esc(actions[i].label) + '</button>';
    status.text = title; status.via = '';
    $(APP).innerHTML = shell(
      '<main class="center">' +
      (kind === 'load' ? '<div class="loader"></div>' : '<div class="bang">' + (kind === 'err' ? '!' : '?') + '</div>') +
      '<h2>' + esc(title) + '</h2>' +
      (detail ? '<p class="muted">' + esc(detail) + '</p>' : '') +
      '<div class="acts">' + act + '</div></main>', null
    );
    refreshFocus();
  }

  function card(it, i) {
    var id = vidId(it.url || it.id);
    var th = it.thumbnail || '';
    if (th.indexOf('//') === 0) th = 'https:' + th;
    var live = isLive(it.duration);
    var meta = [];
    if (it.uploaderName) meta.push(esc(it.uploaderName));
    if (it.views != null) meta.push(views(it.views));
    return '<figure class="vcard focusable" data-action="play" data-id="' + esc(id) + '" data-idx="' + i + '">' +
      '<div class="vthumb">' + (th ? '<img loading="lazy" src="' + esc(th) + '">' : '') +
      '<span class="vtime' + (live ? ' live' : '') + '">' + dur(it.duration) + '</span></div>' +
      '<figcaption><div class="vtitle">' + esc(it.title || 'Sem titulo') + '</div>' +
      '<div class="vmeta">' + meta.join(' &middot; ') + '</div></figcaption></figure>';
  }

  function grid(items) { return '<section class="row">' + items.map(card).join('') + '</section>'; }

  function renderHome() {
    var res = cGet('pipedtv_resume');
    var h = '<main class="feed">';
    if (offline) h += '<div class="warn">Sem rede: conteudo salvo.</div>';
    h += '<h3 class="rowhead">Em alta' + (state.region ? ' &middot; ' + state.region : '') + '</h3>';
    h += list.length ? grid(list) : '<p class="muted">Sem itens. Aperte azul para diagnostico.</p>';
    if (res && res.length) h += '<h3 class="rowhead">Continuar assistindo</h3>' + grid(res);
    h += '</main>';
    status.text = list.length + ' itens'; status.via = state.useProxies ? 'proxy on' : 'direto';
    $(APP).innerHTML = shell(h, 'home');
    refreshFocus();
  }

  function renderSubs() {
    var subs = state.subs || [];
    status.text = subs.length + ' inscricoes'; status.via = 'local';
    if (!subs.length) {
      $(APP).innerHTML = shell(
        '<main class="feed"><h3 class="rowhead">Inscricoes</h3>' +
        '<p class="muted">Nenhum canal inscrito. Abra um video e use <b>Inscrever-se</b>. As inscricoes ficam salvas na TV (sem conta Google).</p></main>', 'subs'
      );
      refreshFocus();
      return;
    }
    $(APP).innerHTML = shell('<main class="feed"><h3 class="rowhead">Inscricoes &middot; carregando...</h3></main>', 'subs');
    refreshFocus();
    var groups = [];
    var i = 0;
    function next() {
      if (i >= subs.length) {
        var h = '<main class="feed">';
        groups.forEach(function (g) {
          if (!g.items.length) return;
          h += '<h3 class="rowhead">' + esc(g.name) + '</h3>' + grid(g.items);
        });
        h += '</main>';
        $(APP).innerHTML = shell(h, 'subs');
        refreshFocus();
        return;
      }
      var s = subs[i++];
      api('/channel/' + encodeURIComponent(s.id)).then(function (r) {
        var items = (r.data && r.data.relatedStreams) || [];
        items = items.filter(function (x) { return x.type === 'stream' || vidId(x.url); }).slice(0, 8);
        groups.push({ name: s.name, items: items });
        next();
      }).catch(function () { next(); });
    }
    next();
  }

  function renderLib() {
    var hist = cGet(HIST) || [];
    status.text = hist.length + ' no historico'; status.via = 'local';
    $(APP).innerHTML = shell(
      '<main class="feed"><h3 class="rowhead">Biblioteca</h3>' +
      (hist.length ? grid(hist) : '<p class="muted">Nada assistido ainda.</p>') + '</main>', 'lib'
    );
    refreshFocus();
  }

  function renderSearch() {
    status.text = 'busca'; status.via = '';
    $(APP).innerHTML = shell(
      '<main class="feed"><div class="searchrow">' +
      '<input id="q" class="sinput focusable" type="text" placeholder="Buscar" value="' + esc(curQuery) + '">' +
      '<button class="cbtn focusable" data-action="do-search">Buscar</button></div>' +
      (list.length ? grid(list) : '<p class="muted">Digite e aperte Buscar.</p>') + '</main>', 'search'
    );
    refreshFocus();
    var b = $('[data-action="do-search"]');
    if (b) focusEl(b);
  }

  function renderSettings() {
    var inst = '', i;
    for (i = 0; i < state.instances.length; i++) inst += '<button class="chip focusable' + (i === state.instance ? ' on' : '') + '" data-action="pick-instance" data-idx="' + i + '">' + esc(state.instances[i]) + '</button>';
    var regs = ['BR', 'US', 'PT', 'GB', 'MX', 'AR'], reg = '';
    for (i = 0; i < regs.length; i++) reg += '<button class="chip focusable' + (state.region === regs[i] ? ' on' : '') + '" data-action="set-region" data-v="' + regs[i] + '">' + regs[i] + '</button>';
    var hs = [480, 720, 1080], hb = '';
    for (i = 0; i < hs.length; i++) hb += '<button class="chip focusable' + (Number(state.maxHeight) === hs[i] ? ' on' : '') + '" data-action="set-max" data-v="' + hs[i] + '">' + hs[i] + 'p</button>';
    var subs = '', j;
    for (j = 0; j < (state.subs || []).length; j++) subs += '<button class="chip focusable" data-action="unsub" data-idx="' + j + '">' + esc(state.subs[j].name) + ' x</button>';
    status.text = 'ajustes'; status.via = '';
    $(APP).innerHTML = shell(
      '<main class="feed settings">' +
      '<div class="grp"><span class="glabel">Instancia</span><div class="chips">' + inst + '</div></div>' +
      '<div class="grp"><span class="glabel">Proxy CORS</span><div class="chips">' +
      '<button class="chip focusable' + (state.useProxies ? ' on' : '') + '" data-action="set-proxy" data-v="1">ligado</button>' +
      '<button class="chip focusable' + (!state.useProxies ? ' on' : '') + '" data-action="set-proxy" data-v="0">desligado</button></div></div>' +
      '<div class="grp"><span class="glabel">Regiao</span><div class="chips">' + reg + '</div></div>' +
      '<div class="grp"><span class="glabel">Qualidade maxima</span><div class="chips">' + hb + '</div></div>' +
      '<div class="grp"><span class="glabel">Inscricoes</span><div class="chips">' + (subs || '<span class="muted">nenhuma</span>') + '</div></div>' +
      '<div class="grp"><button class="cbtn focusable" data-action="home">Voltar</button></div>' +
      '</main>', 'settings'
    );
    refreshFocus();
  }

  /* ---------- player ---------- */

  function height(s) {
    if (s.height > 0) return s.height;
    if (s.itag && ITAG_H[s.itag]) return ITAG_H[s.itag];
    var q = String(s.quality || '').match(/(\d{3,4})p/);
    return q ? Number(q[1]) : 0;
  }

  function isAvc(s) {
    if (s.videoOnly) return false;
    if (s.codec && /avc1|h\.264|mp4v/i.test(s.codec)) return true;
    if (s.itag && AVC_ITAGS[s.itag]) return true;
    if (s.mimeType && /video\/mp4/i.test(s.mimeType) && !/vp0?9|av01|av1/i.test(String(s.codec || ''))) return true;
    return false;
  }

  function buildCandidates(d) {
    var vids = d.videoStreams || [];
    var comb = vids.filter(function (s) { return !s.videoOnly && /video\//i.test(s.mimeType || ''); });
    var hls = d.hls ? [{ url: d.hls, label: 'auto', kind: 'hls' }] : [];
    var maxH = Number(state.maxHeight) || 1080;
    var out = [];
    var pool = state.codecPref === 'avc1' ? comb.filter(isAvc) : comb;
    if (!pool.length) pool = comb;
    pool.slice().sort(function (a, b) { return height(b) - height(a); }).forEach(function (s) {
      var h = height(s);
      if (h && h > maxH) return;
      out.push({ url: s.url, label: (h || '?') + 'p' + (isAvc(s) ? ' h264' : ''), kind: 'direct' });
    });
    if (!out.length) out = hls;
    else if (hls.length) out.push(hls[0]);
    return out;
  }

  function subscribed(chanUrl) {
    var cid = chanId(chanUrl);
    if (!cid) return false;
    for (var i = 0; i < (state.subs || []).length; i++) if (state.subs[i].id === cid) return true;
    return false;
  }

  function renderPlayer() {
    var c = cands[candIndex];
    var sub = subscribed(curVideo && curVideo.uploaderUrl);
    status.text = curVideo && curVideo.uploaderName || 'video'; status.via = c ? c.label : '';
    $(APP).innerHTML = shell(
      '<main class="pwrap"><video id="pv" playsinline autoplay controls></video>' +
      '<div class="pinfo"><div class="pcol">' +
      '<div class="ptitle">' + esc(curVideo && curVideo.title || '') + '</div>' +
      '<div class="pchan">' + esc(curVideo && curVideo.uploaderName || '') + '</div></div>' +
      '<div class="ppills">' +
      '<button class="cbtn focusable" data-action="toggle-sub">' + (sub ? 'Inscrito' : 'Inscrever-se') + '</button>' +
      '<button class="cbtn focusable" data-action="cycle-quality">Qualidade</button>' +
      '<button class="cbtn focusable" data-action="instance-next">Instancia</button>' +
      '<button class="cbtn focusable" data-action="back">Voltar</button>' +
      '</div></div></main>', null
    );
    videoEl = $('#pv');
    videoEl.addEventListener('error', function () { osd('Falha no video. Azul troca instancia.', 2200); });
    videoEl.addEventListener('playing', function () { saveHistory(); });
    refreshFocus();
    retryId = null;
    attach(c);
  }

  function destroyHls() { if (hlsObj) { try { hlsObj.destroy(); } catch (e) {} hlsObj = null; } }

  function attach(c) {
    if (!videoEl || !c) return;
    destroyHls();
    if (c.kind === 'hls' && window.Hls && window.Hls.isSupported()) {
      hlsObj = new window.Hls({ maxBufferLength: 30 });
      hlsObj.loadSource(c.url);
      hlsObj.attachMedia(videoEl);
      hlsObj.on(window.Hls.Events.ERROR, function (e, d) { if (d && d.fatal) osd('Erro HLS', 1600); });
      return;
    }
    videoEl.src = c.url;
    var p = videoEl.play();
    if (p && p.catch) p.catch(function () {});
  }

  function saveHistory() {
    if (!curVideo) return;
    var id = vidId(curVideo.url);
    if (!id) return;
    var h = cGet(HIST) || [];
    h = h.filter(function (x) { return vidId(x.url) !== id; });
    h.unshift({ url: curVideo.url, title: curVideo.title, thumbnail: curVideo.thumbnail, uploaderName: curVideo.uploaderName, duration: curVideo.duration, views: curVideo.views });
    h = h.slice(0, 20);
    cSet(HIST, h);
  }

  /* ---------- data ---------- */

  function loadHome() {
    var t = ++token;
    offline = false;
    setView('home');
    center('load', 'Carregando', curHost(), []);
    api('/trending?region=' + encodeURIComponent(state.region)).then(function (r) {
      if (t !== token) return;
      list = r.data || [];
      cSet(CACHE, list);
      status.via = r.via === 'direto' ? 'direto' : r.via;
      setView('home');
      renderHome();
    }).catch(function () {
      if (t !== token) return;
      var c = cGet(CACHE);
      if (c && c.length) { list = c; offline = true; setView('home'); renderHome(); osd('Sem rede: conteudo salvo.', 2200); return; }
      setView('error');
      center('err', 'Sem resposta do Piped', 'Aperte azul para ver o erro de cada rota.', [
        { label: 'Diagnostico', action: 'diag' }, { label: 'Ajustes', action: 'settings' }
      ]);
    });
  }

  function doSearch(q) {
    q = String(q || '').trim();
    if (!q) { osd('Digite algo.', 1200); return; }
    curQuery = q;
    var t = ++token;
    setView('search');
    center('load', 'Buscando', q, []);
    api('/search?q=' + encodeURIComponent(q) + '&filter=videos').then(function (r) {
      if (t !== token) return;
      list = (r.data && r.data.items) || [];
      setView('search');
      renderSearch();
    }).catch(function () {
      if (t !== token) return;
      setView('error');
      center('err', 'Busca falhou', 'Aperte azul.', [{ label: 'Diagnostico', action: 'diag' }, { label: 'Voltar', action: 'home' }]);
    });
  }

  function openVideo(it) {
    var id = vidId(it.url || it.id);
    if (!id) { osd('Video invalido.', 1200); return; }
    curVideo = it;
    retryId = id;
    cands = [];
    candIndex = 0;
    var t = ++token;
    setView('player');
    center('load', 'Abrindo', it.title || '', []);
    api('/streams/' + id).then(function (r) {
      if (t !== token) return;
      var cs = buildCandidates(r.data);
      if (!cs.length) throw new Error('nenhum stream compativel');
      curVideo = {
        title: r.data.title || it.title,
        url: it.url, thumbnail: it.thumbnail,
        uploaderName: it.uploaderName || r.data.uploader,
        uploaderUrl: it.uploaderUrl,
        duration: it.duration, views: it.views
      };
      cands = cs;
      candIndex = 0;
      setView('player');
      renderPlayer();
    }).catch(function (e) {
      if (t !== token) return;
      setView('error');
      center('err', 'Nao abriu', e.message || '', [
        { label: 'Trocar instancia', action: 'instance-next' }, { label: 'Voltar', action: 'back' }
      ]);
    });
  }

  function diagnose() {
    var steps = [{ host: 'internet (jsdelivr)', url: 'https://cdn.jsdelivr.net/gh/ViniACardozo/tizen-piped-tv@v1.4.0/package.json' }];
    for (var i = 0; i < state.instances.length; i++) steps.push({ host: hostOf(i), url: 'https://' + hostOf(i) + '/trending?region=BR' });
    var rows = steps.map(function (s) { return { host: s.host, ok: false, status: 'aguardando' }; });
    function paint() {
      var html = '';
      rows.forEach(function (r) { html += '<div class="drow"><span>' + esc(r.host) + '</span><b class="' + (r.ok ? 'ok' : 'no') + '">' + esc(r.status) + '</b></div>'; });
      $(APP).innerHTML = shell('<main class="feed settings">' + html +
        '<div class="grp"><button class="cbtn focusable" data-action="diagnose">Testar de novo</button>' +
        '<button class="cbtn focusable" data-action="home">Voltar</button></div></main>', null);
      refreshFocus();
    }
    status.text = 'diagnostico'; status.via = '';
    setView('diag');
    paint();
    function run(p) {
      if (p >= steps.length) return;
      rows[p].status = 'testando';
      paint();
      race(steps[p].url).then(function (r) {
        rows[p].ok = true; rows[p].status = 'OK/' + r.via; paint();
        setTimeout(function () { run(p + 1); }, 100);
      }).catch(function (e) {
        rows[p].ok = false; rows[p].status = e.message.slice(0, 40); paint();
        setTimeout(function () { run(p + 1); }, 100);
      });
    }
    run(0);
  }

  /* ---------- focus ---------- */

  function refreshFocus() {
    focusables = Array.prototype.slice.call($$('.focusable', $(APP)));
    focusedEl = null;
    if (focusables.length) focusEl(focusables[0]);
  }

  function focusEl(el) {
    if (!el || el === focusedEl) return;
    if (focusedEl) focusedEl.classList.remove('focused');
    focusedEl = el;
    focusedEl.classList.add('focused');
    try {
      focusedEl.focus();
      if (focusedEl.scrollIntoView) focusedEl.scrollIntoView({ block: 'nearest' });
    } catch (e) {}
  }

  function move(dir) {
    if (!focusedEl) { refreshFocus(); return; }
    var c = focusedEl.getBoundingClientRect();
    var cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    var best = null, bs = Infinity;
    for (var i = 0; i < focusables.length; i++) {
      var el = focusables[i];
      if (el === focusedEl) continue;
      var r = el.getBoundingClientRect();
      var dx = (r.left + r.width / 2) - cx, dy = (r.top + r.height / 2) - cy;
      if (dir === 'left' && dx >= -2) continue;
      if (dir === 'right' && dx <= 2) continue;
      if (dir === 'up' && dy >= -2) continue;
      if (dir === 'down' && dy <= 2) continue;
      var sc = Math.abs(dx) + Math.abs(dy);
      if (dir === 'left' || dir === 'right') sc += Math.abs(dy) * 3; else sc += Math.abs(dx) * 2;
      if (sc < bs) { bs = sc; best = el; }
    }
    if (best) focusEl(best);
  }

  /* ---------- actions ---------- */

  function toggleSub() {
    if (!curVideo) return;
    var cid = chanId(curVideo.uploaderUrl);
    var name = curVideo.uploaderName || 'Canal';
    if (!cid) { osd('Canal sem ID.', 1400); return; }
    var subs = state.subs || [];
    var found = -1;
    for (var i = 0; i < subs.length; i++) if (subs[i].id === cid) found = i;
    if (found >= 0) { subs.splice(found, 1); osd('Inscricao removida', 1400); }
    else { subs.push({ id: cid, name: name }); osd('Inscrito em ' + name, 1600); }
    state.subs = subs;
    saveState();
    renderPlayer();
  }

  function retryVideo() {
    var id = retryId || (curVideo && vidId(curVideo.url));
    if (!id) { loadHome(); return; }
    openVideo({ url: '/watch?v=' + id, title: curVideo && curVideo.title });
  }

  function handle(a, d) {
    switch (a) {
      case 'play':
        if (d && d.idx != null) listIndex = Number(d.idx);
        openVideo(list[listIndex] || { url: '/watch?v=' + (d && d.id) });
        break;
      case 'do-search': var q = $('#q'); doSearch(q ? q.value : curQuery); break;
      case 'search': setView('search'); renderSearch(); break;
      case 'settings': setView('settings'); renderSettings(); break;
      case 'subs': setView('subs'); renderSubs(); break;
      case 'lib': setView('lib'); renderLib(); break;
      case 'trend': setView('home'); loadHome(); break;
      case 'diag': diagnose(); break;
      case 'diagnose': diagnose(); break;
      case 'home': list = []; setView('home'); loadHome(); break;
      case 'back': destroyHls(); list = []; setView('home'); loadHome(); break;
      case 'toggle-sub': toggleSub(); break;
      case 'instance-next':
        state.instance = (state.instance + 1) % state.instances.length; saveState();
        if (retryId) retryVideo(); else if (view === 'search') doSearch(curQuery); else loadHome();
        break;
      case 'cycle-quality': cycleQuality(); break;
      case 'pick-instance': state.instance = Number(d.idx); saveState(); renderSettings(); break;
      case 'set-region': state.region = d.v; saveState(); renderSettings(); loadHome(); break;
      case 'set-max': state.maxHeight = Number(d.v); saveState(); renderSettings(); break;
      case 'set-proxy': state.useProxies = d.v === '1'; saveState(); renderSettings(); break;
      case 'unsub': state.subs.splice(Number(d.idx), 1); saveState(); renderSettings(); break;
    }
  }

  function cycleQuality() {
    if (cands.length < 2) { osd('Uma opcao.', 1000); return; }
    candIndex = (candIndex + 1) % cands.length;
    renderPlayer();
    osd(cands[candIndex].label, 1100);
  }

  var K = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
    PLAY: 415, PAUSE: 19, PP: 10252, STOP: 413, RW: 412, FF: 417, NEXT: 423, PREV: 425
  };

  function onKey(e) {
    var kc = e.keyCode || e.which;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (kc === K.LEFT) { move('left'); e.preventDefault(); return; }
    if (kc === K.RIGHT) { move('right'); e.preventDefault(); return; }
    if (kc === K.UP) { move('up'); e.preventDefault(); return; }
    if (kc === K.DOWN) { move('down'); e.preventDefault(); return; }
    if (kc === K.ENTER) {
      if (tag === 'INPUT') return;
      if (focusedEl && focusedEl.getAttribute && focusedEl.getAttribute('data-action')) {
        handle(focusedEl.getAttribute('data-action'), focusedEl.dataset);
        e.preventDefault();
      }
      return;
    }
    if (kc === K.BACK || kc === K.ESC) { e.preventDefault(); destroyHls(); list = []; setView('home'); loadHome(); return; }
    if (kc === K.RED) { e.preventDefault(); setView('settings'); renderSettings(); return; }
    if (kc === K.GREEN) { e.preventDefault(); setView('search'); renderSearch(); return; }
    if (kc === K.YELLOW) { e.preventDefault(); list = []; setView('home'); loadHome(); return; }
    if (kc === K.BLUE) { e.preventDefault(); diagnose(); return; }
    if (!videoEl) return;
    if (kc === K.PLAY || kc === K.PP) { e.preventDefault(); if (videoEl.paused) videoEl.play(); else videoEl.pause(); return; }
    if (kc === K.PAUSE) { e.preventDefault(); videoEl.pause(); return; }
    if (kc === K.STOP) { e.preventDefault(); videoEl.pause(); videoEl.currentTime = 0; return; }
    if (kc === K.RW) { e.preventDefault(); videoEl.currentTime = Math.max(0, videoEl.currentTime - 10); return; }
    if (kc === K.FF) { e.preventDefault(); videoEl.currentTime += 10; return; }
    if (kc === K.NEXT || kc === K.PREV) {
      e.preventDefault();
      if (!list.length || listIndex < 0) return;
      listIndex += (kc === K.NEXT ? 1 : -1);
      if (listIndex < 0) listIndex = 0;
      if (listIndex >= list.length) listIndex = list.length - 1;
      openVideo(list[listIndex]);
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== document) {
      if (t.getAttribute && t.getAttribute('data-action')) { handle(t.getAttribute('data-action'), t.dataset); return; }
      t = t.parentNode;
    }
  });
  document.addEventListener('keydown', onKey, true);

  function boot() { setView('home'); loadHome(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  if (typeof window !== 'undefined') {
    window.__pipedtv = {
      buildCandidates: buildCandidates,
      streamHeight: height,
      withState: function (o) { for (var k in o) state[k] = o[k]; saveState(); }
    };
  }
})();
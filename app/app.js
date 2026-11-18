/* Piped TV v1.3.0 - modulo TizenBrew. UI estilo YouTube TV (leanback) + proxies em corrida. */
(function () {
  'use strict';

  var APP = '#app';
  var CACHE_KEY = 'pipedtv_cache';
  var CACHE_PLAY = 'pipedtv_resume';

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
    useProxies: true
  };

  /* proxies CORS: corrida em paralelo, o primeiro que responder vence */
  function proxyList() {
    return [
      { name: 'direto', build: function (u) { return u; } },
      { name: 'allorigins', build: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },
      { name: 'codetabs', build: function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); } },
      { name: 'corsproxy', build: function (u) { return 'https://corsproxy.io/?' + encodeURIComponent(u); } }
    ];
  }

  var AVC_COMBINED_ITAGS = { 5: 240, 18: 360, 34: 360, 35: 480, 59: 480, 82: 360, 83: 480, 84: 720, 85: 1080, 22: 720, 37: 1080 };
  var ITAG_HEIGHT = {
    5: 240, 18: 360, 34: 360, 35: 480, 59: 480, 82: 360, 83: 480, 84: 720, 85: 1080, 22: 720, 37: 1080, 38: 3072,
    133: 240, 134: 360, 135: 480, 136: 720, 137: 1080, 138: 2160, 264: 1440, 265: 2160, 266: 2160, 298: 720, 299: 1080,
    243: 360, 244: 480, 247: 720, 248: 1080, 271: 1440, 272: 2160, 278: 144, 302: 720, 303: 1080, 308: 1440, 313: 2160,
    394: 144, 395: 240, 396: 360, 397: 480, 398: 720, 399: 1080, 400: 1440, 401: 2160
  };

  var state = loadState();
  var view = null;
  var list = [];
  var listIndex = -1;
  var playerCandidates = [];
  var playerIndex = 0;
  var hlsObj = null;
  var currentVideo = null;
  var currentQuery = '';
  var retryTarget = null;
  var focusables = [];
  var focusedEl = null;
  var osdTimer = null;
  var loadingToken = 0;
  var videoEl = null;
  var lastDiag = [];
  var status = { mode: 'idle', text: 'iniciando', via: '' };
  var offlineMode = false;

  /* ---------- helpers ---------- */

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return (r || document).querySelectorAll(s); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtViews(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' bi de visualizacoes';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' mi de visualizacoes';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + ' mil visualizacoes';
    return n + ' visualizacoes';
  }

  function fmtDur(s) {
    s = Number(s) || 0;
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function videoIdOf(u) {
    if (!u) return null;
    var m = String(u).match(/[?&]v=([\w-]{6,})/);
    if (m) return m[1];
    m = String(u).match(/(?:youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
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

  function cacheGet(k) { try { return JSON.parse(localStorage.getItem(k || CACHE_KEY) || 'null'); } catch (e) { return null; } }
  function cacheSet(v, k) { try { localStorage.setItem(k || CACHE_KEY, JSON.stringify(v)); } catch (e) {} }

  function hostOf(i) { return String(state.instances[i] || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''); }
  function host() { return hostOf(state.instance); }

  function showOSD(t, ms) {
    var o = $('#osd');
    if (!o) return;
    o.textContent = t;
    o.className = 'show';
    if (osdTimer) clearTimeout(osdTimer);
    osdTimer = setTimeout(function () { o.className = ''; }, ms || 1800);
  }

  function setView(v) { view = v; }

  /* ---------- network ---------- */

  function getJSON(url, timeout) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, timeout || 7000);
      fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' }).then(function (r) {
        if (done) return;
        if (!r.ok) { done = true; clearTimeout(t); reject(new Error('HTTP ' + r.status)); return; }
        return r.text().then(function (x) {
          if (done) return;
          done = true; clearTimeout(t);
          try { resolve(JSON.parse(x)); } catch (e) { reject(new Error('json invalido')); }
        });
      }).catch(function (e) {
        if (done) return;
        done = true; clearTimeout(t);
        reject(new Error(e && e.message ? e.message : 'falha'));
      });
    });
  }

  /* corre todos os proxies ao mesmo tempo; primeiro sucesso vence */
  function raceGet(url) {
    var list = state.useProxies ? proxyList() : [proxyList()[0]];
    return new Promise(function (resolve, reject) {
      var pending = list.length;
      var finished = false;
      var errors = [];
      if (!pending) { reject(new Error('sem rota')); return; }
      list.forEach(function (p) {
        getJSON(p.build(url), 8000).then(function (j) {
          if (finished) return;
          finished = true;
          resolve({ data: j, via: p.name });
        }).catch(function (e) {
          errors.push(p.name + ':' + e.message);
          if (--pending <= 0 && !finished) {
            finished = true;
            var err = new Error(errors.join(' | '));
            err.details = errors;
            reject(err);
          }
        });
      });
    });
  }

  function apiAny(path) {
    var order = [];
    for (var i = 0; i < state.instances.length; i++) order.push((state.instance + i) % state.instances.length);
    var errors = [];
    return new Promise(function (resolve, reject) {
      var idx = 0;
      function step() {
        if (idx >= order.length) {
          var e = new Error('sem resposta do Piped');
          e.details = errors;
          reject(e);
          return;
        }
        var ii = order[idx++], h = hostOf(ii);
        status.text = 'consultando ' + h;
        paintStatus();
        raceGet('https://' + h + path).then(function (res) {
          var j = res.data;
          if (j && j.error) { errors.push(h + ': ' + String(j.error).slice(0, 70)); return step(); }
          state.instance = ii;
          saveState();
          resolve({ data: j, host: h, via: res.via });
        }).catch(function (err) {
          errors.push(h + ': ' + err.message);
          step();
        });
      }
      step();
    });
  }

  /* ---------- shell ---------- */

  function tabs(active) {
    function t(label, action, key) {
      return '<button class="tab focusable' + (active === key ? ' active' : '') + '" data-action="' + action + '">' + label + '</button>';
    }
    return '<div class="tabs">' + t('Inicio', 'home', 'home') + t('Buscar', 'search', 'search') + t('Ajustes', 'settings', 'settings') + '</div>';
  }

  function shell(inner, active) {
    return '<header class="hdr">' +
      '<div class="logo"><span class="tri">&#9654;</span><span class="wm">Piped<em>TV</em></span></div>' +
      tabs(active || 'home') +
      '<div class="hstatus' + (status.mode === 'err' ? ' err' : '') + '">' +
      '<span class="dot"></span>' + esc(status.text) +
      (status.via ? '<span class="via">' + esc(status.via) + '</span>' : '') +
      '</div></header>' + inner;
  }

  function paintStatus() {
    var s = $('.hstatus');
    if (!s) return;
    s.className = 'hstatus' + (status.mode === 'err' ? ' err' : '');
    s.innerHTML = '<span class="dot"></span>' + esc(status.text) + (status.via ? '<span class="via">' + esc(status.via) + '</span>' : '');
  }

  /* ---------- views ---------- */

  function renderStatus(kind, title, detail, actions) {
    var act = '';
    for (var i = 0; i < actions.length; i++) {
      act += '<button class="cbtn focusable" data-action="' + actions[i].action + '">' + esc(actions[i].label) + '</button>';
    }
    status.mode = kind === 'err' ? 'err' : 'ok';
    status.text = title;
    status.via = '';
    $(APP).innerHTML = shell(
      '<main class="center">' +
      (kind === 'load' ? '<div class="loader"></div>' : '<div class="bang">' + esc(kind === 'err' ? '!' : '?') + '</div>') +
      '<h2>' + esc(title) + '</h2>' +
      (detail ? '<p class="muted">' + esc(detail) + '</p>' : '') +
      '<div class="acts">' + act + '</div>' +
      '</main>'
    );
    refreshFocus();
  }

  function cardHtml(it, i) {
    var id = videoIdOf(it.url || it.id);
    var th = it.thumbnail || '';
    if (th.indexOf('//') === 0) th = 'https:' + th;
    var meta = [];
    if (it.uploaderName) meta.push(esc(it.uploaderName));
    if (it.views != null) meta.push(fmtViews(it.views).replace(' de visualizacoes', ' views'));
    return '<figure class="vcard focusable" data-action="play" data-id="' + esc(id) + '" data-idx="' + i + '">' +
      '<div class="vthumb">' + (th ? '<img loading="lazy" src="' + esc(th) + '">' : '') +
      (it.duration ? '<span class="vtime">' + fmtDur(it.duration) + '</span>' : '') + '</div>' +
      '<figcaption><div class="vtitle">' + esc(it.title || 'Sem titulo') + '</div>' +
      '<div class="vmeta">' + meta.join(' &middot; ') + '</div></figcaption></figure>';
  }

  function renderHome() {
    var resume = cacheGet(CACHE_PLAY);
    var html = '<main class="feed">';
    if (offlineMode) html += '<div class="warn">Sem rede agora: mostrando o ultimo conteudo salvo.</div>';
    if (list.length) {
      html += '<h3 class="rowhead">Em alta' + (state.region ? ' &middot; ' + state.region : '') + '</h3>' +
        '<section class="row">' + list.map(cardHtml).join('') + '</section>';
    } else {
      html += '<div class="empty"><p>Sem itens. Abra o Diagnostico (azul) para testar a rede.</p></div>';
    }
    if (resume && resume.items && resume.items.length) {
      html += '<h3 class="rowhead">Continuar assistindo</h3><section class="row">' + resume.items.map(cardHtml).join('') + '</section>';
    }
    html += '</main>';
    status.mode = 'ok';
    status.text = list.length ? list.length + ' itens' : 'vazio';
    $(APP).innerHTML = shell(html, 'home');
    refreshFocus();
  }

  function renderSearch() {
    status.mode = 'ok'; status.text = 'busca'; status.via = '';
    $(APP).innerHTML = shell(
      '<main class="feed">' +
      '<div class="searchrow"><input id="q" class="sinput focusable" type="text" placeholder="Buscar" value="' + esc(currentQuery) + '">' +
      '<button class="cbtn focusable" data-action="do-search">Buscar</button></div>' +
      (list.length ? '<section class="row">' + list.map(cardHtml).join('') + '</section>' : '<p class="muted">Digite e aperte Buscar.</p>') +
      '</main>', 'search'
    );
    refreshFocus();
    var b = $('[data-action="do-search"]');
    if (b) focusEl(b);
  }

  function renderSettings() {
    var inst = '';
    for (var i = 0; i < state.instances.length; i++) {
      inst += '<button class="chip focusable' + (i === state.instance ? ' on' : '') + '" data-action="pick-instance" data-idx="' + i + '">' + esc(state.instances[i]) + '</button>';
    }
    var regs = ['BR', 'US', 'PT', 'GB', 'MX', 'AR'], reg = '';
    for (var r = 0; r < regs.length; r++) {
      reg += '<button class="chip focusable' + (state.region === regs[r] ? ' on' : '') + '" data-action="set-region" data-v="' + regs[r] + '">' + regs[r] + '</button>';
    }
    var hs = [480, 720, 1080], hb = '';
    for (var h = 0; h < hs.length; h++) {
      hb += '<button class="chip focusable' + (Number(state.maxHeight) === hs[h] ? ' on' : '') + '" data-action="set-max" data-v="' + hs[h] + '">' + hs[h] + 'p</button>';
    }
    status.mode = 'ok'; status.text = 'ajustes'; status.via = '';
    $(APP).innerHTML = shell(
      '<main class="feed settings">' +
      '<div class="grp"><span class="glabel">Instancia</span><div class="chips">' + inst + '</div></div>' +
      '<div class="grp"><span class="glabel">Proxy CORS</span><div class="chips">' +
      '<button class="chip focusable' + (state.useProxies ? ' on' : '') + '" data-action="set-proxy" data-v="1">ligado</button>' +
      '<button class="chip focusable' + (!state.useProxies ? ' on' : '') + '" data-action="set-proxy" data-v="0">desligado</button></div></div>' +
      '<div class="grp"><span class="glabel">Regiao</span><div class="chips">' + reg + '</div></div>' +
      '<div class="grp"><span class="glabel">Qualidade maxima</span><div class="chips">' + hb + '</div></div>' +
      '<div class="grp"><button class="cbtn focusable" data-action="home">Voltar</button></div>' +
      '</main>', 'settings'
    );
    refreshFocus();
  }

  function renderDiag() {
    var rows = '';
    for (var i = 0; i < lastDiag.length; i++) {
      rows += '<div class="drow"><span>' + esc(lastDiag[i].host) + '</span><b class="' + (lastDiag[i].ok ? 'ok' : 'no') + '">' + esc(lastDiag[i].status) + '</b></div>';
    }
    status.mode = 'ok'; status.text = 'diagnostico'; status.via = '';
    $(APP).innerHTML = shell(
      '<main class="feed settings">' +
      (rows || '<p class="muted">Aperte Testar.</p>') +
      '<div class="grp"><button class="cbtn focusable" data-action="diagnose">Testar agora</button>' +
      '<button class="cbtn focusable" data-action="home">Voltar</button></div>' +
      '</main>', ''
    );
    refreshFocus();
  }

  /* ---------- player ---------- */

  function streamHeight(s) {
    if (s.height > 0) return s.height;
    if (s.itag && ITAG_HEIGHT[s.itag]) return ITAG_HEIGHT[s.itag];
    var q = String(s.quality || '').match(/(\d{3,4})p/);
    return q ? Number(q[1]) : 0;
  }

  function isAvc(s) {
    if (s.videoOnly) return false;
    if (s.codec && /avc1|h\.264|mp4v/i.test(s.codec)) return true;
    if (s.itag && AVC_COMBINED_ITAGS[s.itag]) return true;
    if (s.mimeType && /video\/mp4/i.test(s.mimeType) && !/vp0?9|av01|av1/i.test(String(s.codec || ''))) return true;
    return false;
  }

  function buildCandidates(d) {
    var vids = d.videoStreams || [];
    var comb = vids.filter(function (s) { return !s.videoOnly && /video\//i.test(s.mimeType || ''); });
    var hls = d.hls ? [{ url: d.hls, label: 'auto (HLS)', kind: 'hls' }] : [];
    var maxH = Number(state.maxHeight) || 1080;
    var out = [];
    var pool = state.codecPref === 'avc1' ? comb.filter(isAvc) : comb;
    if (!pool.length) pool = comb;
    pool.slice().sort(function (a, b) { return streamHeight(b) - streamHeight(a); }).forEach(function (s) {
      var h = streamHeight(s);
      if (h && h > maxH) return;
      out.push({ url: s.url, label: (h || '?') + 'p' + (isAvc(s) ? ' h264' : ''), kind: 'direct' });
    });
    if (!out.length) out = hls;
    if (hls.length && out !== hls) out.push(hls[0]);
    return out;
  }

  function renderPlayer() {
    var cur = playerCandidates[playerIndex];
    status.mode = 'ok'; status.text = 'reproduzindo'; status.via = cur ? cur.label : '';
    $(APP).innerHTML = shell(
      '<main class="pwrap"><video id="pv" playsinline autoplay controls></video>' +
      '<div class="pinfo"><div class="ptitle">' + esc(currentVideo && currentVideo.title || '') + '</div>' +
      '<div class="ppills">' +
      '<button class="cbtn focusable" data-action="cycle-quality">Qualidade</button>' +
      '<button class="cbtn focusable" data-action="instance-next">Instancia</button>' +
      '<button class="cbtn focusable" data-action="home">Voltar</button>' +
      '</div></div></main>', ''
    );
    videoEl = $('#pv');
    videoEl.addEventListener('error', function () { showOSD('Falha no video. Azul troca instancia.', 2400); });
    videoEl.addEventListener('playing', function () { showOSD('', 100); });
    refreshFocus();
    retryTarget = null;
    attach(cur);
  }

  function destroyHls() { if (hlsObj) { try { hlsObj.destroy(); } catch (e) {} hlsObj = null; } }

  function attach(c) {
    if (!videoEl || !c) return;
    destroyHls();
    if (c.kind === 'hls' && window.Hls && window.Hls.isSupported()) {
      hlsObj = new window.Hls({ maxBufferLength: 30 });
      hlsObj.loadSource(c.url);
      hlsObj.attachMedia(videoEl);
      hlsObj.on(window.Hls.Events.ERROR, function (e, dd) { if (dd && dd.fatal) showOSD('Erro HLS', 1800); });
      return;
    }
    videoEl.src = c.url;
    var p = videoEl.play();
    if (p && p.catch) p.catch(function () {});
  }

  /* ---------- data ---------- */

  function loadHome() {
    var tok = ++loadingToken;
    offlineMode = false;
    setView('home');
    renderStatus('load', 'Carregando', host(), []);
    apiAny('/trending?region=' + encodeURIComponent(state.region)).then(function (res) {
      if (tok !== loadingToken) return;
      list = res.data || [];
      cacheSet(list);
      offlineMode = false;
      status.via = res.via;
      setView('home');
      renderHome();
    }).catch(function (e) {
      if (tok !== loadingToken) return;
      var c = cacheGet();
      if (c && c.length) {
        list = c;
        offlineMode = true;
        setView('home');
        renderHome();
        showOSD('Sem rede: conteudo salvo.', 2600);
        return;
      }
      setView('error');
      renderStatus('err', 'Sem resposta do Piped', 'Instancias e proxies falharam. Aperte azul para ver o erro de cada rota.', [
        { label: 'Diagnostico', action: 'diag' }, { label: 'Ajustes', action: 'settings' }
      ]);
    });
  }

  function doSearch(q) {
    q = String(q || '').trim();
    if (!q) { showOSD('Digite algo.', 1400); return; }
    currentQuery = q;
    var tok = ++loadingToken;
    setView('search');
    renderStatus('load', 'Buscando', q, []);
    apiAny('/search?q=' + encodeURIComponent(q) + '&filter=videos').then(function (res) {
      if (tok !== loadingToken) return;
      list = (res.data && res.data.items) || [];
      status.via = res.via;
      setView('search');
      renderSearch();
    }).catch(function (e) {
      if (tok !== loadingToken) return;
      setView('error');
      renderStatus('err', 'Busca falhou', 'Aperte azul para diagnosticar.', [
        { label: 'Diagnostico', action: 'diag' }, { label: 'Voltar', action: 'home' }
      ]);
    });
  }

  function openVideo(it) {
    var id = videoIdOf(it.url || it.id);
    if (!id) { showOSD('Video invalido.', 1500); return; }
    currentVideo = it;
    retryTarget = id;
    playerCandidates = [];
    playerIndex = 0;
    var tok = ++loadingToken;
    setView('player');
    renderStatus('load', 'Abrindo video', esc(it.title || ''), []);
    apiAny('/streams/' + id).then(function (res) {
      if (tok !== loadingToken) return;
      var cands = buildCandidates(res.data);
      if (!cands.length) throw new Error('nenhum stream compativel');
      currentVideo = { title: res.data.title || it.title, url: it.url };
      playerCandidates = cands;
      playerIndex = 0;
      setView('player');
      renderPlayer();
    }).catch(function (e) {
      if (tok !== loadingToken) return;
      setView('error');
      renderStatus('err', 'Nao abriu', e.message || '', [
        { label: 'Trocar instancia', action: 'instance-next' }, { label: 'Voltar', action: 'home' }
      ]);
    });
  }

  function diagnose() {
    setView('diag');
    var steps = [{ host: 'internet (jsdelivr)', url: 'https://cdn.jsdelivr.net/gh/ViniACardozo/tizen-piped-tv@v1.3.0/package.json' }];
    for (var i = 0; i < state.instances.length; i++) steps.push({ host: hostOf(i), url: 'https://' + hostOf(i) + '/trending?region=BR' });
    lastDiag = steps.map(function (s) { return { host: s.host, ok: false, status: 'aguardando' }; });
    renderDiag();
    function step(p) {
      if (p >= steps.length) { renderDiag(); return; }
      lastDiag[p].status = 'testando';
      renderDiag();
      raceGet(steps[p].url).then(function (r) {
        lastDiag[p] = { host: steps[p].host, ok: true, status: 'OK/' + r.via };
        renderDiag();
        setTimeout(function () { step(p + 1); }, 120);
      }).catch(function (e) {
        lastDiag[p] = { host: steps[p].host, ok: false, status: e.message.slice(0, 42) };
        renderDiag();
        setTimeout(function () { step(p + 1); }, 120);
      });
    }
    step(0);
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

  function moveFocus(dir) {
    if (!focusedEl) { refreshFocus(); return; }
    var c = focusedEl.getBoundingClientRect();
    var cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    var best = null, bestScore = Infinity;
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
      if (sc < bestScore) { bestScore = sc; best = el; }
    }
    if (best) focusEl(best);
  }

  /* ---------- actions ---------- */

  function cycleQuality() {
    if (playerCandidates.length < 2) { showOSD('Uma opcao.', 1200); return; }
    playerIndex = (playerIndex + 1) % playerCandidates.length;
    renderPlayer();
    showOSD(playerCandidates[playerIndex].label, 1200);
  }

  function retryVideo() {
    var id = retryTarget || (currentVideo && videoIdOf(currentVideo.url));
    if (!id) { loadHome(); return; }
    openVideo({ url: '/watch?v=' + id, title: currentVideo && currentVideo.title });
  }

  function handle(a, d) {
    switch (a) {
      case 'play': if (d && d.idx != null) listIndex = Number(d.idx); openVideo(list[listIndex] || { url: '/watch?v=' + (d && d.id) }); break;
      case 'do-search': var q = $('#q'); doSearch(q ? q.value : currentQuery); break;
      case 'search': setView('search'); renderSearch(); break;
      case 'settings': setView('settings'); renderSettings(); break;
      case 'diag': diagnose(); break;
      case 'diagnose': diagnose(); break;
      case 'home': list = []; setView('home'); loadHome(); break;
      case 'instance-next':
        state.instance = (state.instance + 1) % state.instances.length; saveState();
        if (retryTarget) retryVideo(); else if (view === 'search') doSearch(currentQuery); else loadHome();
        break;
      case 'cycle-quality': cycleQuality(); break;
      case 'pick-instance': state.instance = Number(d.idx); saveState(); renderSettings(); break;
      case 'set-region': state.region = d.v; saveState(); renderSettings(); loadHome(); break;
      case 'set-max': state.maxHeight = Number(d.v); saveState(); renderSettings(); break;
      case 'set-proxy': state.useProxies = d.v === '1'; saveState(); renderSettings(); break;
    }
  }

  var K = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
    PLAY: 415, PAUSE: 19, PP: 10252, STOP: 413, RW: 412, FF: 417, NEXT: 423, PREV: 425
  };

  function onKey(e) {
    var kc = e.keyCode || e.which;
    var tag = (document.activeElement && document.activeElement.tagName) || '';

    if (kc === K.LEFT) { moveFocus('left'); e.preventDefault(); return; }
    if (kc === K.RIGHT) { moveFocus('right'); e.preventDefault(); return; }
    if (kc === K.UP) { moveFocus('up'); e.preventDefault(); return; }
    if (kc === K.DOWN) { moveFocus('down'); e.preventDefault(); return; }

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
      streamHeight: streamHeight,
      withState: function (o) { for (var k in o) state[k] = o[k]; saveState(); }
    };
  }
})();
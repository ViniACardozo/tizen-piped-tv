/* Piped TV v1.1.0 - modulo TizenBrew. YouTube sem anuncio via Piped. */
(function () {
  'use strict';

  var APP = '#app';

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
    maxHeight: 720
  };

  var AVC_COMBINED_ITAGS = { 5: 240, 18: 360, 34: 360, 35: 480, 59: 480, 82: 360, 83: 480, 84: 720, 85: 1080, 22: 720, 37: 1080 };
  var ITAG_HEIGHT = {
    5: 240, 18: 360, 34: 360, 35: 480, 59: 480, 82: 360, 83: 480, 84: 720, 85: 1080, 22: 720, 37: 1080, 38: 3072,
    133: 240, 134: 360, 135: 480, 136: 720, 137: 1080, 138: 2160, 264: 1440, 265: 2160, 266: 2160, 298: 720, 299: 1080,
    243: 360, 244: 480, 247: 720, 248: 1080, 271: 1440, 272: 2160, 278: 144, 302: 720, 303: 1080, 308: 1440, 313: 2160,
    394: 144, 395: 240, 396: 360, 397: 480, 398: 720, 399: 1080, 400: 1440, 401: 2160
  };

  var BOTWALL_RE = /not a bot|LOGIN_REQUIRED|Sign in to confirm|video unavailable/i;

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
  var lastError = '';
  var lastDiag = [];

  /* ---------------- helpers ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return (root || document).querySelectorAll(sel); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtViews(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' Bi';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' Mi';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + ' mil';
    return String(n);
  }

  function fmtDur(s) {
    s = Number(s) || 0;
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = Math.floor(s % 60);
    if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function videoIdOf(url) {
    if (!url) return null;
    var m = String(url).match(/[?&]v=([\w-]{6,})/);
    if (m) return m[1];
    m = String(url).match(/(?:youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
    return m ? m[1] : null;
  }

  function loadState() {
    var s;
    try { s = JSON.parse(localStorage.getItem('pipedtv') || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    for (var k in DEFAULTS) { if (!(k in s)) s[k] = DEFAULTS[k]; }
    return s;
  }

  function saveState() {
    try { localStorage.setItem('pipedtv', JSON.stringify(state)); } catch (e) {}
  }

  function hostOf(i) {
    return String(state.instances[i] || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  function instanceHost() { return hostOf(state.instance); }

  function showOSD(text, ms) {
    var o = $('#osd');
    if (!o) return;
    o.textContent = text;
    o.classList.add('show');
    if (osdTimer) clearTimeout(osdTimer);
    osdTimer = setTimeout(function () { o.classList.remove('show'); }, ms || 1800);
  }

  function setView(v) { view = v; }

  /* ---------------- API ---------------- */

  function fetchJSON(host, path) {
    var url = 'https://' + host + path;
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('timeout'));
      }, 12000);

      fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (r) {
        if (done) return;
        if (!r.ok) {
          done = true; clearTimeout(timer);
          reject(new Error('HTTP ' + r.status));
          return;
        }
        return r.json().then(function (j) {
          if (done) return;
          done = true; clearTimeout(timer);
          if (j && j.error) {
            var e = new Error(BOTWALL_RE.test(j.error) ? 'botwall' : String(j.error).slice(0, 120));
            e.botwall = BOTWALL_RE.test(j.error);
            reject(e);
          } else {
            resolve(j);
          }
        });
      }).catch(function (e) {
        if (done) return;
        done = true; clearTimeout(timer);
        reject(new Error(e && e.message ? e.message : 'falha de rede'));
      });
    });
  }

  function apiAny(path) {
    var order = [];
    var i;
    for (i = 0; i < state.instances.length; i++) {
      order.push((state.instance + i) % state.instances.length);
    }
    var errors = [];
    return new Promise(function (resolve, reject) {
      var idx = 0;
      function next() {
        if (idx >= order.length) {
          var e = new Error('todas as instancias falharam');
          e.details = errors;
          reject(e);
          return;
        }
        var ii = order[idx++];
        var host = hostOf(ii);
        fetchJSON(host, path).then(function (data) {
          state.instance = ii;
          saveState();
          resolve({ data: data, host: host });
        }).catch(function (err) {
          errors.push(host + ': ' + (err.message || 'erro'));
          next();
        });
      }
      next();
    });
  }

  /* ---------------- shell ---------------- */

  function shell(inner) {
    var top = '<div class="topbar">' +
      '<div class="brand">Piped<span class="accent">TV</span></div>' +
      '<span class="badge">' + esc(instanceHost()) + '</span>' +
      '<span class="meta">' + esc(state.region) + '</span>' +
      '</div>';
    var hints = '<div class="hints">' +
      '<span class="hint"><b class="dot" style="background:#e74c3c"></b> ajustes</span>' +
      '<span class="hint"><b class="dot" style="background:#2ecc71"></b> buscar</span>' +
      '<span class="hint"><b class="dot" style="background:#f1c40f"></b> inicio</span>' +
      '<span class="hint"><b class="dot" style="background:#3498db"></b> diagnostico</span>' +
      '</div>';
    return top + inner + hints;
  }

  /* ---------------- views ---------------- */

  function renderStatus(icon, msg, detail, actions) {
    var act = '';
    for (var i = 0; i < actions.length; i++) {
      act += '<button class="btn focusable" data-action="' + actions[i].action + '">' + esc(actions[i].label) + '</button>';
    }
    $(APP).innerHTML = shell(
      '<div class="status">' +
      '<div class="icon">' + icon + '</div>' +
      '<div class="msg">' + esc(msg) + '</div>' +
      (detail ? '<div class="detail">' + esc(detail) + '</div>' : '') +
      '<div class="actions">' + act + '</div>' +
      '</div>'
    );
    refreshFocus();
  }

  function cardHtml(item, i) {
    var id = videoIdOf(item.url || item.id);
    var sub = [];
    if (item.uploaderName) sub.push(esc(item.uploaderName));
    if (item.views != null) sub.push(fmtViews(item.views) + ' views');
    var thumb = item.thumbnail || '';
    if (thumb && thumb.indexOf('//') === 0) thumb = 'https:' + thumb;
    return '<div class="card focusable" data-action="play" data-id="' + esc(id) + '" data-idx="' + i + '">' +
      '<div class="thumb">' + (thumb ? '<img loading="lazy" src="' + esc(thumb) + '">' : '') +
      (item.duration ? '<span class="dur">' + fmtDur(item.duration) + '</span>' : '') + '</div>' +
      '<div class="title">' + esc(item.title || 'Sem titulo') + '</div>' +
      '<div class="sub">' + sub.join(' | ') + '</div>' +
      '</div>';
  }

  function renderTrending() {
    $(APP).innerHTML = shell(
      '<div class="section">' +
      '<div class="rowlabel">Em alta' + (list.length ? ' (' + list.length + ')' : '') + '</div>' +
      '<div class="cards">' + list.map(cardHtml).join('') + '</div>' +
      '</div>'
    );
    refreshFocus();
  }

  function renderSearch() {
    $(APP).innerHTML = shell(
      '<div class="section">' +
      '<div class="rowlabel">Buscar</div>' +
      '<div class="searchbar">' +
      '<input class="searchinput focusable" id="searchq" type="text" placeholder="digite e aperte OK" value="' + esc(currentQuery) + '">' +
      '<button class="btn focusable" data-action="do-search">Buscar</button>' +
      '</div>' +
      (list.length ? '<div class="rowlabel">Resultados (' + list.length + ')</div><div class="cards">' + list.map(cardHtml).join('') + '</div>' : '<div class="detail">Sem resultados.</div>') +
      '</div>'
    );
    refreshFocus();
    var b = $('[data-action="do-search"]');
    if (b) focusEl(b);
  }

  function renderSettings() {
    var instBtns = '';
    for (var i = 0; i < state.instances.length; i++) {
      instBtns += '<button class="opt focusable' + (i === state.instance ? ' active' : '') + '" data-action="pick-instance" data-idx="' + i + '">' + esc(state.instances[i]) + '</button>';
    }
    var regions = ['BR', 'US', 'PT', 'GB', 'MX', 'AR'];
    var regBtns = '';
    for (var r = 0; r < regions.length; r++) {
      regBtns += '<button class="opt focusable' + (state.region === regions[r] ? ' active' : '') + '" data-action="set-region" data-v="' + regions[r] + '">' + regions[r] + '</button>';
    }
    var codecBtns = '<button class="opt focusable' + (state.codecPref === 'avc1' ? ' active' : '') + '" data-action="set-codec" data-v="avc1">avc1</button>' +
      '<button class="opt focusable' + (state.codecPref === 'any' ? ' active' : '') + '" data-action="set-codec" data-v="any">qualquer</button>';
    var hBtns = '';
    var hs = [480, 720, 1080];
    for (var h = 0; h < hs.length; h++) {
      hBtns += '<button class="opt focusable' + (Number(state.maxHeight) === hs[h] ? ' active' : '') + '" data-action="set-max" data-v="' + hs[h] + '">' + hs[h] + 'p</button>';
    }

    $(APP).innerHTML = shell(
      '<div class="settings">' +
      '<div class="field"><div class="flabel">Instancia</div><div class="opts">' + instBtns + '</div></div>' +
      '<div class="field"><div class="flabel">Regiao</div><div class="opts">' + regBtns + '</div></div>' +
      '<div class="field"><div class="flabel">Codec</div><div class="opts">' + codecBtns + '</div></div>' +
      '<div class="field"><div class="flabel">Qualidade maxima</div><div class="opts">' + hBtns + '</div></div>' +
      '<div class="field"><button class="btn focusable" data-action="diagnose">Testar rede</button>' +
      '<button class="btn focusable" data-action="home">Voltar</button></div>' +
      '</div>'
    );
    refreshFocus();
  }

  function renderDiag() {
    var rows = '';
    for (var i = 0; i < lastDiag.length; i++) {
      rows += '<div class="diagrow"><span class="diaghost">' + esc(lastDiag[i].host) + '</span>' +
        '<span class="' + (lastDiag[i].ok ? 'diagok' : 'diagfail') + '">' + esc(lastDiag[i].status) + '</span></div>';
    }
    $(APP).innerHTML = shell(
      '<div class="settings">' +
      '<div class="flabel">Diagnostico de rede</div>' +
      (rows || '<div class="detail">Pressione "Testar agora".</div>') +
      '<div class="field" style="margin-top:3vh">' +
      '<button class="btn focusable" data-action="diagnose">Testar agora</button>' +
      '<button class="btn focusable" data-action="home">Voltar</button></div>' +
      (lastError ? '<div class="detail">Ultimo erro: ' + esc(lastError) + '</div>' : '') +
      '</div>'
    );
    refreshFocus();
  }

  /* ---------------- player ---------------- */

  function streamHeight(s) {
    if (s.height > 0) return s.height;
    if (s.itag && ITAG_HEIGHT[s.itag]) return ITAG_HEIGHT[s.itag];
    var q = String(s.quality || '').match(/(\d{3,4})p/);
    return q ? Number(q[1]) : 0;
  }

  function isAvcCombined(s) {
    if (s.videoOnly) return false;
    if (s.codec && /avc1|h\.264|mp4v/i.test(s.codec)) return true;
    if (s.itag && AVC_COMBINED_ITAGS[s.itag]) return true;
    if (s.mimeType && /video\/mp4/i.test(s.mimeType) && !/vp0?9|av01|av1/i.test(String(s.codec || ''))) return true;
    return false;
  }

  function buildCandidates(data) {
    var out = [];
    var vids = data.videoStreams || [];
    var combined = vids.filter(function (s) { return !s.videoOnly && /video\//i.test(s.mimeType || ''); });
    var hls = data.hls ? [{ url: data.hls, label: 'HLS', kind: 'hls' }] : [];
    var maxH = Number(state.maxHeight) || 720;

    var pool = state.codecPref === 'avc1' ? combined.filter(isAvcCombined) : combined;
    if (!pool.length) pool = combined;

    pool.slice().sort(function (a, b) { return streamHeight(b) - streamHeight(a); }).forEach(function (s) {
      var h = streamHeight(s);
      if (h && h > maxH) return;
      out.push({ url: s.url, label: (h || '?') + 'p' + (isAvcCombined(s) ? ' avc1' : ''), kind: 'direct' });
    });

    if (!out.length) out = hls;
    return out;
  }

  function renderPlayer() {
    var cur = playerCandidates[playerIndex];
    $(APP).innerHTML = shell(
      '<div class="player-wrap">' +
      '<video id="pv" playsinline autoplay></video>' +
      '<div class="player-overlay">' +
      '<div class="ptitle">' + esc(currentVideo && currentVideo.title || '') + '</div>' +
      (cur ? '<span class="pmeta">' + esc(cur.label) + '</span>' : '') +
      '<button class="btn focusable" data-action="cycle-quality">Qualidade</button>' +
      '<button class="btn focusable" data-action="instance-next">Instancia</button>' +
      '<button class="btn focusable" data-action="home">Voltar</button>' +
      '</div></div>'
    );
    videoEl = $('#pv');
    videoEl.addEventListener('error', function () {
      showOSD('Falha no stream. Troque a instancia (azul).', 2600);
    });
    refreshFocus();
    retryTarget = null;
    attachStream(cur);
  }

  function destroyHls() {
    if (hlsObj) { try { hlsObj.destroy(); } catch (e) {} hlsObj = null; }
  }

  function attachStream(cand) {
    if (!videoEl || !cand) return;
    destroyHls();
    if (cand.kind === 'hls') {
      if (window.Hls && window.Hls.isSupported()) {
        hlsObj = new window.Hls({ maxBufferLength: 30 });
        hlsObj.loadSource(cand.url);
        hlsObj.attachMedia(videoEl);
        hlsObj.on(window.Hls.Events.ERROR, function (e, d) {
          if (d && d.fatal) showOSD('Erro HLS', 2000);
        });
      } else {
        videoEl.src = cand.url;
        videoEl.play();
      }
    } else {
      videoEl.src = cand.url;
      videoEl.play();
    }
  }

  /* ---------------- data ---------------- */

  function loadTrending() {
    var tok = ++loadingToken;
    setView('status');
    renderStatus('<div class="spin"></div>', 'Carregando...', instanceHost(), []);
    apiAny('/trending?region=' + encodeURIComponent(state.region)).then(function (res) {
      if (tok !== loadingToken) return;
      list = res.data || [];
      lastError = '';
      setView('trending');
      if (!list.length) {
        renderStatus('<div class="big">?</div>', 'A instancia respondeu sem itens.', res.host + ' - regiao ' + state.region, [
          { label: 'Diagnostico', action: 'diag' }, { label: 'Ajustes', action: 'settings' }
        ]);
      } else {
        renderTrending();
      }
    }).catch(function (e) {
      if (tok !== loadingToken) return;
      lastError = (e.message || 'erro') + ' :: ' + ((e.details || []).join(' | '));
      setView('status');
      renderStatus('<div class="big">!</div>', 'Nenhuma instancia respondeu.', 'Rede/CORS bloqueado ou instancias fora. Abra o diagnostico (azul).', [
        { label: 'Diagnostico', action: 'diag' }, { label: 'Ajustes', action: 'settings' }
      ]);
    });
  }

  function doSearch(q) {
    q = String(q || '').trim();
    if (!q) return;
    currentQuery = q;
    var tok = ++loadingToken;
    setView('status');
    renderStatus('<div class="spin"></div>', 'Buscando...', q, []);
    apiAny('/search?q=' + encodeURIComponent(q) + '&filter=videos').then(function (res) {
      if (tok !== loadingToken) return;
      list = (res.data && res.data.items) || [];
      setView('search');
      renderSearch();
    }).catch(function (e) {
      if (tok !== loadingToken) return;
      lastError = (e.message || 'erro') + ' :: ' + ((e.details || []).join(' | '));
      setView('status');
      renderStatus('<div class="big">!</div>', 'Busca falhou.', 'Veja o diagnostico (azul).', [
        { label: 'Diagnostico', action: 'diag' }, { label: 'Voltar', action: 'home' }
      ]);
    });
  }

  function openVideo(item) {
    var id = videoIdOf(item.url || item.id);
    if (!id) { showOSD('Video sem ID.', 1600); return; }
    currentVideo = item;
    playerCandidates = [];
    playerIndex = 0;
    retryTarget = id;
    var tok = ++loadingToken;
    setView('status');
    renderStatus('<div class="spin"></div>', 'Abrindo video...', esc(item.title || ''), []);
    apiAny('/streams/' + id).then(function (res) {
      if (tok !== loadingToken) return;
      var cands = buildCandidates(res.data);
      if (!cands.length) throw new Error('sem stream reproduzivel');
      currentVideo = { title: res.data.title || item.title, url: item.url };
      playerCandidates = cands;
      playerIndex = 0;
      setView('player');
      renderPlayer();
    }).catch(function (e) {
      if (tok !== loadingToken) return;
      lastError = e.message || 'erro';
      setView('status');
      renderStatus('<div class="big">!</div>', 'Nao abriu o video.', e.message || '', [
        { label: 'Trocar instancia', action: 'instance-next' }, { label: 'Voltar', action: 'home' }
      ]);
    });
  }

  function diagnose() {
    setView('diag');
    lastDiag = [];
    renderDiag();
    var i = 0;
    function step() {
      if (i >= state.instances.length) {
        renderDiag();
        return;
      }
      var host = hostOf(i);
      lastDiag.push({ host: host, ok: false, status: 'testando...' });
      renderDiag();
      var pos = i;
      fetchJSON(host, '/trending?region=BR').then(function (j) {
        lastDiag[pos] = { host: host, ok: true, status: 'OK (' + ((j || []).length) + ' itens)' };
        i++; setTimeout(step, 200);
      }).catch(function (e) {
        lastDiag[pos] = { host: host, ok: false, status: e.message || 'erro' };
        i++; setTimeout(step, 200);
      });
    }
    step();
  }

  /* ---------------- focus ---------------- */

  function refreshFocus() {
    focusables = Array.prototype.slice.call($$('.focusable', $(APP)));
    if (focusables.length) focusEl(focusables[0]); else focusedEl = null;
  }

  function focusEl(el) {
    if (!el || el === focusedEl) return;
    if (focusedEl) focusedEl.classList.remove('focused');
    focusedEl = el;
    focusedEl.classList.add('focused');
    try {
      focusedEl.focus();
      if (typeof focusedEl.scrollIntoView === 'function') focusedEl.scrollIntoView({ block: 'nearest' });
    } catch (e) {}
  }

  function moveFocus(dir) {
    if (!focusedEl) { refreshFocus(); return; }
    var cur = focusedEl.getBoundingClientRect();
    var cx = cur.left + cur.width / 2;
    var cy = cur.top + cur.height / 2;
    var best = null, bestScore = Infinity;
    for (var i = 0; i < focusables.length; i++) {
      var el = focusables[i];
      if (el === focusedEl) continue;
      var r = el.getBoundingClientRect();
      var dx = (r.left + r.width / 2) - cx;
      var dy = (r.top + r.height / 2) - cy;
      if (dir === 'left' && dx >= -2) continue;
      if (dir === 'right' && dx <= 2) continue;
      if (dir === 'up' && dy >= -2) continue;
      if (dir === 'down' && dy <= 2) continue;
      var score = Math.abs(dx) + Math.abs(dy);
      if (dir === 'left' || dir === 'right') score += Math.abs(dy) * 3;
      else score += Math.abs(dx) * 2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) focusEl(best);
  }

  /* ---------------- actions ---------------- */

  function cycleQuality() {
    if (playerCandidates.length < 2) { showOSD('Uma opcao so.', 1200); return; }
    playerIndex = (playerIndex + 1) % playerCandidates.length;
    renderPlayer();
    showOSD(playerCandidates[playerIndex].label, 1200);
  }

  function retryStream() {
    var id = retryTarget || (currentVideo && videoIdOf(currentVideo.url));
    if (!id) { loadTrending(); return; }
    openVideo({ url: '/watch?v=' + id, title: currentVideo && currentVideo.title });
  }

  function handleAction(action, data) {
    switch (action) {
      case 'play':
        if (data && data.idx != null) listIndex = Number(data.idx);
        openVideo(list[listIndex] || { url: '/watch?v=' + (data && data.id) });
        break;
      case 'do-search':
        var q = $('#searchq');
        doSearch(q ? q.value : currentQuery);
        break;
      case 'settings': setView('settings'); renderSettings(); break;
      case 'diag': diagnose(); break;
      case 'diagnose': diagnose(); break;
      case 'home': list = []; setView('trending'); loadTrending(); break;
      case 'instance-next':
        state.instance = (state.instance + 1) % state.instances.length;
        saveState();
        if (retryTarget) retryStream();
        else if (view === 'search') doSearch(currentQuery);
        else loadTrending();
        break;
      case 'cycle-quality': cycleQuality(); break;
      case 'pick-instance':
        state.instance = Number(data.idx);
        saveState();
        renderSettings();
        break;
      case 'set-region':
        state.region = data.v;
        saveState();
        renderSettings();
        loadTrending();
        break;
      case 'set-codec': state.codecPref = data.v; saveState(); renderSettings(); break;
      case 'set-max': state.maxHeight = Number(data.v); saveState(); renderSettings(); break;
    }
  }

  /* ---------------- keys ---------------- */

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 10009, ESC: 27,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
    PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413,
    REWIND: 412, FF: 417, NEXT: 423, PREV: 425
  };

  function onKey(e) {
    var kc = e.keyCode || e.which;
    var tag = (document.activeElement && document.activeElement.tagName) || '';

    if (kc === KEY.LEFT) { moveFocus('left'); e.preventDefault(); return; }
    if (kc === KEY.RIGHT) { moveFocus('right'); e.preventDefault(); return; }
    if (kc === KEY.UP) { moveFocus('up'); e.preventDefault(); return; }
    if (kc === KEY.DOWN) { moveFocus('down'); e.preventDefault(); return; }

    if (kc === KEY.ENTER) {
      if (tag === 'INPUT') return;
      if (focusedEl && focusedEl.hasAttribute && focusedEl.hasAttribute('data-action')) {
        handleAction(focusedEl.getAttribute('data-action'), focusedEl.dataset);
        e.preventDefault();
      }
      return;
    }

    if (kc === KEY.BACK || kc === KEY.ESC) {
      e.preventDefault();
      destroyHls();
      if (view === 'player' || view === 'settings' || view === 'diag' || view === 'search') {
        list = []; setView('trending'); loadTrending();
      } else {
        setView('trending'); loadTrending();
      }
      return;
    }

    if (kc === KEY.RED) { e.preventDefault(); setView('settings'); renderSettings(); return; }
    if (kc === KEY.GREEN) { e.preventDefault(); setView('search'); renderSearch(); return; }
    if (kc === KEY.YELLOW) { e.preventDefault(); list = []; setView('trending'); loadTrending(); return; }
    if (kc === KEY.BLUE) { e.preventDefault(); diagnose(); return; }

    if (!videoEl) return;
    if (kc === KEY.PLAY || kc === KEY.PLAYPAUSE) { e.preventDefault(); if (videoEl.paused) videoEl.play(); else videoEl.pause(); return; }
    if (kc === KEY.PAUSE) { e.preventDefault(); videoEl.pause(); return; }
    if (kc === KEY.STOP) { e.preventDefault(); videoEl.pause(); videoEl.currentTime = 0; return; }
    if (kc === KEY.REWIND) { e.preventDefault(); videoEl.currentTime = Math.max(0, videoEl.currentTime - 10); return; }
    if (kc === KEY.FF) { e.preventDefault(); videoEl.currentTime += 10; return; }
    if (kc === KEY.NEXT || kc === KEY.PREV) {
      e.preventDefault();
      if (!list.length || listIndex < 0) return;
      listIndex += (kc === KEY.NEXT ? 1 : -1);
      if (listIndex < 0 || listIndex >= list.length) { listIndex = Math.max(0, Math.min(listIndex, list.length - 1)); return; }
      openVideo(list[listIndex]);
    }
  }

  /* ---------------- boot ---------------- */

  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== document) {
      if (t.hasAttribute && t.hasAttribute('data-action')) {
        handleAction(t.getAttribute('data-action'), t.dataset);
        return;
      }
      t = t.parentNode;
    }
  });

  document.addEventListener('keydown', onKey, true);

  function boot() { setView('trending'); loadTrending(); }

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
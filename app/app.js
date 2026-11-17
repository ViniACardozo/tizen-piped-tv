/* Piped TV - modulo TizenBrew. YouTube sem anuncio via Piped, UI de controle remoto, avc1 forcado. */
(function () {
  'use strict';

  var APP = '#app';

  var DEFAULTS = {
    instances: [
      'pipedapi.ducks.party',
      'pipedapi.wireway.ch',
      'api.piped.private.coffee',
      'piped.video',
      'pipedapi.kavin.rocks'
    ],
    instance: 0,
    region: 'BR',
    codecPref: 'avc1',
    maxHeight: 720
  };

  var AVC_COMBINED_ITAGS = { 5: 240, 18: 360, 34: 360, 35: 480, 59: 480, 82: 360, 83: 480, 84: 720, 85: 1080, 22: 720, 37: 1080, 38: 3072 };
  var ITAG_HEIGHT = {
    5: 240, 18: 360, 34: 360, 35: 480, 59: 480, 82: 360, 83: 480, 84: 720, 85: 1080, 22: 720, 37: 1080, 38: 3072,
    133: 240, 134: 360, 135: 480, 136: 720, 137: 1080, 138: 2160, 264: 1440, 265: 2160, 266: 2160, 298: 720, 299: 1080,
    243: 360, 244: 480, 247: 720, 248: 1080, 271: 1440, 272: 2160, 278: 144, 302: 720, 303: 1080, 308: 1440, 313: 2160,
    394: 144, 395: 240, 396: 360, 397: 480, 398: 720, 399: 1080, 400: 1440, 401: 2160
  };

  var BOTWALL_RE = /not a bot|LOGIN_REQUIRED|Sign in to confirm|video unavailable/i;

  var state = loadState();
  var view = null;          // 'trending' | 'search' | 'player' | 'settings' | 'status'
  var list = [];            // items atuais (trending/search) para TrackNext/Prev
  var listIndex = -1;
  var playerCandidates = []; // streams escolhidos no player
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

  /* ------------------------------------------------- helpers ------------------------------------------------- */

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return (root || document).querySelectorAll(sel);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    try {
      s = JSON.parse(localStorage.getItem('pipedtv') || 'null');
    } catch (e) {
      s = null;
    }
    if (!s || typeof s !== 'object') s = {};
    for (var k in DEFAULTS) {
      if (!(k in s)) s[k] = DEFAULTS[k];
    }
    return s;
  }

  function saveState() {
    try {
      localStorage.setItem('pipedtv', JSON.stringify(state));
    } catch (e) {}
  }

  function instanceHost() {
    return String(state.instances[state.instance] || state.instances[0] || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  function nextInstance() {
    if (!state.instances.length) return;
    state.instance = (state.instance + 1) % state.instances.length;
    saveState();
  }

  function api(path) {
    var url = 'https://' + instanceHost() + path;
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (j && j.error) {
        if (BOTWALL_RE.test(j.error)) {
          var err = new Error('A instancia foi bloqueada pelo YouTube (muro anti-bot).');
          err.botwall = true;
          throw err;
        }
        throw new Error(String(j.error).slice(0, 160));
      }
      return j;
    });
  }

  function showOSD(text, ms) {
    var o = $('#osd');
    if (!o) return;
    o.textContent = text;
    o.classList.add('show');
    if (osdTimer) clearTimeout(osdTimer);
    osdTimer = setTimeout(function () { o.classList.remove('show'); }, ms || 1600);
  }

  function loadingUI() {
    setView('status');
    renderStatus('<div class="spin"></div>', 'Carregando...', '', []);
  }

  function setView(v) {
    view = v;
    hlsObj = null;
  }

  /* ------------------------------------------------- UI shell ------------------------------------------------- */

  function shell(inner) {
    var top = '' +
      '<div class="topbar">' +
      '<div class="brand">Piped<span class="accent">TV</span></div>' +
      '<span class="badge">' + esc(instanceHost()) + '</span>' +
      '<span class="meta">região ' + esc(state.region) + '</span>' +
      '</div>';
    var hints = '' +
      '<div class="hints">' +
      '<span class="hint"><b class="dot" style="background:#e74c3c"></b> ajustes</span>' +
      '<span class="hint"><b class="dot" style="background:#2ecc71"></b> buscar</span>' +
      '<span class="hint"><b class="dot" style="background:#f1c40f"></b> início</span>' +
      '<span class="hint"><b class="dot" style="background:#3498db"></b> trocar instância</span>' +
      '</div>';
    return top + inner + hints;
  }

  /* ------------------------------------------------- views ------------------------------------------------- */

  function renderStatus(icon, msg, detail, actions) {
    var app = $(APP);
    var act = '';
    for (var i = 0; i < actions.length; i++) {
      act += '<button class="btn focusable" data-action="' + actions[i].action + '">' + esc(actions[i].label) + '</button>';
    }
    app.innerHTML = shell(
      '<div class="status">' +
      '<div class="icon">' + icon + '</div>' +
      '<div class="msg">' + esc(msg) + '</div>' +
      (detail ? '<div class="detail">' + esc(detail) + '</div>' : '') +
      '<div class="actions">' + act + '</div>' +
      '</div>'
    );
    refreshFocus();
  }

  function renderTrending() {
    var app = $(APP);
    app.innerHTML = shell(
      '<div class="section">' +
      '<div class="rowlabel">Em alta</div>' +
      '<div class="cards">' + list.map(cardHtml).join('') + '</div>' +
      '</div>'
    );
    refreshFocus();
  }

  function renderSearch() {
    var app = $(APP);
    app.innerHTML = shell(
      '<div class="section">' +
      '<div class="rowlabel">Buscar</div>' +
      '<div class="searchbar">' +
      '<input class="searchinput focusable" id="searchq" type="text" placeholder="o que quer ver?" value="' + esc(currentQuery || '') + '">' +
      '<button class="btn focusable" data-action="do-search">Buscar</button>' +
      '</div>' +
      (list.length ? '<div class="rowlabel">Resultados</div><div class="cards">' + list.map(cardHtml).join('') + '</div>' : '') +
      '</div>'
    );
    refreshFocus();
    var btn = $('[data-action="do-search"]');
    if (btn) focusEl(btn);
  }

  function cardHtml(item) {
    var id = videoIdOf(item.url || item.id);
    var sub = [];
    if (item.uploaderName) sub.push(esc(item.uploaderName));
    if (item.views != null) sub.push(fmtViews(item.views) + ' views');
    if (item.uploadedDate) sub.push(esc(item.uploadedDate));
    var thumb = item.thumbnail || '';
    if (thumb && thumb.indexOf('//') === 0) thumb = 'https:' + thumb;
    return '' +
      '<div class="card focusable" data-action="play" data-id="' + esc(id) + '">' +
      '<div class="thumb">' +
      (thumb ? '<img loading="lazy" src="' + esc(thumb) + '">' : '') +
      (item.duration ? '<span class="dur">' + fmtDur(item.duration) + '</span>' : '') +
      '</div>' +
      '<div class="title">' + esc(item.title || 'Sem titulo') + '</div>' +
      '<div class="sub">' + sub.join(' · ') + '</div>' +
      '</div>';
  }

  function renderSettings() {
    var app = $(APP);
    var instBtns = '';
    for (var i = 0; i < state.instances.length; i++) {
      instBtns += '<button class="opt focusable' + (i === state.instance ? ' active' : '') + '" data-action="pick-instance" data-idx="' + i + '">' +
        esc(state.instances[i]) + (i === state.instance ? ' ✓' : '') + '</button>';
    }
    var regions = ['BR', 'US', 'GB', 'MX', 'AR', 'PT', 'FR', 'DE', 'JP', 'KR', 'IN'];
    var regBtns = '';
    for (var r = 0; r < regions.length; r++) {
      regBtns += '<button class="opt focusable' + (state.region === regions[r] ? ' active' : '') + '" data-action="set-region" data-v="' + regions[r] + '">' + regions[r] + '</button>';
    }
    var codecBtns = '' +
      '<button class="opt focusable' + (state.codecPref === 'avc1' ? ' active' : '') + '" data-action="set-codec" data-v="avc1">avc1 (estável)</button>' +
      '<button class="opt focusable' + (state.codecPref === 'any' ? ' active' : '') + '" data-action="set-codec" data-v="any">qualquer (qualidade)</button>';
    var hBtns = '' +
      '<button class="opt focusable' + (state.maxHeight === 480 ? ' active' : '') + '" data-action="set-max" data-v="480">480p</button>' +
      '<button class="opt focusable' + (state.maxHeight === 720 ? ' active' : '') + '" data-action="set-max" data-v="720">720p</button>' +
      '<button class="opt focusable' + (state.maxHeight === 1080 ? ' active' : '') + '" data-action="set-max" data-v="1080">1080p</button>';

    app.innerHTML = shell(
      '<div class="settings">' +
      '<div class="field"><div class="flabel">Instância Piped</div><div class="opts">' + instBtns + '</div></div>' +
      '<div class="field"><div class="flabel">Região</div><div class="opts">' + regBtns + '</div></div>' +
      '<div class="field"><div class="flabel">Codec</div><div class="opts">' + codecBtns + '</div></div>' +
      '<div class="field"><div class="flabel">Qualidade máxima</div><div class="opts">' + hBtns + '</div></div>' +
      '<div class="field"><div class="flabel">Testar instância atual</div>' +
      '<button class="btn focusable" data-action="test-instance">Testar agora</button></div>' +
      '</div>'
    );
    refreshFocus();
  }

  /* ------------------------------------------------- player ------------------------------------------------- */

  function renderPlayer() {
    var app = $(APP);
    var cur = playerCandidates[playerIndex];
    var pmeta = cur ? 'Qualidade: ' + esc(cur.label) : '';

    app.innerHTML = shell(
      '<div class="player-wrap">' +
      '<video id="pv" playsinline autoplay></video>' +
      '<div class="player-overlay">' +
      '<div class="ptitle">' + esc(currentVideo.title || '') + '</div>' +
      (cur ? '<span class="pmeta">' + pmeta + '</span>' : '') +
      '<button class="btn focusable" data-action="cycle-quality">Qualidade</button>' +
      '<button class="btn focusable" data-action="instance-next">Instância</button>' +
      '<button class="btn focusable" data-action="home">Voltar</button>' +
      '</div>' +
      '</div>'
    );

    videoEl = $('#pv');
    videoEl.addEventListener('error', function () {
      var msg = 'Falha ao carregar o stream (HTTP ' + (videoEl.error && videoEl.error.code) + '). Pode ter expirado ou a instância bloqueou.';
      showOSD(msg, 2600);
    });
    videoEl.addEventListener('playing', function () {
      showOSD(currentVideo.title || '', 1200);
    });

    refreshFocus();
    retryTarget = null;
    attachStream(playerCandidates[playerIndex]);
  }

  function attachStream(cand) {
    if (!videoEl) return;
    destroyHls();
    if (!cand) return;
    if (cand.kind === 'hls') {
      if (window.Hls && window.Hls.isSupported()) {
        hlsObj = new window.Hls({ maxBufferLength: 30 });
        hlsObj.loadSource(cand.url);
        hlsObj.attachMedia(videoEl);
        hlsObj.on(window.Hls.Events.ERROR, function (e, data) {
          if (data && data.fatal) showOSD('Erro HLS: ' + (data.type || ''), 2000);
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = cand.url;
        videoEl.play();
      } else {
        showOSD('HLS não suportado neste aparelho.', 2000);
      }
    } else {
      videoEl.src = cand.url;
      videoEl.play();
    }
  }

  function destroyHls() {
    if (hlsObj) {
      try { hlsObj.destroy(); } catch (e) {}
      hlsObj = null;
    }
  }

  /* ------------------------------------------------- stream picker ------------------------------------------------- */

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

  function isPlayableCombined(s) {
    return !s.videoOnly && /video\//i.test(s.mimeType || '');
  }

  function buildCandidates(data) {
    var out = [];
    var vids = data.videoStreams || [];
    var combined = vids.filter(isPlayableCombined);
    var hls = data.hls ? [{ url: data.hls, label: 'HLS', kind: 'hls' }] : [];

    var maxH = Number(state.maxHeight) || 720 | 0;
    if (state.codecPref === 'avc1') {
      var avc = combined.filter(isAvcCombined).sort(function (a, b) {
        return streamHeight(b) - streamHeight(a);
      });
      avc.forEach(function (s) {
        if (streamHeight(s) <= maxH) out.push({ url: s.url, label: (streamHeight(s) || '?') + 'p avc1', kind: 'direct' });
      });
      if (!out.length && hls.length) out = out.concat(hls);
      if (!out.length && combined.length) {
        var any = combined.slice().sort(function (a, b) {
          return streamHeight(b) - streamHeight(a);
        });
        any.forEach(function (s) {
          if (streamHeight(s) <= maxH) out.push({ url: s.url, label: (streamHeight(s) || '?') + 'p', kind: 'direct' });
        });
      }
    } else {
      var all = combined.slice().sort(function (a, b) {
        return streamHeight(b) - streamHeight(a);
      });
      all.forEach(function (s) {
        if (streamHeight(s) <= maxH) out.push({ url: s.url, label: (streamHeight(s) || '?') + 'p', kind: 'direct' });
      });
      if (hls.length) out = out.concat(hls);
    }

    if (!out.length) {
      out = hls;
    }
    return out;
  }

  function openVideo(item) {
    var id = videoIdOf(item.url || item.id);
    if (!id) {
      showOSD('Vídeo sem ID válido.', 2000);
      return;
    }
    currentVideo = item;
    playerCandidates = [];
    playerIndex = 0;
    retryTarget = id;
    setView('player');
    renderPlayer();
    loadingUI(); // guarda; será substituído
    loadStreams(id);
  }

  function loadStreams(id) {
    var tok = ++loadingToken;
    loadingUI();
    api('/streams/' + id).then(function (data) {
      if (tok !== loadingToken) return;
      if (!data || !data.title) throw new Error('Instância não devolveu streams.');
      var title = data.title;
      var cands = buildCandidates(data);
      if (!cands.length) throw new Error('Nenhum stream reproduzível com este codec. Mude para "qualquer (qualidade)" ou troque de instância.');
      currentVideo = currentVideo || {};
      currentVideo.title = title;
      playerCandidates = cands;
      playerIndex = 0;
      setView('player');
      renderPlayer();
    }).catch(function (e) {
      if (tok !== loadingToken) return;
      setView('status');
      var actions = [
        { label: 'Trocar instância', action: 'instance-next' },
        { label: 'Voltar', action: 'home' }
      ];
      retryTarget = id;
      renderStatus('<div class="big">!</div>', e.message || 'Erro.', 'O YouTube bloqueia IPs de instâncias públicas com o muro anti-bot — é só trocar até uma funcionar, ou hospedar sua própria instância (README).', actions);
    });
  }

  /* ------------------------------------------------- data loading ------------------------------------------------- */

  var currentQuery = '';

  function loadTrending() {
    var tok = ++loadingToken;
    loadingUI();
    api('/trending?region=' + encodeURIComponent(state.region)).then(function (items) {
      if (tok !== loadingToken) return;
      list = items || [];
      setView('trending');
      renderTrending();
    }).catch(function (e) {
      if (tok !== loadingToken) return;
      setView('status');
      renderStatus('<div class="big">!</div>', 'Não deu para carregar o feed.', 'Instância atual: ' + instanceHost() + ' — ' + (e.message || e), [
        { label: 'Trocar instância', action: 'instance-next' },
        { label: 'Ajustes', action: 'settings' }
      ]);
    });
  }

  function doSearch(q) {
    q = String(q || '').trim();
    if (!q) return;
    currentQuery = q;
    var tok = ++loadingToken;
    loadingUI();
    api('/search?q=' + encodeURIComponent(q) + '&filter=videos').then(function (j) {
      if (tok !== loadingToken) return;
      list = (j && j.items) || [];
      setView('search');
      renderSearch();
    }).catch(function (e) {
      if (tok !== loadingToken) return;
      setView('status');
      renderStatus('<div class="big">!</div>', 'Falha na busca.', 'Instância atual: ' + instanceHost() + ' — ' + (e.message || e), [
        { label: 'Trocar instância', action: 'instance-next' },
        { label: 'Voltar', action: 'home' }
      ]);
    });
  }

  function testInstance() {
    var tok = ++loadingToken;
    loadingUI();
    api('/trending?region=BR').then(function (items) {
      if (tok !== loadingToken) return;
      var n = items ? items.length : 0;
      showOSD(instanceHost() + ' OK — ' + n + ' itens', 2400);
      renderSettings();
    }).catch(function (e) {
      if (tok !== loadingToken) return;
      showOSD(instanceHost() + ': ' + (e.message || e), 2600);
      renderSettings();
    });
  }

  /* ------------------------------------------------- focus / spatial nav ------------------------------------------------- */

  function refreshFocus() {
    focusables = Array.prototype.slice.call($$('.focusable', $(APP)));
    if (focusables.length) {
      focusEl(focusables[0]);
    } else {
      focusedEl = null;
    }
  }

  function focusEl(el) {
    if (!el || el === focusedEl) return;
    if (focusedEl) focusedEl.classList.remove('focused');
    focusedEl = el;
    focusedEl.classList.add('focused');
    try {
      focusedEl.focus();
      if (typeof focusedEl.scrollIntoView === 'function') {
        focusedEl.scrollIntoView({ block: 'nearest' });
      }
    } catch (e) {}
  }

  function rectCenter(r) {
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function moveFocus(dir) {
    if (!focusedEl) { refreshFocus(); return; }
    var cur = focusedEl.getBoundingClientRect();
    var cc = rectCenter(cur);
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < focusables.length; i++) {
      var el = focusables[i];
      if (el === focusedEl) continue;
      var r = el.getBoundingClientRect();
      var c = rectCenter(r);
      var dx = c.x - cc.x;
      var dy = c.y - cc.y;
      var score = Math.abs(dx) + Math.abs(dy);
      if (dir === 'left' && dx >= -1) continue;
      if (dir === 'right' && dx <= 1) continue;
      if (dir === 'up' && dy >= -1) continue;
      if (dir === 'down' && dy <= 1) continue;
      if (dir === 'left' || dir === 'right') score += Math.abs(dy) * 3;
      if (dir === 'up' || dir === 'down') score += Math.abs(dx) * 1.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) focusEl(best);
  }

  /* ------------------------------------------------- actions ------------------------------------------------- */

  function playById(id) {
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (videoIdOf(item.url || item.id) === id) {
        listIndex = i;
        openVideo(item);
        return;
      }
    }
    openVideo({ url: '/watch?v=' + id, title: '' });
  }

  function cycleQuality() {
    if (playerCandidates.length < 2) {
      showOSD('Só existe uma opção de stream.', 1400);
      return;
    }
    playerIndex = (playerIndex + 1) % playerCandidates.length;
    renderPlayer();
    showOSD('Qualidade: ' + playerCandidates[playerIndex].label, 1200);
  }

  function retryStream() {
    var id = retryTarget || (currentVideo && videoIdOf(currentVideo.url));
    if (!id) return;
    loadStreams(id);
  }

  function handleAction(action, data) {
    switch (action) {
      case 'play':
        playById(data.id);
        break;
      case 'do-search':
        var q = $('#searchq');
        doSearch(q ? q.value : '');
        break;
      case 'settings':
        setView('settings');
        renderSettings();
        break;
      case 'home':
        list = [];
        setView('trending');
        loadTrending();
        break;
      case 'retry':
        retryStream();
        break;
      case 'instance-next':
        nextInstance();
        if (retryTarget) {
          retryStream();
        } else if (view === 'player') {
          retryStream();
        } else if (view === 'search') {
          doSearch(currentQuery);
        } else {
          loadTrending();
        }
        break;
      case 'cycle-quality':
        cycleQuality();
        break;
      case 'pick-instance':
        state.instance = Number(data.idx);
        saveState();
        if (view === 'search') doSearch(currentQuery); else loadTrending();
        break;
      case 'set-region':
        state.region = data.v;
        saveState();
        renderSettings();
        loadTrending();
        break;
      case 'set-codec':
        state.codecPref = data.v;
        saveState();
        renderSettings();
        break;
      case 'set-max':
        state.maxHeight = Number(data.v);
        saveState();
        renderSettings();
        break;
      case 'test-instance':
        testInstance();
        break;
    }
  }

  /* ------------------------------------------------- keys ------------------------------------------------- */

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
      if (tag === 'INPUT') return; // deixa o campo pegar
      if (focusedEl && focusedEl.classList.contains('focusable')) {
        if (focusedEl.hasAttribute('data-action')) {
          handleAction(focusedEl.getAttribute('data-action'), focusedEl.dataset);
          e.preventDefault();
          return;
        }
      }
      return;
    }

    if (kc === KEY.BACK || kc === KEY.ESC) {
      e.preventDefault();
      if (view === 'player') { destroyHls(); list = []; setView('trending'); loadTrending(); }
      else if (view === 'search') { setView('trending'); loadTrending(); }
      else if (view === 'settings') { setView('trending'); loadTrending(); }
      else { setView('trending'); loadTrending(); }
      return;
    }

    if (kc === KEY.RED) { e.preventDefault(); setView('settings'); renderSettings(); return; }
    if (kc === KEY.GREEN) { e.preventDefault(); setView('search'); renderSearch(); return; }
    if (kc === KEY.YELLOW) { e.preventDefault(); list = []; setView('trending'); loadTrending(); return; }
    if (kc === KEY.BLUE) {
      e.preventDefault();
      nextInstance();
      if (retryTarget) retryStream();
      else if (view === 'player') retryStream();
      else if (view === 'search') doSearch(currentQuery);
      else loadTrending();
      return;
    }

    if (!videoEl) return;
    if (kc === KEY.PLAY || kc === KEY.PLAYPAUSE) { e.preventDefault(); videoEl.paused ? videoEl.play() : videoEl.pause(); return; }
    if (kc === KEY.PAUSE) { e.preventDefault(); videoEl.pause(); return; }
    if (kc === KEY.STOP) { e.preventDefault(); videoEl.pause(); videoEl.currentTime = 0; return; }
    if (kc === KEY.REWIND) { e.preventDefault(); videoEl.currentTime = Math.max(0, videoEl.currentTime - 10); return; }
    if (kc === KEY.FF) { e.preventDefault(); videoEl.currentTime = Math.min(videoEl.duration || Infinity, videoEl.currentTime + 10); return; }
    if (kc === KEY.NEXT || kc === KEY.PREV) {
      e.preventDefault();
      if (!list.length || listIndex < 0) return;
      var ni = listIndex + (kc === KEY.NEXT ? 1 : -1);
      if (ni < 0 || ni >= list.length) { showOSD('Fim da lista.', 1200); return; }
      listIndex = ni;
      openVideo(list[ni]);
      return;
    }
  }

  /* ------------------------------------------------- events / boot ------------------------------------------------- */

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

  function boot() {
    setView('trending');
    loadTrending();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  if (typeof window !== 'undefined') {
    window.__pipedtv = {
      buildCandidates: buildCandidates,
      streamHeight: streamHeight,
      withState: function (o) {
        for (var k in o) state[k] = o[k];
        saveState();
      }
    };
  }
})();
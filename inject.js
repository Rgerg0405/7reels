/*
 * 7Reels TizenBrew modul v1.1
 * - Netflix-szerű távirányítós navigáció (sorok/oszlopok, oszlopmemória,
 *   kiemelés nagyítással, finom görgetés)
 * - pop-up / átirányítás tiltás, adblock (kapcsolható)
 * - ellenőrző (robot-check) oldalakon a modul félreáll
 * Gombok: nyilak, OK, Back, média gombok,
 *         SÁRGA = blokkolás be/ki, KÉK = nagyítás (100/125/150%)
 */
(function () {
  'use strict';
  if (window.__reelsTvLoaded) return;
  window.__reelsTvLoaded = true;

  /* ================= BEÁLLÍTÁSOK ================= */

  var OWN_HOSTS = ['7reels.cc'];
  var BLOCK_EXTERNAL_LINKS = true;
  var BLOCKED_HOSTS = [
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'adservice.google.com', 'popads.net', 'popcash.net', 'propellerads.com',
    'exoclick.com', 'juicyads.com', 'trafficjunky.com', 'clickadu.com',
    'hilltopads.net', 'adcash.com', 'a-ads.com', 'admaven.com', 'adsterra.com',
    'onclickads.net', 'adnxs.com', 'taboola.com', 'outbrain.com',
    'histats.com', 'mc.yandex.ru'
  ];
  var AD_SELECTORS = [
    'ins.adsbygoogle', '[id^="google_ads"]', '[class~="adsbygoogle"]',
    '[class~="ad"]', '[class~="ads"]', '[class~="advert"]', '[class~="adsbox"]',
    '[id="ad"]', '[id="ads"]', '[id="adbox"]',
    'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
    'iframe[src*="popads"]', 'iframe[src*="exoclick"]', 'iframe[src*="adsterra"]',
    'a[href*="popads"]', 'a[href*="exoclick"]', 'a[href*="adsterra"]'
  ];
  var ZOOM_STEPS = [1, 1.25, 1.5];
  var VERIFY_RE = /scan with your phone|not a robot|verify (that )?you are (a )?human|captcha|checking your browser|just a moment/i;

  var K = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009,
    PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, REW: 412, FF: 417,
    YELLOW: 405, BLUE: 406
  };

  /* ================= ÁLLAPOT ================= */

  var state = { blocking: true, verifying: false, zoomIdx: 0 };
  var STORE_KEY = 'reels-tv-v1';

  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      if (typeof s.blocking === 'boolean') state.blocking = s.blocking;
      if (typeof s.zoomIdx === 'number' && s.zoomIdx >= 0 && s.zoomIdx < ZOOM_STEPS.length) state.zoomIdx = s.zoomIdx;
    } catch (e) {}
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ blocking: state.blocking, zoomIdx: state.zoomIdx })); } catch (e) {}
  }
  function active() { return state.blocking && !state.verifying; }
  function applyBlockClass() {
    try { document.documentElement.classList.toggle('reels-block', active()); } catch (e) {}
  }
  function applyZoom() {
    try { document.documentElement.style.zoom = String(ZOOM_STEPS[state.zoomIdx]); } catch (e) {}
  }
  loadState();
  applyBlockClass();
  applyZoom();

  /* ================= ÉRTESÍTÉS ================= */

  var toastEl = null, toastTimer = null;
  function toast(msg) {
    try {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.style.cssText = 'position:fixed;top:24px;right:24px;z-index:2147483647;' +
          'background:rgba(0,0,0,.88);color:#fff;font:600 24px/1.3 sans-serif;padding:14px 22px;' +
          'border-radius:10px;pointer-events:none;transition:opacity .2s;opacity:0';
        (document.body || document.documentElement).appendChild(toastEl);
      }
      toastEl.textContent = msg;
      toastEl.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, 2200);
    } catch (e) {}
  }

  /* ================= SEGÉDEK ================= */

  function hostOf(url) {
    try { return new URL(url, location.href).hostname.toLowerCase(); } catch (e) { return ''; }
  }
  function hostIn(host, list) {
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (host === h || host.slice(-(h.length + 1)) === '.' + h) return true;
    }
    return false;
  }
  function isBlockedUrl(url) {
    if (!url) return false;
    var h = hostOf(url);
    return !!h && hostIn(h, BLOCKED_HOSTS);
  }
  function isOwnUrl(url) {
    var h = hostOf(url);
    return !h || hostIn(h, OWN_HOSTS) || h === location.hostname;
  }

  /* ================= POP-UP / ÁTIRÁNYÍTÁS TILTÁS ================= */

  var realOpen = window.open;
  var fakeWin = {
    closed: true, focus: function () {}, blur: function () {}, close: function () {},
    document: { write: function () {}, close: function () {} }, location: { href: '' }
  };
  window.open = function () {
    if (!active()) return realOpen.apply(window, arguments);
    return fakeWin;
  };

  document.addEventListener('click', function (e) {
    if (!active() || !BLOCK_EXTERNAL_LINKS) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/^javascript:/i.test(href)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (/^(#|mailto:|tel:)/i.test(href)) return;
    if (a.target === '_blank' || !isOwnUrl(a.href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  /* ================= HÁLÓZATI BLOKKOLÁS ================= */

  try {
    var origAppend = Node.prototype.appendChild;
    var origInsert = Node.prototype.insertBefore;
    var blockedNode = function (n) {
      if (!active() || !n || !n.tagName) return false;
      var t = n.tagName;
      if (t === 'SCRIPT' || t === 'IFRAME' || t === 'IMG' || t === 'LINK') return isBlockedUrl(n.src || n.href);
      return false;
    };
    Node.prototype.appendChild = function (n) {
      if (blockedNode(n)) return n;
      return origAppend.call(this, n);
    };
    Node.prototype.insertBefore = function (n, ref) {
      if (blockedNode(n)) return n;
      return origInsert.call(this, n, ref);
    };
  } catch (e) {}

  try {
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (input) {
        var url = typeof input === 'string' ? input : (input && input.url);
        if (active() && isBlockedUrl(url)) return Promise.reject(new TypeError('blocked'));
        return origFetch.apply(this, arguments);
      };
    }
    var origXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__blocked = active() && isBlockedUrl(url);
      if (this.__blocked) arguments[1] = 'about:blank';
      return origXhrOpen.apply(this, arguments);
    };
    var origXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      if (this.__blocked) return;
      return origXhrSend.apply(this, arguments);
    };
  } catch (e) {}

  /* ================= CSS ================= */

  function injectCss() {
    if (document.getElementById('reels-tv-css')) return;
    var adCss = AD_SELECTORS.map(function (s) { return 'html.reels-block ' + s; }).join(',') +
      '{display:none!important;visibility:hidden!important}';
    var focusCss =
      'a:focus,button:focus,[role="button"]:focus,[role="link"]:focus,[tabindex]:focus,[onclick]:focus{' +
        'outline:4px solid #fff!important;outline-offset:3px!important;border-radius:8px;' +
        'transform:scale(1.07);box-shadow:0 14px 34px rgba(0,0,0,.7);' +
        'transition:transform .14s ease-out,box-shadow .14s ease-out}' +
      'input:focus,textarea:focus,select:focus{outline:4px solid #fff!important;outline-offset:2px!important}';
    var s = document.createElement('style');
    s.id = 'reels-tv-css';
    s.textContent = adCss + '\n' + focusCss;
    (document.head || document.documentElement).appendChild(s);
  }
  injectCss();

  /* ================= ELLENŐRZŐ OLDAL FELISMERÉSE ================= */

  function checkVerify() {
    try {
      var txt = (document.body && document.body.innerText) || '';
      var found = VERIFY_RE.test(txt.slice(0, 6000)) || VERIFY_RE.test(document.title || '');
      if (found !== state.verifying) {
        state.verifying = found;
        applyBlockClass();
        toast(found ? 'Ellenőrző oldal: a blokkolás szünetel' : 'Blokkolás újra aktív');
      }
    } catch (e) {}
  }

  /* ================= TAKARÓ RÉTEGEK ================= */

  function looksLikeOverlay(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag !== 'DIV' && tag !== 'A' && tag !== 'SECTION' && tag !== 'SPAN') return false;
    var cs = window.getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
    var z = parseInt(cs.zIndex, 10);
    if (isNaN(z) || z < 999) return false;
    var r = el.getBoundingClientRect();
    if (r.width < window.innerWidth * 0.7 || r.height < window.innerHeight * 0.7) return false;
    if (el.querySelector('video, iframe, input, button, select, textarea, canvas, img, svg')) return false;
    if ((el.textContent || '').trim().length > 20) return false;
    return true;
  }
  function sweep() {
    if (!active() || !document.body) return;
    try {
      var nodes = document.body.querySelectorAll('div, a, section, span');
      for (var i = 0; i < nodes.length; i++) {
        if (looksLikeOverlay(nodes[i])) nodes[i].remove();
      }
    } catch (e) {}
  }

  /* ================= NAVIGÁCIÓ ================= */

  var FOCUS_SEL = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
    '[tabindex]:not([tabindex="-1"])', '[role="button"]', '[role="link"]', '[onclick]'
  ].join(',');

  var cache = [], cacheAt = 0, dirty = true;
  var stickX = null, stickY = null, lastFocused = null, lastMoveAt = 0;

  function collect() {
    var all = document.querySelectorAll(FOCUS_SEL);
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.disabled) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      var cs = window.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
      out.push(el);
    }
    return out;
  }
  function getFocusables() {
    var now = Date.now();
    if (dirty || now - cacheAt > 1000) { cache = collect(); cacheAt = now; dirty = false; }
    return cache;
  }
  function cx(r) { return r.left + r.width / 2; }
  function cy(r) { return r.top + r.height / 2; }

  function reveal(el, fast) {
    var r = el.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth;
    var inBand = r.top >= vh * 0.12 && r.bottom <= vh * 0.88 && r.left >= vw * 0.04 && r.right <= vw * 0.96;
    if (inBand) return;
    try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: fast ? 'auto' : 'smooth' }); }
    catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
  }

  function focusEl(el, fast) {
    if (!el) return;
    if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    lastFocused = el;
    reveal(el, fast);
  }

  function pickInitial(list) {
    var best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      var score = Math.max(r.top, 0) * 2 + Math.max(r.left, 0);
      if (score < bestScore) { bestScore = score; best = list[i]; }
    }
    return best || list[0] || null;
  }

  function moveFocus(dir) {
    var list = getFocusables();
    if (!list.length) return false;
    var now = Date.now();
    var fast = now - lastMoveAt < 250;
    lastMoveAt = now;

    var cur = document.activeElement;
    if (!cur || cur === document.body || list.indexOf(cur) === -1) {
      var first = pickInitial(list);
      if (first) {
        var fr = first.getBoundingClientRect();
        stickX = cx(fr); stickY = cy(fr);
        focusEl(first, fast);
        return true;
      }
      return false;
    }

    var cr = cur.getBoundingClientRect();
    if (cur !== lastFocused || stickX === null) { stickX = cx(cr); stickY = cy(cr); }
    var horizontal = (dir === K.LEFT || dir === K.RIGHT);
    var best = null;

    if (horizontal) {
      var bestScore = Infinity;
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (el === cur) continue;
        var r = el.getBoundingClientRect();
        var dx = cx(r) - cx(cr);
        if (dir === K.LEFT && dx >= -2) continue;
        if (dir === K.RIGHT && dx <= 2) continue;
        var primary = Math.abs(dx);
        var overlapY = Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top);
        var sameRow = overlapY > Math.min(cr.height, r.height) * 0.3;
        var score = primary + (sameRow ? Math.abs(cy(r) - stickY) * 0.5 : 2000 + Math.abs(cy(r) - stickY) * 3);
        if (score < bestScore) { bestScore = score; best = el; }
      }
    } else {
      var cands = [], minPrimary = Infinity;
      for (var j = 0; j < list.length; j++) {
        var e2 = list[j];
        if (e2 === cur) continue;
        var r2 = e2.getBoundingClientRect();
        var dy = cy(r2) - cy(cr);
        if (dir === K.UP && dy >= -4) continue;
        if (dir === K.DOWN && dy <= 4) continue;
        var p = Math.abs(dy);
        cands.push({ el: e2, r: r2, p: p });
        if (p < minPrimary) minPrimary = p;
      }
      var tol = Math.max(80, cr.height * 0.6);
      var bestDx = Infinity;
      for (var k = 0; k < cands.length; k++) {
        if (cands[k].p > minPrimary + tol) continue;
        var d = Math.abs(cx(cands[k].r) - stickX);
        if (d < bestDx) { bestDx = d; best = cands[k].el; }
      }
    }

    if (!best) return false;
    var br = best.getBoundingClientRect();
    if (horizontal) { stickX = cx(br); stickY = cy(br); } else { stickY = cy(br); }
    focusEl(best, fast);
    return true;
  }

  function isTextField(el) {
    if (!el || !el.tagName) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    var type = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].indexOf(type) !== -1;
  }
  function getVideo() {
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      if (vids[i].readyState > 0 || !vids[i].paused) return vids[i];
    }
    return vids[0] || null;
  }
  function goBack() {
    if (document.fullscreenElement && document.exitFullscreen) { document.exitFullscreen(); return true; }
    if (history.length > 1) { history.back(); return true; }
    return false;
  }

  document.addEventListener('keydown', function (e) {
    var code = e.keyCode;
    var active_ = document.activeElement;

    if (code === K.YELLOW) {
      e.preventDefault();
      state.blocking = !state.blocking;
      saveState(); applyBlockClass();
      toast('Blokkolás: ' + (state.blocking ? 'BE' : 'KI'));
      return;
    }
    if (code === K.BLUE) {
      e.preventDefault();
      state.zoomIdx = (state.zoomIdx + 1) % ZOOM_STEPS.length;
      saveState(); applyZoom(); dirty = true;
      toast('Nagyítás: ' + Math.round(ZOOM_STEPS[state.zoomIdx] * 100) + '%');
      return;
    }

    if (code === K.BACK || code === 27) {
      if (goBack()) e.preventDefault();
      return;
    }

    var v = getVideo();
    if (v && (code === K.PLAY || code === K.PAUSE || code === K.PLAYPAUSE || code === K.STOP ||
              code === K.REW || code === K.FF)) {
      e.preventDefault();
      if (code === K.PLAY) v.play();
      else if (code === K.PAUSE || code === K.STOP) v.pause();
      else if (code === K.PLAYPAUSE) { if (v.paused) v.play(); else v.pause(); }
      else if (code === K.REW) v.currentTime = Math.max(0, v.currentTime - 10);
      else if (code === K.FF) v.currentTime = v.currentTime + 10;
      return;
    }

    if (code === K.LEFT || code === K.RIGHT || code === K.UP || code === K.DOWN) {
      if (isTextField(active_) && (code === K.LEFT || code === K.RIGHT)) {
        try {
          var len = (active_.value || '').length;
          if (code === K.LEFT && active_.selectionStart > 0) return;
          if (code === K.RIGHT && active_.selectionEnd < len) return;
        } catch (err) { return; }
      }
      // gyors nyomvatartásnál ne ugorjon túl
      if (e.repeat && Date.now() - lastMoveAt < 80) { e.preventDefault(); return; }
      if (moveFocus(code)) { e.preventDefault(); e.stopPropagation(); }
      return;
    }

    if (code === K.ENTER && active_ && active_ !== document.body) {
      var t = active_.tagName;
      if (t !== 'A' && t !== 'BUTTON' && t !== 'INPUT' && t !== 'SELECT' && t !== 'TEXTAREA') {
        e.preventDefault();
        active_.click();
      }
    }
  }, true);

  /* ================= INDÍTÁS ================= */

  var sweepTimer = null;
  function onMutation() {
    dirty = true;
    if (sweepTimer) return;
    sweepTimer = setTimeout(function () { sweepTimer = null; sweep(); }, 700);
  }

  function init() {
    injectCss();
    applyBlockClass();
    applyZoom();
    checkVerify();
    sweep();
    try {
      new MutationObserver(onMutation).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
    setInterval(checkVerify, 2000);
    setTimeout(function () {
      if (!document.activeElement || document.activeElement === document.body) {
        var list = getFocusables();
        var first = pickInitial(list);
        if (first) {
          var fr = first.getBoundingClientRect();
          stickX = cx(fr); stickY = cy(fr);
          focusEl(first, true);
        }
      }
    }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

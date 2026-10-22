/*
 * 7Reels TizenBrew modul v1.2
 * - elemkeresés: linkek, gombok ÉS minden kéz-kurzoros (kattintható) elem
 * - fókusz mód (Netflix-szerű) + automatikus kurzor mód tartaléknak
 * - állapotjelző a képernyő sarkában
 * - blokkolás alapból KI (sárga gomb: be/ki)
 * Gombok: nyilak, OK, Back, média gombok
 *   PIROS = fókusz/kurzor mód váltás   SÁRGA = blokkolás be/ki
 *   KÉK = nagyítás                     0 = állapotjelző ki/be
 */
(function () {
  'use strict';
  if (window.__reelsTvLoaded) return;
  window.__reelsTvLoaded = true;

  var VERSION = '1.2';

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
    RED: 403, YELLOW: 405, BLUE: 406, ZERO: 48
  };

  /* ================= ÁLLAPOT ================= */

  var state = { blocking: false, verifying: false, zoomIdx: 0, pointer: false };
  var STORE_KEY = 'reels-tv-v2';
  var errCount = 0;

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

  window.addEventListener('error', function () { errCount++; });

  /* ================= ÉRTESÍTÉS + ÁLLAPOTJELZŐ ================= */

  function appendUi(el) {
    (document.body || document.documentElement).appendChild(el);
  }

  var toastEl = null, toastTimer = null;
  function toast(msg) {
    try {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.style.cssText = 'position:fixed;top:24px;right:24px;z-index:2147483647;' +
          'background:rgba(0,0,0,.88);color:#fff;font:600 24px/1.3 sans-serif;padding:14px 22px;' +
          'border-radius:10px;pointer-events:none;transition:opacity .2s;opacity:0;max-width:60vw';
        appendUi(toastEl);
      }
      toastEl.textContent = msg;
      toastEl.style.opacity = '1';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, 2600);
    } catch (e) {}
  }

  var badgeEl = null, badgeTimer = null, badgePinned = false;
  function badgeText() {
    return '7Reels mod v' + VERSION +
      ' | elemek: ' + cache.length +
      ' | mód: ' + (state.pointer ? 'kurzor' : 'fókusz') +
      ' | blokkolás: ' + (state.blocking ? (state.verifying ? 'szünet' : 'be') : 'ki') +
      ' | oldalhibák: ' + errCount +
      ' | ' + location.hostname;
  }
  function showBadge(ms) {
    try {
      getFocusables();
      if (!badgeEl) {
        badgeEl = document.createElement('div');
        badgeEl.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;' +
          'background:rgba(0,0,0,.82);color:#9f9;font:600 20px/1.3 monospace;padding:8px 14px;' +
          'border-radius:8px;pointer-events:none;transition:opacity .2s;opacity:0';
        appendUi(badgeEl);
      }
      badgeEl.textContent = badgeText();
      badgeEl.style.opacity = '1';
      clearTimeout(badgeTimer);
      if (!badgePinned) badgeTimer = setTimeout(function () { badgeEl.style.opacity = '0'; }, ms || 5000);
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
      '[data-reels-focus]{outline:4px solid #fff!important;outline-offset:3px!important;border-radius:8px;' +
        'transform:scale(1.06);box-shadow:0 14px 34px rgba(0,0,0,.7);' +
        'transition:transform .14s ease-out,box-shadow .14s ease-out;position:relative;z-index:2147483000}' +
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
        toast(found ? 'Ellenőrző oldal felismerve' : 'Ellenőrző oldal vége');
      }
    } catch (e) {}
  }

  /* ================= TAKARÓ RÉTEGEK (csak blokkolással) ================= */

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

  /* ================= ELEMKERESÉS ================= */

  var BASIC_SEL = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
    '[tabindex]:not([tabindex="-1"])', '[role="button"]', '[role="link"]', '[onclick]'
  ].join(',');
  var GENERIC_SEL = 'div, li, span, img, article, figure, section, p, h1, h2, h3, h4, svg';

  var cache = [], cacheAt = 0, dirty = true;

  function sizeOk(r, minSize, maxFraction) {
    if (r.width < minSize || r.height < minSize) return false;
    if (maxFraction && r.width > window.innerWidth * maxFraction && r.height > window.innerHeight * maxFraction) return false;
    return true;
  }

  function collect() {
    var out = [], seen = [];
    var basic = document.querySelectorAll(BASIC_SEL);
    var i, el, r, cs;
    for (i = 0; i < basic.length; i++) {
      el = basic[i];
      if (el.disabled) continue;
      r = el.getBoundingClientRect();
      if (!sizeOk(r, 8)) continue;
      cs = window.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
      out.push(el); seen.push(el);
    }
    // kéz-kurzoros (kattintható) elemek: a legkülső elem a láncban
    var gen = document.querySelectorAll(GENERIC_SEL);
    var limit = Math.min(gen.length, 4000);
    for (i = 0; i < limit; i++) {
      el = gen[i];
      if (el === document.body || el === document.documentElement) continue;
      r = el.getBoundingClientRect();
      if (!sizeOk(r, 24, 0.9)) continue;
      cs = window.getComputedStyle(el);
      if (cs.cursor !== 'pointer' || cs.visibility === 'hidden' || cs.display === 'none') continue;
      var p = el.parentElement;
      if (p && window.getComputedStyle(p).cursor === 'pointer') continue;
      if (el.closest && el.closest(BASIC_SEL) && seen.indexOf(el.closest(BASIC_SEL)) !== -1) continue;
      out.push(el);
    }
    return out;
  }
  function getFocusables() {
    var now = Date.now();
    if (dirty || now - cacheAt > 1500) { cache = collect(); cacheAt = now; dirty = false; }
    return cache;
  }

  /* ================= FÓKUSZ MÓD ================= */

  var stickX = null, stickY = null, lastFocused = null, lastMoveAt = 0, current = null;

  function cx(r) { return r.left + r.width / 2; }
  function cy(r) { return r.top + r.height / 2; }

  function setCurrent(el) {
    if (current && current.removeAttribute) current.removeAttribute('data-reels-focus');
    current = el;
    if (el) el.setAttribute('data-reels-focus', '1');
  }

  function reveal(el, fast) {
    var r = el.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth;
    var inBand = r.top >= vh * 0.12 && r.bottom <= vh * 0.88 && r.left >= vw * 0.04 && r.right <= vw * 0.96;
    if (inBand) return;
    try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: fast ? 'auto' : 'smooth' }); }
    catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
  }

  function focusEl(el, fast) {
    if (!el) return;
    setCurrent(el);
    try {
      if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    } catch (e) {}
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
    if (!list.length) return null; // null = nincs mit kijelölni
    var now = Date.now();
    var fast = now - lastMoveAt < 250;
    lastMoveAt = now;

    var cur = current && list.indexOf(current) !== -1 ? current : null;
    if (!cur) {
      var first = pickInitial(list);
      if (first) {
        var fr = first.getBoundingClientRect();
        stickX = cx(fr); stickY = cy(fr);
        focusEl(first, fast);
        return true;
      }
      return null;
    }

    var cr = cur.getBoundingClientRect();
    if (cur !== lastFocused || stickX === null) { stickX = cx(cr); stickY = cy(cr); }
    var horizontal = (dir === K.LEFT || dir === K.RIGHT);
    var best = null, i, el, r;

    if (horizontal) {
      var bestScore = Infinity;
      for (i = 0; i < list.length; i++) {
        el = list[i];
        if (el === cur) continue;
        r = el.getBoundingClientRect();
        var dx = cx(r) - cx(cr);
        if (dir === K.LEFT && dx >= -2) continue;
        if (dir === K.RIGHT && dx <= 2) continue;
        var overlapY = Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top);
        var sameRow = overlapY > Math.min(cr.height, r.height) * 0.3;
        var score = Math.abs(dx) + (sameRow ? Math.abs(cy(r) - stickY) * 0.5 : 2000 + Math.abs(cy(r) - stickY) * 3);
        if (score < bestScore) { bestScore = score; best = el; }
      }
    } else {
      var cands = [], minPrimary = Infinity;
      for (i = 0; i < list.length; i++) {
        el = list[i];
        if (el === cur) continue;
        r = el.getBoundingClientRect();
        var dy = cy(r) - cy(cr);
        if (dir === K.UP && dy >= -4) continue;
        if (dir === K.DOWN && dy <= 4) continue;
        var pr = Math.abs(dy);
        cands.push({ el: el, r: r, p: pr });
        if (pr < minPrimary) minPrimary = pr;
      }
      var tol = Math.max(80, cr.height * 0.6), bestDx = Infinity;
      for (i = 0; i < cands.length; i++) {
        if (cands[i].p > minPrimary + tol) continue;
        var d = Math.abs(cx(cands[i].r) - stickX);
        if (d < bestDx) { bestDx = d; best = cands[i].el; }
      }
    }

    if (!best) return false;
    var br = best.getBoundingClientRect();
    if (horizontal) { stickX = cx(br); stickY = cy(br); } else { stickY = cy(br); }
    focusEl(best, fast);
    return true;
  }

  function activateCurrent() {
    var el = current;
    if (!el || !el.isConnected) return false;
    var t = el.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') { try { el.focus(); } catch (e) {} return true; }
    el.click();
    return true;
  }

  /* ================= KURZOR MÓD ================= */

  var ptr = { x: 0, y: 0, el: null, speed: 18, lastAt: 0 };

  function ensurePtr() {
    if (ptr.el) return ptr.el;
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;' +
      'border-radius:50%;background:rgba(255,255,255,.92);border:3px solid #e50914;' +
      'box-shadow:0 0 12px rgba(0,0,0,.8);z-index:2147483647;pointer-events:none;display:none';
    appendUi(d);
    ptr.el = d;
    return d;
  }
  function drawPtr() { ensurePtr().style.transform = 'translate(' + ptr.x + 'px,' + ptr.y + 'px)'; }

  function setPointer(on, silent) {
    state.pointer = on;
    ensurePtr().style.display = on ? 'block' : 'none';
    if (on) {
      if (current && current.isConnected) {
        var r = current.getBoundingClientRect();
        ptr.x = cx(r); ptr.y = cy(r);
      } else if (!ptr.x && !ptr.y) {
        ptr.x = window.innerWidth / 2; ptr.y = window.innerHeight / 2;
      }
      drawPtr();
      if (!silent) toast('Kurzor mód: nyilak = mozgatás, OK = kattintás, PIROS = vissza');
    } else if (!silent) {
      toast('Fókusz mód');
    }
    showBadge(4000);
  }

  function scrollUnderPointer(dx, dy) {
    var el = document.elementFromPoint(ptr.x, ptr.y);
    while (el && el !== document.body && el !== document.documentElement) {
      var cs = window.getComputedStyle(el);
      var canY = dy && (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
      var canX = dx && (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth;
      if (canX || canY) { el.scrollBy(dx, dy); return; }
      el = el.parentElement;
    }
    window.scrollBy(dx, dy);
  }

  function movePtr(dir) {
    var now = Date.now();
    ptr.speed = (now - ptr.lastAt < 160) ? Math.min(70, ptr.speed + 5) : 18;
    ptr.lastAt = now;
    var s = ptr.speed, vw = window.innerWidth, vh = window.innerHeight, edge = 36;
    if (dir === K.LEFT) { ptr.x -= s; if (ptr.x < edge) { scrollUnderPointer(-s * 3, 0); } }
    if (dir === K.RIGHT) { ptr.x += s; if (ptr.x > vw - edge) { scrollUnderPointer(s * 3, 0); } }
    if (dir === K.UP) { ptr.y -= s; if (ptr.y < edge) { scrollUnderPointer(0, -s * 4); } }
    if (dir === K.DOWN) { ptr.y += s; if (ptr.y > vh - edge) { scrollUnderPointer(0, s * 4); } }
    ptr.x = Math.max(4, Math.min(vw - 4, ptr.x));
    ptr.y = Math.max(4, Math.min(vh - 4, ptr.y));
    drawPtr();
  }

  function ptrClick() {
    var el = document.elementFromPoint(ptr.x, ptr.y);
    if (!el) return;
    var o = { bubbles: true, cancelable: true, view: window, clientX: ptr.x, clientY: ptr.y };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(function (t) {
      try { el.dispatchEvent(t.indexOf('pointer') === 0 ? new PointerEvent(t, o) : new MouseEvent(t, o)); } catch (e) {}
    });
    try { el.focus({ preventScroll: true }); } catch (e) {}
    try { el.click(); } catch (e) {}
  }

  /* ================= EGYÉB BILLENTYŰK ================= */

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
    var ae = document.activeElement;

    if (code === K.RED) {
      e.preventDefault();
      setPointer(!state.pointer);
      return;
    }
    if (code === K.YELLOW) {
      e.preventDefault();
      state.blocking = !state.blocking;
      saveState(); applyBlockClass();
      toast('Blokkolás: ' + (state.blocking ? 'BE' : 'KI'));
      showBadge(4000);
      return;
    }
    if (code === K.BLUE) {
      e.preventDefault();
      state.zoomIdx = (state.zoomIdx + 1) % ZOOM_STEPS.length;
      saveState(); applyZoom(); dirty = true;
      toast('Nagyítás: ' + Math.round(ZOOM_STEPS[state.zoomIdx] * 100) + '%');
      return;
    }
    if (code === K.ZERO && !isTextField(ae)) {
      e.preventDefault();
      badgePinned = !badgePinned;
      showBadge(5000);
      if (!badgePinned && badgeEl) badgeEl.style.opacity = '0';
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

    var isArrow = (code === K.LEFT || code === K.RIGHT || code === K.UP || code === K.DOWN);

    if (state.pointer) {
      if (isArrow) { e.preventDefault(); e.stopPropagation(); movePtr(code); return; }
      if (code === K.ENTER) { e.preventDefault(); e.stopPropagation(); ptrClick(); return; }
      return;
    }

    if (isArrow) {
      if (isTextField(ae) && (code === K.LEFT || code === K.RIGHT)) {
        try {
          var len = (ae.value || '').length;
          if (code === K.LEFT && ae.selectionStart > 0) return;
          if (code === K.RIGHT && ae.selectionEnd < len) return;
        } catch (err) { return; }
      }
      if (e.repeat && Date.now() - lastMoveAt < 80) { e.preventDefault(); return; }
      var res = moveFocus(code);
      if (res === null) {
        // nincs kijelölhető elem: átváltunk kurzor módra
        setPointer(true, true);
        toast('Nincs kijelölhető elem, kurzor mód (PIROS = váltás)');
        e.preventDefault(); e.stopPropagation();
        movePtr(code);
        return;
      }
      if (res) { e.preventDefault(); e.stopPropagation(); }
      return;
    }

    if (code === K.ENTER) {
      if (current && current.isConnected && (!ae || ae === document.body || ae === current || !isTextField(ae))) {
        var t = current.tagName;
        if (t !== 'A' && t !== 'BUTTON') {
          e.preventDefault();
          activateCurrent();
        }
      }
    }
  }, true);

  /* ================= INDÍTÁS ================= */

  var sweepTimer = null;
  function onMutation() {
    dirty = true;
    if (current && !current.isConnected) setCurrent(null);
    if (sweepTimer) return;
    sweepTimer = setTimeout(function () { sweepTimer = null; sweep(); }, 700);
  }

  var lastHref = location.href;
  function watchUrl() {
    if (location.href !== lastHref) {
      lastHref = location.href;
      dirty = true; stickX = null; setCurrent(null);
      showBadge(5000);
    }
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
    setInterval(watchUrl, 800);
    setTimeout(function () {
      showBadge(8000);
      var list = getFocusables();
      if (!current && list.length) {
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

/*
 * 7Reels TizenBrew modul
 * - távirányítós (nyilak / OK / Back / média gombok) navigáció
 * - pop-up és átirányítás tiltás
 * - kozmetikai adblock + ismert reklámhostok blokkolása
 */
(function () {
  'use strict';
  if (window.__reelsTvLoaded) return;
  window.__reelsTvLoaded = true;

  /* ================= BEÁLLÍTÁSOK ================= */

  // Az oldal saját hostjai (aldomainekkel együtt). Ide tartozó linkek engedettek.
  var OWN_HOSTS = ['7reels.cc'];

  // Külső linkek tiltása (target=_blank és idegen host). Ha valami legitim
  // linket is levág, állítsd false-ra.
  var BLOCK_EXTERNAL_LINKS = true;

  // Ismert reklámhálózatok. Ezekből nem töltődik be script, iframe, kép,
  // és a fetch/XHR kérések is megszakadnak. Bővítheted az oldalon látott
  // domainekkel.
  var BLOCKED_HOSTS = [
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'adservice.google.com', 'popads.net', 'popcash.net', 'propellerads.com',
    'exoclick.com', 'juicyads.com', 'trafficjunky.com', 'clickadu.com',
    'hilltopads.net', 'adcash.com', 'a-ads.com', 'admaven.com', 'adsterra.com',
    'onclickads.net', 'adnxs.com', 'taboola.com', 'outbrain.com',
    'histats.com', 'mc.yandex.ru'
  ];

  // Billentyűkódok
  var K = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009,
    PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, REW: 412, FF: 417
  };

  /* ================= SEGÉDEK ================= */

  function hostOf(url) {
    try { return new URL(url, location.href).hostname.toLowerCase(); }
    catch (e) { return ''; }
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

  var fakeWin = {
    closed: true, focus: function () {}, blur: function () {}, close: function () {},
    document: { write: function () {}, close: function () {} },
    location: { href: '' }
  };
  window.open = function () { return fakeWin; };

  document.addEventListener('click', function (e) {
    if (!BLOCK_EXTERNAL_LINKS) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/^(javascript:|#|mailto:|tel:)/i.test(href)) {
      if (/^javascript:/i.test(href)) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
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
      if (!n || !n.tagName) return false;
      var t = n.tagName;
      if (t === 'SCRIPT' || t === 'IFRAME' || t === 'IMG' || t === 'LINK') {
        return isBlockedUrl(n.src || n.href);
      }
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
        if (isBlockedUrl(url)) return Promise.reject(new TypeError('blocked'));
        return origFetch.apply(this, arguments);
      };
    }
    var origXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (isBlockedUrl(url)) {
        this.__blocked = true;
        arguments[1] = 'about:blank';
      }
      return origXhrOpen.apply(this, arguments);
    };
    var origXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      if (this.__blocked) return;
      return origXhrSend.apply(this, arguments);
    };
  } catch (e) {}

  /* ================= CSS: reklámok elrejtése + fókusz ================= */

  function injectCss() {
    if (document.getElementById('reels-tv-css')) return;
    var css = [
      'ins.adsbygoogle, [id^="google_ads"], [class~="adsbygoogle"],',
      '[class~="ad"], [class~="ads"], [class~="advert"], [class~="adsbox"],',
      '[id="ad"], [id="ads"], [id="adbox"],',
      'iframe[src*="doubleclick"], iframe[src*="googlesyndication"],',
      'iframe[src*="popads"], iframe[src*="exoclick"], iframe[src*="adsterra"],',
      'a[href*="popads"], a[href*="exoclick"], a[href*="adsterra"]',
      '{ display: none !important; visibility: hidden !important; }',
      '*:focus { outline: 4px solid #ffcc00 !important; outline-offset: 2px !important; }',
      'html { scroll-behavior: auto !important; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = 'reels-tv-css';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  injectCss();

  /* ================= TAKARÓ RÉTEGEK ELTÁVOLÍTÁSA ================= */

  // Az átlátszó, teljes képernyős, magas z-indexű rétegek (click-hijack) törlése.
  // Védelem: ha van benne videó, iframe, input vagy gomb, nem nyúlunk hozzá.
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
    if (el.querySelector('video, iframe, input, button, select, textarea')) return false;
    if ((el.textContent || '').trim().length > 20) return false;
    return true;
  }
  function sweep(root) {
    try {
      var nodes = (root && root.querySelectorAll) ? root.querySelectorAll('div, a, section, span') : [];
      for (var i = 0; i < nodes.length; i++) {
        if (looksLikeOverlay(nodes[i])) nodes[i].remove();
      }
      if (root && looksLikeOverlay(root)) root.remove();
    } catch (e) {}
  }
  var sweepTimer = null;
  function scheduleSweep() {
    if (sweepTimer) return;
    sweepTimer = setTimeout(function () {
      sweepTimer = null;
      sweep(document.body);
    }, 600);
  }

  /* ================= TÁVIRÁNYÍTÓS NAVIGÁCIÓ ================= */

  var FOCUS_SEL = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
    '[tabindex]:not([tabindex="-1"])', '[role="button"]', '[role="link"]', '[onclick]'
  ].join(',');

  function isVisible(el) {
    if (!el.getClientRects().length) return false;
    var cs = window.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return false;
    var r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }
  function getFocusables() {
    var all = document.querySelectorAll(FOCUS_SEL);
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (!all[i].disabled && isVisible(all[i])) out.push(all[i]);
    }
    return out;
  }
  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function focusEl(el) {
    if (!el) return;
    if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
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
    var cur = document.activeElement;
    if (!cur || cur === document.body || list.indexOf(cur) === -1) {
      focusEl(pickInitial(list));
      return true;
    }
    var cr = cur.getBoundingClientRect();
    var cc = center(cr);
    var best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === cur) continue;
      var r = el.getBoundingClientRect();
      var c = center(r);
      var dx = c.x - cc.x, dy = c.y - cc.y;
      var primary, secondary;
      if (dir === K.LEFT)  { if (dx >= -2) continue; primary = -dx; secondary = Math.abs(dy); }
      if (dir === K.RIGHT) { if (dx <= 2)  continue; primary = dx;  secondary = Math.abs(dy); }
      if (dir === K.UP)    { if (dy >= -2) continue; primary = -dy; secondary = Math.abs(dx); }
      if (dir === K.DOWN)  { if (dy <= 2)  continue; primary = dy;  secondary = Math.abs(dx); }
      var overlap = (dir === K.LEFT || dir === K.RIGHT)
        ? Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top)
        : Math.min(cr.right, r.right) - Math.max(cr.left, r.left);
      var score = primary + secondary * 2 - (overlap > 0 ? 200 : 0);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { focusEl(best); return true; }
    return false;
  }

  function isTextField(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName;
    if (t === 'TEXTAREA') return true;
    if (t !== 'INPUT') return false;
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

  // true, ha mi kezeltük a Back gombot; false, ha az alapértelmezett
  // viselkedést (kilépés az appból) hagyjuk
  function goBack() {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen();
      return true;
    }
    if (history.length > 1) { history.back(); return true; }
    return false;
  }

  document.addEventListener('keydown', function (e) {
    var code = e.keyCode;
    var active = document.activeElement;

    // Back
    if (code === K.BACK || code === 27) {
      if (goBack()) e.preventDefault();
      return;
    }

    // Média gombok (csak ha van <video> a fő dokumentumban)
    var v = getVideo();
    if (v && (code === K.PLAY || code === K.PAUSE || code === K.PLAYPAUSE || code === K.STOP ||
              code === K.REW || code === K.FF)) {
      e.preventDefault();
      if (code === K.PLAY) v.play();
      else if (code === K.PAUSE || code === K.STOP) v.pause();
      else if (code === K.PLAYPAUSE) { v.paused ? v.play() : v.pause(); }
      else if (code === K.REW) v.currentTime = Math.max(0, v.currentTime - 10);
      else if (code === K.FF) v.currentTime = v.currentTime + 10;
      return;
    }

    // Nyilak
    if (code === K.LEFT || code === K.RIGHT || code === K.UP || code === K.DOWN) {
      // szövegmezőben a kurzor mozgatása maradjon, amíg van hová
      if (isTextField(active) && (code === K.LEFT || code === K.RIGHT)) {
        try {
          var len = (active.value || '').length;
          if (code === K.LEFT && active.selectionStart > 0) return;
          if (code === K.RIGHT && active.selectionEnd < len) return;
        } catch (err) { return; }
      }
      if (moveFocus(code)) { e.preventDefault(); e.stopPropagation(); }
      return;
    }

    // OK: a nem natívan kattintható elemeken kattintást váltunk ki
    if (code === K.ENTER && active && active !== document.body) {
      var t = active.tagName;
      if (t !== 'A' && t !== 'BUTTON' && t !== 'INPUT' && t !== 'SELECT' && t !== 'TEXTAREA') {
        e.preventDefault();
        active.click();
      }
    }
  }, true);

  /* ================= INDÍTÁS ================= */

  function init() {
    injectCss();
    sweep(document.body);
    try {
      new MutationObserver(scheduleSweep).observe(document.documentElement, {
        childList: true, subtree: true
      });
    } catch (e) {}
    // első fókusz, hogy a nyilak azonnal működjenek
    setTimeout(function () {
      if (!document.activeElement || document.activeElement === document.body) {
        var list = getFocusables();
        if (list.length) focusEl(pickInitial(list));
      }
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

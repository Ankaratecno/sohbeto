/* ============================================================
   SOHBETO FLUID TABS  v3 — parmak 1:1 takip eden pager mantığı
   4 ana sekme: sohbetler / kisiler / gruplar / ayarlar
   - Yatay parmak swipe + alt nav tıkla
   - Çok küçük yatay harekette bile sayfa parmağın altına gelir
   - touch-action + pointer capture + rAF batch ile takılmasız hareket
   Motoru / adapter'ı / engine.js'i kirletmez. SADECE bu dosya.
   YÜKLEME: sohbeto-engine.js'TEN SONRA.
   ============================================================ */
(function () {
  'use strict';

  var TABS = ['sohbetler', 'kisiler', 'gruplar', 'ayarlar'];
  var SCREEN_IDS = TABS.map(function (t) { return 'screen-' + t; });

  // Akışkanlık parametreleri — native pager / Telegram benzeri
  var DURATION_MS = 240;              // bırakınca toparlama; takip hızını değil snap'i etkiler
  var EASING = 'cubic-bezier(0.33, 1, 0.68, 1)'; // easeOutCubic — doğal yavaşlama
  var SWIPE_DISTANCE_RATIO = 0.24;    // %24 geçince snap; hafif çekiş takip eder ama kazara geçmez
  var SWIPE_VELOCITY = 0.22;          // px/ms — kısa flick'i kaçırmamak için yumuşak
  var DRAG_RUBBER = 0.42;             // sadece ilk/son sekmede elastik direnç
  var LOCK_START_PX = 2;              // parmak 2px yatay niyet verince takip başlar
  var VERTICAL_LOCK_PX = 10;          // dikey scroll'a karar vermeden önce acele etme
  var HORIZONTAL_BIAS = 0.72;         // küçük dikey titremeyi affet: dx >= dy*0.72 ise yatay
  var VERTICAL_BIAS = 1.25;           // ancak dikey açık ara baskınsa scroll'a bırak

  function ready(fn) {
    function start() {
      var tries = 0;
      (function wait() {
        if (window.app && typeof window.app.navigate === 'function') return fn();
        if (++tries > 60) return fn();
        setTimeout(wait, 50);
      })();
    }
    if (document.readyState === 'complete') setTimeout(start, 0);
    else window.addEventListener('load', start, { once: true });
  }

  function injectStyles() {
    if (document.getElementById('__fluid_tabs_css__')) return;
    var ids = SCREEN_IDS.map(function (id) { return '#' + id; }).join(',');
    var css = [
      // Konteyner: yatay swipe için browser scroll'unu kapat, dikey kalsın
      '.app-container.fluid-mode{overflow:hidden;touch-action:pan-y;overscroll-behavior-x:none;}',
      '.app-container.fluid-mode .screen,.app-container.fluid-mode .content-area{touch-action:pan-y;overscroll-behavior-x:contain;}',
      // 4 ana sekme: yumuşak geçiş + GPU hızlandırma
      ids + '{transition:transform ' + DURATION_MS + 'ms ' + EASING +
            ';will-change:transform;backface-visibility:hidden;}',
      // Drag esnasında transition kapalı (1:1 takip)
      '.app-container.fluid-dragging ' + ids.split(',').join(',.app-container.fluid-dragging ') +
        '{transition:none !important;}',
      // Alt nav tıklamasında anında geçiş (animasyon yok) — deneyim ayarlardan sohbete vb. geçerken hoş olsun
      '.app-container.fluid-instant ' + ids.split(',').join(',.app-container.fluid-instant ') +
        '{transition:none !important;}',
      // Fluid mode'da inactive tab'lar hidden-screen sözleşmesini korur ama görünür çizilir
      '.app-container.fluid-mode ' + SCREEN_IDS.map(function (id) { return '#' + id + '.hidden-screen'; }).join(',.app-container.fluid-mode ') +
        '{opacity:1;transform:none;}',
      // Aktif olmayan sekmeler input almasın
      '.app-container.fluid-mode .fluid-inactive{pointer-events:none !important;}',
    ].join('\n');
    var style = document.createElement('style');
    style.id = '__fluid_tabs_css__';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function getTabScreens() {
    return SCREEN_IDS.map(function (id) { return document.getElementById(id); });
  }

  // ---------- State ----------
  var activeIndex = 0;
  var dragging = false;
  var pointerId = null;
  var dragStartX = 0, dragStartY = 0;
  var dragLastX = 0, dragLastT = 0, dragVelocity = 0;
  var dragDx = 0;
  var horizontalLocked = null;   // null=karar verilmedi, true=yatay, false=dikey
  var containerWidth = 0;
  var appContainer = null;
  var rafId = 0;
  var pendingDx = 0;

  // Sekmeleri yerleştir: aktif=0 ofset, diğerleri ±width.
  // dx=0 ise statik snap; aksi halde drag esnasında.
  function paintTransform(dx) {
    var screens = getTabScreens();
    var w = containerWidth || appContainer.clientWidth || window.innerWidth;
    for (var i = 0; i < screens.length; i++) {
      var el = screens[i];
      if (!el) continue;
      var base = (i - activeIndex) * w;
      var x = base + dx;
      el.style.transform = 'translate3d(' + x + 'px,0,0)';
      el.style.opacity = '1';
    }
  }

  function scheduleDraw(dx) {
    pendingDx = dx;
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = 0;
      paintTransform(pendingDx);
    });
  }

  function setActiveByIndex(idx, animate) {
    idx = Math.max(0, Math.min(TABS.length - 1, idx));
    var changed = idx !== activeIndex;
    activeIndex = idx;
    appContainer.classList.add('fluid-mode');
    var screens = getTabScreens();
    screens.forEach(function (el, i) {
      if (!el) return;
      el.classList.add('hidden-screen');
      el.classList.remove('active');
      if (i === idx) {
        el.classList.remove('hidden-screen', 'fluid-inactive');
        el.classList.add('active');
      } else {
        el.classList.add('fluid-inactive');
      }
    });
    containerWidth = appContainer.clientWidth || window.innerWidth;
    // Nav tap'inde animasyon istenmez (animate=false) — direkt snap. Sadece swipe sonrası akıcı olsun.
    if (animate === false) {
      appContainer.classList.add('fluid-instant');
      paintTransform(0);
      // 2 frame sonra transition'ı geri aç
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          appContainer.classList.remove('fluid-instant');
        });
      });
    } else {
      paintTransform(0);
    }

    // Alt nav state
    try {
      document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
      var navEl = document.getElementById('nav-' + TABS[idx]);
      if (navEl) navEl.classList.add('active');
    } catch (e) {}

    if (changed) {
      var name = TABS[idx];
      try {
        if (name === 'kisiler' && typeof window.renderContacts === 'function') window.renderContacts();
        if (name === 'sohbetler' && typeof window.renderConvList === 'function') window.renderConvList();
      } catch (e) {}
    }
  }

  function leaveFluidMode() {
    if (!appContainer) return;
    appContainer.classList.remove('fluid-mode');
    appContainer.classList.remove('fluid-dragging');
    var screens = getTabScreens();
    screens.forEach(function (el, i) {
      if (!el) return;
      el.style.transform = '';
      el.style.opacity = '';
      el.classList.remove('fluid-inactive');
      if (i !== activeIndex) el.classList.add('hidden-screen');
    });
  }

  // ---------- app.navigate köprüsü ----------
  // Ayarlar > Tema / Hesap / Gizlilik açıkken alt nav'a tıklanınca bu overlay'ler
  // .active kalıp ana sekmenin üstünü kaplıyordu. Tab geçişinden ÖNCE her zaman
  // bu sub-screen overlay'lerini kapatıyoruz ki Sohbetler/Kişiler/Gruplar/Ayarlar'a
  // tıklamak her durumda doğrudan o sekmeye götürsün.
  var SUBSCREEN_IDS = ['screen-tema', 'screen-hesap', 'screen-gizlilik', 'screen-notes', 'screen-calls', 'screen-inbox'];
  function closeSettingsSubscreens() {
    SUBSCREEN_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.classList.add('hidden-screen'); el.classList.remove('active'); }
    });
  }
  function patchNavigate() {
    var orig = (window.app && window.app.navigate) ? window.app.navigate : null;
    window.app = window.app || {};
    window.app.navigate = function (target) {
      var idx = TABS.indexOf(target);
      if (idx !== -1) {
        // Ana sekmeye geçiş — açık alt sayfa varsa kapat
        closeSettingsSubscreens();
      }
      if (idx === -1) {
        leaveFluidMode();
        if (typeof orig === 'function') return orig.apply(this, arguments);
        document.querySelectorAll('.app-container > .screen').forEach(function (s) {
          s.classList.add('hidden-screen'); s.classList.remove('active');
        });
        var t = document.getElementById('screen-' + target) || document.getElementById(target);
        if (t) { t.classList.remove('hidden-screen'); t.classList.add('active'); }
        return;
      }
      // Alt nav butonuna basıldığında animasyonsuz, anında geçiş.
      setActiveByIndex(idx, false);
    };
  }

  // ---------- Pointer / touch ----------
  function shouldIgnoreTarget(target) {
    if (!target) return false;
    var tag = (target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (target.isContentEditable) return true;
    // Yatay scroll edebilen iç element üstündeysek bırak (örn. story carousel)
    var el = target;
    while (el && el !== appContainer) {
      try {
        var ov = getComputedStyle(el).overflowX;
        if ((ov === 'auto' || ov === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
      } catch (e) {}
      el = el.parentElement;
    }
    return false;
  }

  function isFluidMode() {
    return appContainer && appContainer.classList.contains('fluid-mode');
  }

  function getX(e) { return e.touches ? e.touches[0].clientX : e.clientX; }
  function getY(e) { return e.touches ? e.touches[0].clientY : e.clientY; }

  function onStart(e) {
    if (!isFluidMode()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.touches && e.touches.length > 1) return;
    if (shouldIgnoreTarget(e.target)) return;
    dragStartX = dragLastX = getX(e);
    dragStartY = getY(e);
    dragLastT = performance.now();
    dragVelocity = 0;
    dragDx = 0;
    horizontalLocked = null;
    dragging = true;
    pointerId = e.pointerId != null ? e.pointerId : null;
    containerWidth = appContainer.clientWidth || window.innerWidth;
  }

  function onMove(e) {
    if (!dragging) return;
    var x = getX(e), y = getY(e);
    var dx = x - dragStartX, dy = y - dragStartY;

    if (horizontalLocked === null) {
      var ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax < LOCK_START_PX && ay < VERTICAL_LOCK_PX) return;
      if (ay > VERTICAL_LOCK_PX && ay > ax * VERTICAL_BIAS) {
        horizontalLocked = false;
        dragging = false;
        return;
      }
      if (ax >= LOCK_START_PX && ax >= ay * HORIZONTAL_BIAS) {
        horizontalLocked = true;
        appContainer.classList.add('fluid-dragging');
        // Parmak konteyner dışına çıksa bile event'leri burada toplamaya devam et
        if (pointerId != null && appContainer.setPointerCapture) {
          try { appContainer.setPointerCapture(pointerId); } catch (err) {}
        }
      } else {
        horizontalLocked = false;
        dragging = false;
        return;
      }
    }
    if (!horizontalLocked) return;
    if (e.cancelable) e.preventDefault();

    // Kenarlarda elastik direnç
    var atLeft = activeIndex === 0 && dx > 0;
    var atRight = activeIndex === TABS.length - 1 && dx < 0;
    var effectiveDx = (atLeft || atRight) ? dx * DRAG_RUBBER : dx;
    dragDx = effectiveDx;

    scheduleDraw(effectiveDx);

    // Hız ölçümü
    var now = performance.now();
    var dt = now - dragLastT;
    if (dt > 0) dragVelocity = (x - dragLastX) / dt;
    dragLastX = x;
    dragLastT = now;
  }

  function onEnd(e) {
    if (!dragging) { horizontalLocked = null; return; }
    var wasHoriz = horizontalLocked === true;
    dragging = false;
    horizontalLocked = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      paintTransform(dragDx);
    }
    appContainer.classList.remove('fluid-dragging');
    if (pointerId != null && appContainer.releasePointerCapture) {
      try { appContainer.releasePointerCapture(pointerId); } catch (err) {}
    }
    pointerId = null;
    if (!wasHoriz) return;

    var dx = dragDx || (dragLastX - dragStartX);
    var rawDx = dragLastX - dragStartX;
    var absDx = Math.abs(dx);
    var ratio = absDx / (containerWidth || 1);
    var fastFlick = Math.abs(dragVelocity) > SWIPE_VELOCITY && Math.abs(rawDx) > 8;
    var nextIdx = activeIndex;
    if (ratio > SWIPE_DISTANCE_RATIO || fastFlick) {
      if (rawDx < 0 && activeIndex < TABS.length - 1) nextIdx = activeIndex + 1;
      else if (rawDx > 0 && activeIndex > 0) nextIdx = activeIndex - 1;
    }
    setActiveByIndex(nextIdx, true);
  }

  function bindGestures() {
    if (!appContainer) return;
    if (window.PointerEvent) {
      appContainer.addEventListener('pointerdown', onStart, { passive: true });
      appContainer.addEventListener('pointermove', onMove, { passive: false });
      appContainer.addEventListener('pointerup', onEnd, { passive: true });
      appContainer.addEventListener('pointercancel', onEnd, { passive: true });
    } else {
      appContainer.addEventListener('touchstart', onStart, { passive: true });
      appContainer.addEventListener('touchmove', onMove, { passive: false });
      appContainer.addEventListener('touchend', onEnd, { passive: true });
      appContainer.addEventListener('touchcancel', onEnd, { passive: true });
    }
    // Yeniden boyutlanmada snap'i koru
    window.addEventListener('resize', function () {
      if (!isFluidMode()) return;
      containerWidth = appContainer.clientWidth || window.innerWidth;
      paintTransform(0);
    });
  }

  // Bottom-nav görünür olduğunda fluid mode'u devreye al
  function watchNavReady() {
    var nav = document.getElementById('bottom-nav');
    if (!nav) return;
    var tryEnable = function () {
      if (nav.dataset.enabled === '1') {
        var current = 0;
        TABS.forEach(function (t, i) {
          var el = document.getElementById('nav-' + t);
          if (el && el.classList.contains('active')) current = i;
        });
        var visibleTab = SCREEN_IDS.findIndex(function (id) {
          var el = document.getElementById(id);
          return el && !el.classList.contains('hidden-screen');
        });
        if (visibleTab !== -1) setActiveByIndex(visibleTab, false);
        else setActiveByIndex(current, false);
      }
    };
    var obs = new MutationObserver(tryEnable);
    obs.observe(nav, { attributes: true, attributeFilter: ['data-enabled', 'style'] });
    tryEnable();
  }

  ready(function () {
    appContainer = document.querySelector('.app-container');
    if (!appContainer) {
      console.warn('[fluid-tabs] .app-container bulunamadı, devre dışı.');
      return;
    }
    injectStyles();
    patchNavigate();
    bindGestures();
    watchNavReady();
  });
})();

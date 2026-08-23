/* =====================================================================
   SOHBETO SHELL UI — Görünüm (Açık / Gece) ve Yazı Tipi tercihleri.
   Tema ekranına iki bölüm ekler; motora/adapter'a dokunmaz.
   ===================================================================== */
(function () {
  'use strict';

  var LS_MODE = 'sohbeto.ui.mode';   // 'light' | 'dark'
  var LS_FONT = 'sohbeto.ui.font';   // 'manrope' | 'inter'
  var LS_BG   = 'sohbeto.ui.bg';     // 'plain' | 'aurora'

  function get(key, def) {
    try { return localStorage.getItem(key) || def; } catch (e) { return def; }
  }
  function set(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }

  function applyMode(mode) {
    document.documentElement.classList.toggle('sb-dark', mode === 'dark');
    set(LS_MODE, mode);
    syncButtons();
    // Gece modunda sohbet penceresi varsayılan olarak düz siyah olsun.
    try { if (window.sbChatBgForMode) window.sbChatBgForMode(mode); } catch (e) {}
    try { if (window.sbSyncStatusBar) window.sbSyncStatusBar(); } catch (e) {}
  }
  function applyFont(font) {
    document.documentElement.classList.toggle('sb-font-inter', font === 'inter');
    set(LS_FONT, font);
    syncButtons();
  }

  function applyBg(bg) {
    document.documentElement.classList.toggle('sb-bg-aurora', bg === 'aurora');
    set(LS_BG, bg);
    syncButtons();
  }

  function syncButtons() {
    var mode = get(LS_MODE, 'light');
    var font = get(LS_FONT, 'manrope');
    var bg = get(LS_BG, 'plain');
    document.querySelectorAll('.sb-pick[data-bg]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.bg === bg);
    });
    document.querySelectorAll('.sb-pick[data-mode]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    document.querySelectorAll('.sb-pick[data-font]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.font === font);
    });
  }

  function injectSections() {
    var screen = document.getElementById('screen-tema');
    if (!screen || document.getElementById('sb-appearance-section')) return;
    var content = screen.querySelector('.content-area');
    if (!content) return;

    var wrap = document.createElement('div');
    wrap.id = 'sb-appearance-section';
    wrap.innerHTML =
      '<div class="settings-section"><h3>Görünüm</h3><div class="sb-pick-row">' +
      '<button type="button" class="sb-pick" data-mode="light">Açık</button>' +
      '<button type="button" class="sb-pick" data-mode="dark">Gece</button>' +
      '</div></div>' +
      '<div class="settings-section"><h3>Yazı Tipi</h3><div class="sb-pick-row">' +
      '<button type="button" class="sb-pick" data-font="manrope" style="font-family:Manrope,sans-serif">Manrope</button>' +
      '<button type="button" class="sb-pick" data-font="inter" style="font-family:Inter,sans-serif">Inter</button>' +
      '</div></div>' +
      '<div class="settings-section"><h3>Arka Plan</h3><div class="sb-pick-row">' +
      '<button type="button" class="sb-pick" data-bg="plain">Düz</button>' +
      '<button type="button" class="sb-pick" data-bg="aurora">Manzara</button>' +
      '</div></div>';

    // Vurgu Rengi bölümünden hemen sonra yerleştir
    var firstSection = content.querySelector('.settings-section');
    if (firstSection && firstSection.parentNode) {
      firstSection.parentNode.insertBefore(wrap, firstSection);
    } else {
      content.appendChild(wrap);
    }

    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.sb-pick') : null;
      if (!btn) return;
      if (btn.dataset.mode) applyMode(btn.dataset.mode);
      if (btn.dataset.font) applyFont(btn.dataset.font);
      if (btn.dataset.bg) applyBg(btn.dataset.bg);
    });
    syncButtons();
  }

  // Tercihleri olabildiğince erken uygula (FOUC olmasın)
  applyMode(get(LS_MODE, 'light'));
  applyFont(get(LS_FONT, 'manrope'));
  applyBg(get(LS_BG, 'plain'));

  // ---------------- Açılır arama (büyüteç) ----------------
  function searchIcon(open) {
    return open
      ? '<i class="fa-solid fa-xmark"></i>'
      : '<i class="fa-solid fa-magnifying-glass"></i>';
  }

  function injectSearchButtons() {
    ['screen-sohbetler', 'screen-kisiler', 'screen-gruplar'].forEach(function (id) {
      var screen = document.getElementById(id);
      if (!screen || !screen.querySelector('.search-container')) return;
      var header = screen.querySelector('.main-header');
      if (!header || header.querySelector('.sb-search-btn')) return;
      var btn = document.createElement('div');
      btn.className = 'hdr-icon sb-search-btn';
      btn.setAttribute('aria-label', 'Ara');
      btn.innerHTML = searchIcon(false);
      var icons = header.querySelector('.hdr-icons');
      var plus = header.querySelector('.header-icon');
      if (icons) header.insertBefore(btn, icons);        // Sohbetler: başlık | büyüteç | ikonlar
      else if (plus) header.insertBefore(btn, plus);      // Kişiler/Gruplar: büyüteç solda, + en sağda
      else header.appendChild(btn);
    });
  }

  function toggleSearch(screen) {
    var open = screen.classList.toggle('sb-search-open');
    var btn = screen.querySelector('.sb-search-btn');
    if (btn) btn.innerHTML = searchIcon(open);
    var input = screen.querySelector('.search-box input');
    if (input) {
      if (open) setTimeout(function () { input.focus(); }, 40);
      else if (input.value) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.sb-search-btn') : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var screen = btn.closest('.screen');
    if (screen) toggleSearch(screen);
  }, true);


  // ---------------- Yeni Kişi: e-posta alanı ----------------
  var EMAIL_KEY = 'sohbeto.contact.emails';
  function emailMap() {
    try { return JSON.parse(localStorage.getItem(EMAIL_KEY) || '{}'); } catch (e) { return {}; }
  }
  function wrapContactFns() {
    if (window.__sbContactWrapped) return;
    if (typeof window.openAddContact !== 'function' || typeof window.saveContact !== 'function') return;
    window.__sbContactWrapped = true;
    var origOpen = window.openAddContact;
    window.openAddContact = function () {
      var r = origOpen.apply(this, arguments);
      var em = document.getElementById('newContactEmail');
      if (em) em.value = '';
      return r;
    };
    var origSave = window.saveContact;
    window.saveContact = function () {
      var em = document.getElementById('newContactEmail');
      var ph = document.getElementById('newContactPhone');
      var mail = (em && em.value || '').trim();
      var num = (ph && ph.value || '').trim();
      var res = origSave.apply(this, arguments);
      if (mail && num) {
        try {
          var m = emailMap(); m[num] = mail;
          localStorage.setItem(EMAIL_KEY, JSON.stringify(m));
        } catch (e) {}
      }
      return res;
    };
  }
  setInterval(wrapContactFns, 800);
  wrapContactFns();

  function ready() {
    // OO sohbet tema motoru yüklendikten sonra moda uygun zemini tekrar uygula
    try { if (window.sbChatBgForMode) window.sbChatBgForMode(get(LS_MODE, 'light')); } catch (e) {}
    injectSections();
    injectSearchButtons();
    setInterval(injectSearchButtons, 1200);
    var nav = document.getElementById('screen-tema');
    if (nav) {
      new MutationObserver(injectSections).observe(nav, { attributes: true, attributeFilter: ['class'] });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();

/* =====================================================================
   SOHBETO SHELL UI — Görünüm (Açık / Gece) ve Yazı Tipi tercihleri.
   Tema ekranına iki bölüm ekler; motora/adapter'a dokunmaz.
   ===================================================================== */
(function () {
  'use strict';

  var LS_MODE = 'sohbeto.ui.mode';   // 'light' | 'dark'
  var LS_FONT = 'sohbeto.ui.font';   // 'manrope' | 'inter'

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


  function syncButtons() {
    var mode = get(LS_MODE, 'light');
    var font = get(LS_FONT, 'manrope');
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
      '<button type="button" class="sb-pick active">Standart</button>' +
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
    });
    syncButtons();
  }

  // Tercihleri olabildiğince erken uygula (FOUC olmasın)
  applyMode(get(LS_MODE, 'light'));
  applyFont(get(LS_FONT, 'manrope'));

  // ---------------- Açılır arama (büyüteç) ----------------
  function searchIcon(open) {
    return open
      ? '<i class="fa-solid fa-xmark"></i>'
      : '<i class="fa-solid fa-magnifying-glass"></i>';
  }

  function injectSearchButtons() {
    ['screen-sohbetler', 'screen-kisiler'].forEach(function (id) {
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

  // ---------------- Sohbetler hızlı ekleme + yeni ana ekranlar ----------------
  var lastMainScreen = 'sohbetler';

  window.sbOpenSettings = function (from) {
    lastMainScreen = from || lastMainScreen;
    if (window.app && typeof window.app.navigate === 'function') window.app.navigate('ayarlar');
  };

  function ensureSettingsBack() {
    var header = document.querySelector('#screen-ayarlar .main-header');
    if (!header || header.querySelector('.sb-settings-back')) return;
    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'sb-head-action sb-settings-back';
    back.setAttribute('aria-label', 'Geri');
    back.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';
    back.addEventListener('click', function () {
      if (window.app && typeof window.app.navigate === 'function') window.app.navigate(lastMainScreen);
    });
    header.insertBefore(back, header.firstChild);
  }

  function ensureQuickAdd() {
    var add = document.getElementById('sb-chat-add');
    if (!add || add.dataset.bound === '1') return;
    add.dataset.bound = '1';
    add.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      document.body.classList.toggle('sb-add-open');
    });
    if (!document.getElementById('sb-add-menu')) {
      var menu = document.createElement('div');
      menu.id = 'sb-add-menu';
      menu.className = 'sb-add-menu';
      menu.innerHTML =
        '<button type="button" data-add-action="chat"><i class="fa-regular fa-comment"></i><span>Yeni sohbet</span></button>' +
        '<button type="button" data-add-action="contact"><i class="fa-solid fa-user-plus"></i><span>Kişi ekle</span></button>' +
        '<button type="button" data-add-action="group"><i class="fa-solid fa-users"></i><span>Grup oluştur</span></button>' +
        '<button type="button" data-add-action="settings"><i class="fa-solid fa-gear"></i><span>Ayarlar</span></button>';
      document.querySelector('.app-container').appendChild(menu);
    }
  }

  function bindNewShellActions() {
    if (document.__sbNewShellBound) return;
    document.__sbNewShellBound = true;
    document.addEventListener('click', function (ev) {
      var menu = document.getElementById('sb-add-menu');
      var action = ev.target.closest ? ev.target.closest('[data-add-action]') : null;
      if (action) {
        ev.preventDefault();
        document.body.classList.remove('sb-add-open');
        var kind = action.dataset.addAction;
        if (kind === 'chat') {
          if (window.app && typeof window.app.navigate === 'function') window.app.navigate('kisiler');
        } else if (kind === 'contact') {
          if (typeof window.openAddContact === 'function') window.openAddContact();
        } else if (kind === 'group') {
          if (window.SohbetoExtras && typeof window.SohbetoExtras.openCreateGroup === 'function') window.SohbetoExtras.openCreateGroup();
        } else if (kind === 'settings') window.sbOpenSettings('sohbetler');
        return;
      }
      if (menu && document.body.classList.contains('sb-add-open') && !ev.target.closest('#sb-chat-add')) {
        document.body.classList.remove('sb-add-open');
      }

      var gear = ev.target.closest ? ev.target.closest('.sb-gear') : null;
      if (gear) {
        ev.preventDefault();
        var scr = gear.closest('.screen');
        var from = scr ? (scr.id || '').replace('screen-', '') : 'sohbetler';
        window.sbOpenSettings(from);
        return;
      }

      var eventAdd = ev.target.closest ? ev.target.closest('.sb-event-add') : null;
      if (eventAdd) {
        ev.preventDefault();
        if (window.SohbetoExtras && typeof window.SohbetoExtras.openCreateGroup === 'function') window.SohbetoExtras.openCreateGroup();
        return;
      }

      var eventTab = ev.target.closest ? ev.target.closest('[data-event-view]') : null;

      if (eventTab) {
        document.querySelectorAll('[data-event-view]').forEach(function (b) {
          var active = b === eventTab;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        var groups = eventTab.dataset.eventView === 'groups';
        var eventsView = document.getElementById('events-view');
        var groupsView = document.getElementById('groups-view');
        if (eventsView) eventsView.hidden = groups;
        if (groupsView) groupsView.hidden = !groups;
        if (groups && window.SohbetoExtras && typeof window.SohbetoExtras.renderGroups === 'function') window.SohbetoExtras.renderGroups();
        return;
      }

      var chatFilter = ev.target.closest ? ev.target.closest('[data-chat-filter]') : null;
      if (chatFilter) {
        document.querySelectorAll('[data-chat-filter]').forEach(function (b) { b.classList.toggle('active', b === chatFilter); });
        window.sbApplyChatFilter(chatFilter.dataset.chatFilter || 'all');
        return;
      }

      if (ev.target.closest && ev.target.closest('.sb-event-search')) {
        var eventSearch = document.querySelector('.sb-event-search-box');
        if (eventSearch) {
          eventSearch.hidden = !eventSearch.hidden;
          var input = eventSearch.querySelector('input');
          if (!eventSearch.hidden && input) setTimeout(function () { input.focus(); }, 20);
        }
        return;
      }

      if (ev.target.closest && ev.target.closest('.sb-discover-search')) {
        var discover = document.getElementById('discover-search-wrap');
        if (discover) {
          discover.hidden = !discover.hidden;
          var dinput = discover.querySelector('input');
          if (!discover.hidden && dinput) setTimeout(function () { dinput.focus(); }, 20);
          else if (dinput && dinput.value) { dinput.value = ''; dinput.dispatchEvent(new Event('input', { bubbles: true })); }
        }
      }
    });
  }

  window.sbApplyChatFilter = function (filter) {
    document.querySelectorAll('#screen-sohbetler .content-area .conv-item').forEach(function (row) {
      var hide = (filter === 'unread' && row.dataset.unread !== '1') || filter === 'notes';
      row.style.display = hide ? 'none' : '';
    });
    if (filter === 'notes') {
      if (window.SohbetoExtras && typeof window.SohbetoExtras.openNotes === 'function') window.SohbetoExtras.openNotes();
    }
  };

  // Notlarım seçiliyken başka bir ana ekrana geçilince not defterini kapat
  // ve sohbet listesini "Tümü" filtresine döndür.
  function resetNotesFilter() {
    var notes = document.getElementById('screen-notes');
    if (notes) { notes.classList.remove('active'); notes.classList.add('hidden-screen'); }
    var editor = document.getElementById('note-editor-wrap');
    if (editor) editor.style.display = 'none';
    var pills = document.querySelectorAll('[data-chat-filter]');
    var active = document.querySelector('[data-chat-filter].active');
    if (active && active.dataset.chatFilter === 'notes') {
      pills.forEach(function (b) { b.classList.toggle('active', b.dataset.chatFilter === 'all'); });
      window.sbApplyChatFilter('all');
    }
  }

  function wrapNavigate() {
    if (!window.app || typeof window.app.navigate !== 'function' || window.app.__sbNavWrapped) return;
    var orig = window.app.navigate;
    window.app.navigate = function (screen) {
      if (screen !== 'sohbetler') resetNotesFilter();
      return orig.apply(this, arguments);
    };
    window.app.__sbNavWrapped = true;
  }
  setInterval(wrapNavigate, 600);
  wrapNavigate();


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
    ensureSettingsBack();
    ensureQuickAdd();
    bindNewShellActions();
    setInterval(injectSearchButtons, 1200);
    var nav = document.getElementById('screen-tema');
    if (nav) {
      new MutationObserver(injectSections).observe(nav, { attributes: true, attributeFilter: ['class'] });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();

/* =====================================================================
   SOHBETO SHELL UI — Gece modu tema paleti + hibrit avatar içeriği
   Motor/adapter mantığına dokunmaz; sadece görsel katman.
   ===================================================================== */
(function () {
  'use strict';

  var LS_MODE = 'sohbeto.ui.mode';
  var LS_DARK_THEME = 'sohbeto.ui.darkTheme';
  var LS_LIGHT_THEME = 'sohbeto.oo.theme';

  // Açık mod temaları (adapter ile aynı değerler) — 1. sıra varsayılan: Lagün
  var LIGHT = {
    lagoon: { label: 'Lagün · Açık', primary: '#2f8f83', hover: '#25736a', light: '#d9ede8', bg: '#ffffff' },
    teal:   { label: 'Deniz · Açık',  primary: '#1f7a70', hover: '#175f57', light: '#d3e9e4', bg: '#f7fcfb' },
    ocean:  { label: 'Okyanus · Açık', primary: '#0f766e', hover: '#115e59', light: '#dff7f5', bg: '#f8fffe' },
    forest: { label: 'Orman · Açık', primary: '#0a7c4a', hover: '#08633b', light: '#e6f3eb', bg: '#ffffff' },
    mist:   { label: 'Sis · Açık', primary: '#4c8b82', hover: '#3b6f68', light: '#e4efec', bg: '#fbfdfc' }
  };
  var LIGHT_ORDER = ['lagoon', 'teal', 'ocean', 'forest', 'mist'];

  // Gece modu temaları — 1. sıra varsayılan: Kömür (açık siyah + yumuşak lagün)
  var DARK = {
    charcoal: { label: 'Kömür · Gece', primary: '#4fb3a6', hover: '#3d968b', light: 'rgba(79,179,166,.16)', bg: '#14181c' },
    slate:    { label: 'Kurşun · Gece', primary: '#7fa8cf', hover: '#6a8fb3', light: 'rgba(127,168,207,.16)', bg: '#151a20' },
    graphite: { label: 'Grafit · Gece', primary: '#a9b4bf', hover: '#8d98a3', light: 'rgba(169,180,191,.16)', bg: '#16191c' },
    plum:     { label: 'Erik · Gece', primary: '#a98bd8', hover: '#8e72bb', light: 'rgba(169,139,216,.16)', bg: '#17151d' },
    ember:    { label: 'Kor · Gece', primary: '#e59267', hover: '#c1794f', light: 'rgba(229,146,103,.16)', bg: '#1a1614' }
  };
  var DARK_ORDER = ['charcoal', 'slate', 'graphite', 'plum', 'ember'];

  function ls(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function isDark() { return document.documentElement.classList.contains('sb-dark'); }

  function applyPalette(name) {
    var dark = isDark();
    var table = dark ? DARK : LIGHT;
    var theme = table[name] || table[dark ? 'charcoal' : 'lagoon'];
    var root = document.documentElement;
    root.style.setProperty('--primary-green', theme.primary);
    root.style.setProperty('--primary-green-hover', theme.hover);
    root.style.setProperty('--light-green-bg', theme.light);
    if (dark) {
      root.style.setProperty('--sb-dark-bg', theme.bg);
      save(LS_DARK_THEME, name);
    } else {
      root.style.setProperty('--bg-white', theme.bg);
      save(LS_LIGHT_THEME, name);
    }
    var title = document.getElementById('current-theme-name');
    if (title) title.textContent = theme.label;
    markActive(name);
    try { if (window.sbSyncStatusBar) window.sbSyncStatusBar(); } catch (e) {}
  }

  function markActive(name) {
    document.querySelectorAll('#primary-colors .color-swatch, #bg-colors .color-swatch')
      .forEach(function (el) { el.classList.toggle('active', el.dataset.theme === name); });
  }

  function renderPalettes() {
    var dark = isDark();
    var table = dark ? DARK : LIGHT;
    var order = dark ? DARK_ORDER : LIGHT_ORDER;
    var current = currentName();
    [['primary-colors', 'primary'], ['bg-colors', 'bg']].forEach(function (pair) {
      var wrap = document.getElementById(pair[0]);
      if (!wrap) return;
      wrap.innerHTML = order.map(function (n) {
        var t = table[n];
        var c = pair[1] === 'bg' ? t.bg : t.primary;
        return '<button type="button" class="color-swatch" data-theme="' + n + '" style="background:' + c +
          '" aria-label="' + t.label + '"></button>';
      }).join('');
      wrap.querySelectorAll('.color-swatch').forEach(function (btn) {
        btn.addEventListener('click', function () { applyPalette(btn.dataset.theme); });
      });
    });
    markActive(current);
  }

  function currentName() {
    return isDark()
      ? (DARK[ls(LS_DARK_THEME, '')] ? ls(LS_DARK_THEME, '') : 'charcoal')
      : (LIGHT[ls(LS_LIGHT_THEME, '')] ? ls(LS_LIGHT_THEME, '') : 'lagoon');
  }

  // Mod değişiminde o modun varsayılan/son temasını uygula
  function syncModeTheme() { applyPalette(currentName()); renderPalettes(); }

  var lastDark = isDark();
  new MutationObserver(function () {
    var d = isDark();
    if (d !== lastDark) { lastDark = d; syncModeTheme(); }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // Tema ekranı açılışında paleti bizim setimizle bas
  function wrapOpen() {
    if (!window.app || typeof window.app.openThemeSettings !== 'function' || window.app.__sbThemeWrapped) return;
    var orig = window.app.openThemeSettings;
    window.app.openThemeSettings = function () {
      var r = orig.apply(this, arguments);
      setTimeout(syncModeTheme, 0);
      return r;
    };
    window.app.__sbThemeWrapped = true;
  }
  setInterval(wrapOpen, 700);
  wrapOpen();

  // ---------- Rehberde olmayan kişi: baş harf yerine kişi simgesi ----------
  var USER_ICON = '<i class="fa-solid fa-user sb-av-icon"></i>';
  function fixAvatars() {
    document.querySelectorAll('#screen-sohbetler .conv-avatar, .contact-avatar').forEach(function (el) {
      if (el.querySelector('img') || el.querySelector('.sb-av-icon')) return;
      var txt = (el.textContent || '').trim();
      if (!txt) { el.innerHTML = USER_ICON; return; }
      // Baş harf sayı/“+” içeriyorsa isim rehberde kayıtlı değildir → kişi simgesi
      if (/[0-9+]/.test(txt)) el.innerHTML = USER_ICON;
    });
  }
  new MutationObserver(function () { fixAvatars(); })
    .observe(document.body, { childList: true, subtree: true });
  setInterval(fixAvatars, 1200);
  fixAvatars();

  // İlk yüklemede moda uygun temayı uygula
  setTimeout(syncModeTheme, 300);
})();

/* Native his: giriş alanları dışında metin seçimi ve bağlam menüsü kapalı. */
(function () {
  'use strict';
  function editable(t) {
    if (!t || !t.closest) return false;
    return !!t.closest('input, textarea, [contenteditable="true"], .allow-select');
  }
  document.addEventListener('selectstart', function (e) {
    if (!editable(e.target)) e.preventDefault();
  }, true);
  document.addEventListener('contextmenu', function (e) {
    if (!editable(e.target)) e.preventDefault();
  }, true);
})();

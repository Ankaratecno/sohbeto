/* =====================================================================
   SOHBETO ACCOUNT UI — Hesap ekranı: kullanıcı adı, telefon bilgileri,
   bulunabilirlik tercihleri. Motor dosyalarına dokunmaz.
   ===================================================================== */
(function () {
  'use strict';

  var K_PROFILE = 'sohbeto.oo.profile';
  var K_CREATED = 'sohbeto.oo.account.createdAt';

  function readProfile() {
    try { return JSON.parse(localStorage.getItem(K_PROFILE) || '{}'); } catch (e) { return {}; }
  }
  function writeProfile(patch) {
    try {
      var d = readProfile();
      Object.keys(patch).forEach(function (k) { d[k] = patch[k]; });
      localStorage.setItem(K_PROFILE, JSON.stringify(d));
    } catch (e) {}
  }

  function myNumber() {
    try {
      // Motorun kayıtlı sanal numarası (asıl kaynak): CONFIG.virtualNo
      return (window.CONFIG && window.CONFIG.virtualNo) ||
        (typeof window.myNumber === 'string' ? window.myNumber : '') ||
        (window.state && window.state.myNumber) ||
        localStorage.getItem('sohbeto_push_phone') ||
        localStorage.getItem('sohbeto.oo.profile.number') ||
        localStorage.getItem('sohbet_my_number_v1') || '';
    } catch (e) { return ''; }
  }

  function createdAt() {
    var v = null;
    try { v = localStorage.getItem(K_CREATED); } catch (e) {}
    if (!v) {
      v = new Date().toISOString();
      try { localStorage.setItem(K_CREATED, v); } catch (e) {}
    }
    return v;
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('tr-TR', {
        day: '2-digit', month: 'long', year: 'numeric'
      });
    } catch (e) { return iso; }
  }

  function normalizeUsername(v) {
    return (v || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  }

  function bindToggle(id, key) {
    var el = document.getElementById(id);
    if (!el || el.dataset.bound) return;
    el.dataset.bound = '1';
    var p = readProfile();
    el.checked = p[key] !== false; // varsayılan açık
    el.addEventListener('change', function () {
      var patch = {}; patch[key] = el.checked;
      writeProfile(patch);
    });
  }

  function bindUsername() {
    var el = document.getElementById('accUsername');
    var hint = document.getElementById('accUsernameHint');
    if (!el || el.dataset.bound) return;
    el.dataset.bound = '1';
    var p = readProfile();
    if (p.username && !el.value) el.value = p.username;
    el.addEventListener('input', function () {
      var v = normalizeUsername(el.value);
      if (el.value !== v) el.value = v;
      writeProfile({ username: v });
      if (hint) {
        hint.textContent = v.length === 0
          ? '3–20 karakter · harf, rakam, alt çizgi'
          : (v.length < 3 ? 'En az 3 karakter olmalı' : 'Kullanıcı adın: @' + v);
      }
    });
  }

  var K_QUIET = 'sohbeto.oo.quietHours';
  function readQuiet() {
    try {
      var d = JSON.parse(localStorage.getItem(K_QUIET) || 'null');
      if (d && d.start && d.end) return d;
    } catch (e) {}
    return { start: '22:00', end: '07:00', enabled: true };
  }
  function writeQuiet(q) {
    try { localStorage.setItem(K_QUIET, JSON.stringify(q)); } catch (e) {}
  }
  function bindQuietHours() {
    var s = document.getElementById('quietStart');
    var e2 = document.getElementById('quietEnd');
    var tg = document.getElementById('quietHoursToggle');
    var sub = document.getElementById('quietHoursSubtitle');
    var row = document.getElementById('quietHoursRow');
    if (!s || !e2 || s.dataset.bound) { paintQuiet(); return; }
    s.dataset.bound = '1';
    var q = readQuiet();
    s.value = q.start; e2.value = q.end;
    if (tg) tg.checked = q.enabled !== false;
    function save() {
      writeQuiet({ start: s.value || '22:00', end: e2.value || '07:00', enabled: tg ? tg.checked : true });
      paintQuiet();
    }
    s.addEventListener('change', save);
    e2.addEventListener('change', save);
    if (tg) tg.addEventListener('change', save);
    ['click', 'pointerdown'].forEach(function (ev) {
      if (row) row.addEventListener(ev, function (x) { x.stopPropagation(); });
    });
    paintQuiet();
  }
  function paintQuiet() {
    var q = readQuiet();
    var sub = document.getElementById('quietHoursSubtitle');
    var row = document.getElementById('quietHoursRow');
    if (sub) sub.textContent = q.enabled === false
      ? 'Sessiz saatler · kapalı'
      : 'Sessiz saatler · ' + q.start + '–' + q.end;
    if (row) row.style.display = q.enabled === false ? 'none' : 'flex';
  }

  function bindPushNotifications() {
    var tg = document.getElementById('pushNotifToggle');
    var sub = document.getElementById('pushNotifSubtitle');
    if (!tg || tg.dataset.bound) return;
    tg.dataset.bound = '1';

    function paintPush(enabled, unsupported, permission) {
      if (!sub) return;
      if (unsupported) {
        sub.textContent = 'Bu cihaz desteklemiyor';
        tg.checked = false;
        tg.disabled = true;
        return;
      }
      if (enabled) {
        sub.textContent = 'Açık — yeni mesajlar bildirimle gelir';
        tg.checked = true;
      } else if (permission === 'denied') {
        sub.textContent = 'Tarayıcı izni reddedildi — site ayarlarından açın';
        tg.checked = false;
      } else {
        sub.textContent = 'Kapalı — yeni mesajlar için izin ver';
        tg.checked = false;
      }
    }

    function onMessage(ev) {
      var d = ev.data || {};
      if (d.type !== 'sohbeto:push-status') return;
      paintPush(d.enabled, d.unsupported, d.permission);
    }
    window.addEventListener('message', onMessage);

    tg.addEventListener('change', function () {
      window.parent.postMessage({ type: tg.checked ? 'sohbeto:enable-push' : 'sohbeto:disable-push' }, '*');
    });

    window.parent.postMessage({ type: 'sohbeto:query-push-status' }, '*');
  }

  var _numTries = 0;
  function refresh() {
    var num = document.getElementById('accPhoneNumber');
    var mine = myNumber();
    if (num) num.textContent = mine || 'Kayıtlı numara yok';
    // Motor numarayı IndexedDB'den asenkron yüklüyor: boşsa kısa süre tekrar dene.
    if (!mine && _numTries < 10) { _numTries++; setTimeout(refresh, 600); }
    var cr = document.getElementById('accCreatedAt');
    if (cr) cr.textContent = formatDate(createdAt());
    bindUsername();
    bindToggle('accFindableToggle', 'findableByPhone');
    bindToggle('accFindableUsernameToggle', 'findableByUsername');
    bindQuietHours();
    bindPushNotifications();
  }


  function ready() {
    refresh();
    ['screen-hesap', 'screen-ayarlar'].forEach(function (id) {
      var scr = document.getElementById(id);
      if (scr) {
        new MutationObserver(refresh).observe(scr, { attributes: true, attributeFilter: ['class'] });
      }
    });
    setTimeout(refresh, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();

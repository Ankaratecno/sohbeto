/* =====================================================================
   SOHBETO — KEŞFET EYLEMLERİ (F5 başlangıcı)
   ---------------------------------------------------------------------
   Keşfet ekranına bir "+" düğmesi ekler. Açılan menüde üç eylem var:
     1) Canlı yayın başlat  — Bilgisayarım (PC Ajanı) bağlıysa
        "Telefondan" / "Bilgisayardan (PC gücü)" seçeneği sunulur.
        Bilgisayardan seçilirse telefon görüntüyü TEK akış hâlinde
        ajana yollar; dağıtımı bilgisayar yapar.
     2) Ne dinliyorsun      — cihazdan bir müzik seçilir, "Ne Dinliyor"
        listesinde "Ben" olarak görünür.
     3) Görünür ol          — konum izniyle "Yakındakiler" listesinde
        "Ben" olarak görünür olunur.
   Durum yalnızca cihazda saklanır; kişilere dağıtım (P2P) sonraki adım.
   YÜKLEME: sohbeto-pc.js'TEN SONRA.
   ===================================================================== */
(function () {
  'use strict';

  var LS = 'sohbeto.discover.me';
  var me = read();
  var rec = null;          // MediaRecorder
  var stream = null;       // kamera/mikrofon akışı
  var audioEl = null;      // yerel müzik çalar
  var frameSeq = 0;
  var tick = null;

  function read() {
    try { return JSON.parse(localStorage.getItem(LS) || 'null') || {}; } catch (e) { return {}; }
  }
  function write() {
    try { localStorage.setItem(LS, JSON.stringify(me)); } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function toast(m) {
    try { if (window.app && typeof window.app.showToast === 'function') { window.app.showToast(m); return; } } catch (e) {}
    try { console.log('[Keşfet]', m); } catch (e) {}
  }
  function myName() {
    try {
      var n = (window.state && (window.state.myName || window.state.profileName)) || '';
      return String(n || 'Ben');
    } catch (e) { return 'Ben'; }
  }
  function pc() { return window.SohbetoPC || null; }
  function pcOn() { var p = pc(); return !!(p && p.isConnected && p.isConnected()); }
  function pcName() {
    var p = pc(); var i = p && p.info && p.info();
    return (i && i.name) || 'Bilgisayar';
  }

  /* --------------------------- "+" düğmesi --------------------------- */
  function injectPlus() {
    var screen = document.getElementById('screen-kesfet');
    if (!screen || screen.querySelector('.sb-discover-add')) return;
    var content = screen.querySelector('.sb-discover-content');
    if (!content) return;
    var bar = document.createElement('div');
    bar.className = 'sb-discover-addbar';
    bar.innerHTML =
      '<button type="button" class="sb-discover-add" aria-label="Keşfette paylaş" title="Paylaş">' +
      '<i class="fa-solid fa-plus"></i></button>';
    content.insertBefore(bar, content.firstChild);
  }

  /* ------------------------------ menü ------------------------------ */
  function closeSheet() {
    var el = document.getElementById('sb-discover-sheet');
    if (el) el.remove();
  }

  function openSheet(html) {
    var btn = document.querySelector('.sb-discover-add');
    closeSheet();
    var w = document.createElement('div');
    w.id = 'sb-discover-sheet';
    w.className = 'sb-dmenu-overlay';
    w.innerHTML = '<div class="sb-dmenu">' + html + '</div>';
    document.body.appendChild(w);
    var box = w.firstChild;
    if (btn) {
      var r = btn.getBoundingClientRect();
      box.style.left = Math.max(10, r.left) + 'px';
      box.style.top = (r.bottom + 8) + 'px';
    }
    requestAnimationFrame(function () { w.classList.add('open'); });
    w.addEventListener('click', function (e) { if (e.target === w) closeSheet(); });
  }

  function menuHtml() {
    return '<button type="button" class="sb-dmenu-item" data-dsc="live">' +
      '  <i class="fa-solid fa-tower-broadcast"></i>' +
      '  <span><strong>Canlı yayın başlat</strong><small>' +
      (pcOn() ? esc(pcName()) + ' bağlı — bilgisayardan da başlatabilirsin' : 'Telefondan yayın; bilgisayar bağlıysa PC gücü kullanılır') +
      '</small></span></button>' +
      '<button type="button" class="sb-dmenu-item" data-dsc="music">' +
      '  <i class="fa-solid fa-music"></i>' +
      '  <span><strong>Ne dinliyorsun</strong><small>' +
      (me.music ? 'Şu an: ' + esc(me.music.title) : 'Cihazından bir parça seç') + '</small></span></button>' +
      '<button type="button" class="sb-dmenu-item" data-dsc="near">' +
      '  <i class="fa-solid fa-location-dot"></i>' +
      '  <span><strong>' + (me.nearby ? 'Görünürlüğü kapat' : 'Görünür ol') + '</strong><small>' +
      (me.nearby ? 'Yakındakiler listesinde görünüyorsun' : 'Konum izniyle Yakındakiler listesinde görün') +
      '</small></span></button>' +
      '<input type="file" id="sb-music-input" accept="audio/*" hidden />';
  }

  function liveChoiceHtml() {
    return '<div class="sb-dmenu-title">Yayını nereden başlatalım?</div>' +
      '<button type="button" class="sb-dmenu-item" data-dsc="live-phone">' +
      '  <i class="fa-solid fa-mobile-screen"></i>' +
      '  <span><strong>Telefondan başlat</strong><small>Çekim ve dağıtım telefonda; az izleyici için uygun</small></span></button>' +
      '<button type="button" class="sb-dmenu-item" data-dsc="live-pc"' + (pcOn() ? '' : ' disabled') + '>' +
      '  <i class="fa-solid fa-desktop"></i>' +
      '  <span><strong>Bilgisayardan başlat</strong><small>' +
      (pcOn()
        ? esc(pcName()) + ' dağıtımı üstlenir; telefon tek bağlantı taşır'
        : 'Bilgisayarım ekranından bir bilgisayar bağlaman gerekiyor') +
      '</small></span></button>';
  }

  /* --------------------------- canlı yayın --------------------------- */
  function startLive(mode) {
    if (me.live) { toast('Zaten yayındasın.'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Bu cihazda kamera kullanılamıyor.'); return;
    }
    if (mode === 'pc' && !pcOn()) { toast('Önce Bilgisayarım ekranından bilgisayarını bağla.'); return; }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true }).then(function (st) {
      stream = st;
      me.live = { mode: mode, title: myName() + ' canlı', startedAt: Date.now(), viewers: 0 };
      write();
      if (mode === 'pc') startPcStation(); else renderLists();
      renderLists();
      toast(mode === 'pc' ? 'Yayın bilgisayara aktarılıyor…' : 'Telefondan yayın başladı.');
    }).catch(function () {
      toast('Kamera/mikrofon izni verilmedi.');
    });
  }

  function startPcStation() {
    var p = pc();
    if (!p || !window.MediaRecorder) { toast('Bu cihaz yayın kodlamayı desteklemiyor.'); stopLive(); return; }
    var mime = 'video/webm;codecs=vp8,opus';
    try { if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm'; } catch (e) { mime = 'video/webm'; }
    p.send({ t: 'live-start', title: me.live.title, mime: mime, by: myName() });
    frameSeq = 0;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1200000 });
    } catch (e) { toast('Yayın başlatılamadı.'); stopLive(); return; }
    rec.ondataavailable = function (ev) {
      if (!ev.data || !ev.data.size || !pcOn()) return;
      var fr = new FileReader();
      fr.onload = function () {
        var b = new Uint8Array(fr.result), s = '', c = 0x8000;
        for (var i = 0; i < b.length; i += c) s += String.fromCharCode.apply(null, b.subarray(i, i + c));
        p.send({ t: 'frame', seq: frameSeq++, data: btoa(s) });
      };
      fr.readAsArrayBuffer(ev.data);
    };
    rec.start(1000);
  }

  function stopLive() {
    if (rec) { try { rec.stop(); } catch (e) {} rec = null; }
    if (stream) { stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); stream = null; }
    if (me.live && me.live.mode === 'pc' && pcOn()) { try { pc().send({ t: 'live-stop' }); } catch (e) {} }
    me.live = null;
    write();
    renderLists();
    toast('Yayın sonlandırıldı.');
  }

  /* ---------------------------- ne dinliyor -------------------------- */
  function pickMusic() {
    var input = document.getElementById('sb-music-input');
    if (!input) return;
    input.value = '';
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var title = f.name.replace(/\.[a-z0-9]+$/i, '');
      me.music = { title: title, since: Date.now(), playing: true };
      write();
      try {
        if (audioEl) { audioEl.pause(); URL.revokeObjectURL(audioEl.src); }
        audioEl = new Audio(URL.createObjectURL(f));
        audioEl.play().catch(function () {});
        audioEl.onended = function () { stopMusic(); };
      } catch (e) {}
      closeSheet();
      renderLists();
      toast('Ne dinliyor listesinde göründün.');
    };
    input.click();
  }

  function stopMusic() {
    if (audioEl) { try { audioEl.pause(); } catch (e) {} audioEl = null; }
    me.music = null;
    write();
    renderLists();
  }

  /* ---------------------------- görünür ol --------------------------- */
  function toggleNearby() {
    if (me.nearby) { me.nearby = null; write(); renderLists(); toast('Artık yakındakilerde görünmüyorsun.'); return; }
    if (!navigator.geolocation) { toast('Bu cihazda konum kullanılamıyor.'); return; }
    toast('Konum izni isteniyor…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      me.nearby = {
        lat: Math.round(pos.coords.latitude * 1000) / 1000,
        lon: Math.round(pos.coords.longitude * 1000) / 1000,
        since: Date.now()
      };
      write();
      renderLists();
      toast('Yakındakiler listesinde görünüyorsun.');
    }, function () {
      toast('Konum izni verilmedi.');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }

  /* ------------------------------ listeler --------------------------- */
  function row(icon, title, sub, action, label) {
    return '<div class="sb-dcard">' +
      '  <i class="fa-solid ' + icon + '"></i>' +
      '  <div class="sb-dcard-txt"><strong>' + esc(title) + '</strong><small>' + esc(sub) + '</small></div>' +
      '  <button type="button" class="btn-ghost sb-dcard-btn" data-dsc="' + action + '">' + esc(label) + '</button>' +
      '</div>';
  }

  function fill(listId, emptyId, html) {
    var list = document.getElementById(listId), empty = document.getElementById(emptyId);
    if (!list) return;
    list.innerHTML = html;
    if (empty) empty.hidden = !!html;
  }

  function renderLists() {
    var liveHtml = '';
    if (me.live) {
      liveHtml = row('fa-tower-broadcast', myName() + ' (Ben)',
        me.live.mode === 'pc' ? pcName() + ' üzerinden yayında' : 'Telefondan yayında',
        'live-stop', 'Bitir');
    }
    fill('discover-live-list', 'discover-live-empty', liveHtml);

    var musicHtml = me.music
      ? row('fa-music', myName() + ' (Ben)', me.music.title, 'music-stop', 'Durdur')
      : '';
    fill('discover-music-list', 'discover-music-empty', musicHtml);

    var nearHtml = me.nearby
      ? row('fa-location-dot', myName() + ' (Ben)', 'Görünürsün • yaklaşık konum ' + me.nearby.lat + ', ' + me.nearby.lon,
            'near-off', 'Gizlen')
      : '';
    fill('discover-nearby-list', 'discover-nearby-empty', nearHtml);
  }

  /* ------------------------------ olaylar ---------------------------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target : null;
    if (!t) return;

    if (t.closest('.sb-discover-add')) { ev.preventDefault(); openSheet(menuHtml()); return; }

    var btn = t.closest('[data-dsc]');
    if (!btn || btn.disabled) return;
    ev.preventDefault();
    var a = btn.dataset.dsc;

    if (a === 'live') { if (me.live) { closeSheet(); stopLive(); } else openSheet(liveChoiceHtml()); }
    else if (a === 'live-phone') { closeSheet(); startLive('phone'); }
    else if (a === 'live-pc') { closeSheet(); startLive('pc'); }
    else if (a === 'live-stop') { stopLive(); }
    else if (a === 'music') { if (me.music) { closeSheet(); stopMusic(); } else pickMusic(); }
    else if (a === 'music-stop') { stopMusic(); }
    else if (a === 'near') { closeSheet(); toggleNearby(); }
    else if (a === 'near-off') { toggleNearby(); }
  });

  // Ajan yayın durumu bildirirse izleyici sayısını göster
  if (window.SohbetoPC && window.SohbetoPC.on) {
    window.SohbetoPC.on(function (msg) {
      if (msg && msg.t === 'live-stat' && me.live) {
        me.live.viewers = msg.viewers || 0;
        renderLists();
      }
    });
  }

  function boot() { injectPlus(); renderLists(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  tick = setInterval(boot, 1200);

  window.SohbetoDiscover = {
    state: function () { return me; },
    stopLive: stopLive,
    stopMusic: stopMusic,
    render: renderLists
  };
})();

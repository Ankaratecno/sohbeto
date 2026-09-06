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

   REHBERE DAĞITIM (P2P):
     - Yayın/müzik başlarken rehberdeki herkese "[DSC]" işaretli küçük bir
       duyuru metni gider (t: 'live' | 'music' | 'stop').
     - Duyuruyu alan kişide Keşfet listesinde satır belirir: "İzle" / "Dinle".
     - Kullanıcı düğmeye basınca yayıncıya "[DSC]{t:'want'}" gider; yayıncı
       o kişiye canlı akışı PeerJS medya çağrısıyla (metadata.dsc) açar.
     - Akış gelince izleyicide tam ekran oynatıcı açılır (video ya da ses).
     - Yayıncı bitirdiğinde "stop" duyurusu gider, oynatıcı kapanır.
   YÜKLEME: sohbeto-pc.js'TEN SONRA.
   ===================================================================== */
(function () {
  'use strict';

  var LS = 'sohbeto.discover.me';
  var MARK = '[DSC]';
  var me = read();
  // Uygulama yeniden açıldığında akışlar kapandığı için yayın/müzik sıfırlanır.
  if (me.live || me.music) { me.live = null; me.music = null; try { localStorage.setItem(LS, JSON.stringify(me)); } catch (e) {} }

  var rec = null;          // MediaRecorder (PC ajanına aktarım)
  var stream = null;       // kamera/mikrofon akışı
  var shareStream = null;  // rehbere dağıtılan akış (yayın veya müzik)
  var audioEl = null;      // yerel müzik çalar
  var audioCtx = null;
  var outCalls = new Map();// connId -> PeerJS media call (yayıncı tarafı)
  var remotes = new Map(); // connId -> { kind, title, name, call, stream }
  var nears = new Map();   // connId -> { name, lat, lon, at }  (görünür olan rehber kişileri)
  var geoWatch = null;     // navigator.geolocation.watchPosition kimliği
  var frameSeq = 0;
  var facing = 'user';     // 'user' = ön kamera, 'environment' = arka kamera
  var camBusy = false;
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

  /* ---------------------- rehber / P2P yardımcıları ------------------- */
  function peer() { return window.SohbetoPeer || null; }

  /** Rehberdeki kişiler: [{ connId, name }] */
  function contacts() {
    var out = [];
    try {
      if (typeof contactsState !== 'undefined' && contactsState && contactsState.byNumber) {
        contactsState.byNumber.forEach(function (c) {
          if (!c) return;
          var cid = c.connId || (c.number && peer() && peer().myId ? null : null);
          if (!cid && c.number && peer() && typeof peer().connectToNumber === 'function') {
            // connId bilinmiyorsa numara üzerinden türet (peer katmanı yapar)
            cid = 'sohbeto-' + String(c.number).replace(/[^0-9]/g, '');
          }
          if (cid) out.push({ connId: cid, name: c.name || c.number || 'Kişi' });
        });
      }
    } catch (e) {}
    return out;
  }

  function contactName(connId) {
    var list = contacts();
    for (var i = 0; i < list.length; i++) if (list[i].connId === connId) return list[i].name;
    return String(connId || '').replace('sohbeto-', '');
  }

  function sendNotice(obj, connId) {
    var p = peer();
    if (!p || typeof p.send !== 'function') return;
    var text = MARK + JSON.stringify(obj);
    try {
      if (connId) { p.send(text, connId); return; }
      contacts().forEach(function (c) {
        try { if (typeof p.watch === 'function') p.watch(c.connId); } catch (e) {}
        try { p.send(text, c.connId); } catch (e) {}
      });
    } catch (e) {}
  }

  /** İzleyiciye canlı akışı aç. */
  function callViewer(connId, kind) {
    var p = peer();
    if (!p || !shareStream || !connId) return;
    var old = outCalls.get(connId);
    if (old) { try { old.close(); } catch (e) {} outCalls.delete(connId); }
    var call = null;
    try { call = p.callWithStream(connId, shareStream, { dsc: kind || (me.live ? 'live' : 'music'), by: myName() }); } catch (e) {}
    if (!call) return;
    outCalls.set(connId, call);
    try {
      call.on('close', function () { outCalls.delete(connId); refreshViewerCount(); });
      call.on('error', function () { outCalls.delete(connId); refreshViewerCount(); });
    } catch (e) {}
    refreshViewerCount();
  }

  function refreshViewerCount() {
    var n = 0;
    outCalls.forEach(function () { n++; });
    if (me.live) { me.live.viewers = n; write(); }
    if (me.music) { me.music.viewers = n; write(); }
    renderLists();
  }

  function closeOutCalls() {
    outCalls.forEach(function (c) { try { c.close(); } catch (e) {} });
    outCalls.clear();
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
      (pcOn() ? esc(pcName()) + ' bağlı — bilgisayardan da başlatabilirsin' : 'Rehberindekiler anında izleyebilir') +
      '</small></span></button>' +
      '<button type="button" class="sb-dmenu-item" data-dsc="music">' +
      '  <i class="fa-solid fa-music"></i>' +
      '  <span><strong>Ne dinliyorsun</strong><small>' +
      (me.music ? 'Şu an: ' + esc(me.music.title) : 'Seçtiğin parça rehberindekilere canlı çalar') + '</small></span></button>' +
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

    facing = 'user';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: true }).then(function (st) {
      stream = st;
      shareStream = st;
      me.live = { mode: mode, title: myName() + ' canlı', startedAt: Date.now(), viewers: 0 };
      write();
      if (mode === 'pc') startPcStation();
      // Rehbere duyuru: "yayındayım"
      sendNotice({ t: 'live', title: me.live.title, by: myName(), at: me.live.startedAt });
      renderLists();
      toast(mode === 'pc' ? 'Yayın bilgisayara aktarılıyor…' : 'Yayın başladı, rehberine duyuruldu.');
    }).catch(function () {
      toast('Kamera/mikrofon izni verilmedi.');
    });
  }

  /** Ön/arka kamera geçişi: ses kesilmez, izleyicilerin görüntüsü anında döner. */
  function switchCam() {
    if (!me.live || !stream) { toast('Önce yayını başlat.'); return; }
    if (camBusy) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    camBusy = true;
    var next = facing === 'user' ? 'environment' : 'user';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: next } }, audio: false })
      .then(function (ns) {
        var nt = ns.getVideoTracks()[0];
        if (!nt) throw new Error('no-video');
        // Giden çağrılarda görüntü izini değiştir
        outCalls.forEach(function (call) {
          try {
            var senders = call.peerConnection ? call.peerConnection.getSenders() : [];
            for (var i = 0; i < senders.length; i++) {
              if (senders[i].track && senders[i].track.kind === 'video') senders[i].replaceTrack(nt);
            }
          } catch (e) {}
        });
        // Yerel akıştaki izi değiştir (mini + tam ekran oynatıcılar aynı akışı kullanır)
        var old = stream.getVideoTracks()[0];
        if (old) { try { stream.removeTrack(old); } catch (e) {} try { old.stop(); } catch (e) {} }
        try { stream.addTrack(nt); } catch (e) {}
        facing = next;
        // Bilgisayar üzerinden yayında kodlayıcıyı yeni izle yeniden kur
        if (me.live.mode === 'pc' && rec) {
          try { rec.stop(); } catch (e) {}
          rec = null;
          startPcStation();
        }
        camBusy = false;
        renderLists();
        // Oynatıcıları yeni ize alıştır
        var vids = document.querySelectorAll('video[data-mini="me"], #' + viewerId('me') + ' video');
        for (var k = 0; k < vids.length; k++) { vids[k].srcObject = stream; try { vids[k].play(); } catch (e) {} }
        toast(next === 'user' ? 'Ön kameraya geçildi.' : 'Arka kameraya geçildi.');
      })
      .catch(function () {
        camBusy = false;
        toast('Diğer kameraya geçilemedi.');
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
    closeOutCalls();
    if (stream) { stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); stream = null; }
    shareStream = null;
    // Müzik paylaşımı sürüyorsa ses akışını yeniden kur
    if (me.music && audioEl) { var ms = musicStream(audioEl); if (ms) shareStream = ms; }
    if (me.live && me.live.mode === 'pc' && pcOn()) { try { pc().send({ t: 'live-stop' }); } catch (e) {} }

    me.live = null;
    write();
    sendNotice({ t: 'stop', kind: 'live' });
    renderLists();
    toast('Yayın sonlandırıldı.');
  }

  /* ---------------------------- ne dinliyor -------------------------- */
  /** Çalan parçadan rehbere gönderilebilir bir ses akışı üretir. */
  function musicStream(el) {
    try { if (el.captureStream) return el.captureStream(); } catch (e) {}
    try { if (el.mozCaptureStream) return el.mozCaptureStream(); } catch (e) {}
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = audioCtx || new Ctx();
      var src = audioCtx.createMediaElementSource(el);
      var dest = audioCtx.createMediaStreamDestination();
      src.connect(dest);
      src.connect(audioCtx.destination); // kendisi de duymaya devam etsin
      return dest.stream;
    } catch (e) { return null; }
  }

  function pickMusic() {
    var input = document.getElementById('sb-music-input');
    if (!input) return;
    input.value = '';
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var title = f.name.replace(/\.[a-z0-9]+$/i, '');
      me.music = { title: title, since: Date.now(), playing: true, viewers: 0 };
      write();
      try {
        if (audioEl) { audioEl.pause(); URL.revokeObjectURL(audioEl.src); }
        audioEl = new Audio(URL.createObjectURL(f));
        audioEl.crossOrigin = 'anonymous';
        audioEl.play().catch(function () {});
        audioEl.onended = function () { stopMusic(); };
        if (!me.live) {
          var ms = musicStream(audioEl);
          if (ms) shareStream = ms;
        }
      } catch (e) {}
      closeSheet();
      sendNotice({ t: 'music', title: title, by: myName(), at: me.music.since });
      renderLists();
      toast('Parça rehberine duyuruldu, dinleyebilirler.');
    };
    input.click();
  }

  function stopMusic() {
    if (audioEl) { try { audioEl.pause(); } catch (e) {} audioEl = null; }
    if (!me.live) { closeOutCalls(); shareStream = null; }
    me.music = null;
    write();
    sendNotice({ t: 'stop', kind: 'music' });
    renderLists();
  }

  /* ---------------------------- görünür ol --------------------------- */

  /** İki nokta arası kuş uçuşu mesafe (metre) — haversine. */
  function distMeters(a, b) {
    if (!a || !b) return null;
    var R = 6371000, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
  }
  /** Mesafeyi okunur yaz: 219 metre / 1,4 km. */
  function distText(m) {
    if (m == null) return 'mesafe hesaplanıyor…';
    if (m < 1000) return m + ' metre uzaklıkta';
    return String(Math.round(m / 100) / 10).replace('.', ',') + ' km uzaklıkta';
  }
  function myPoint() {
    return me.nearby && me.nearby.lat != null ? { lat: me.nearby.lat, lon: me.nearby.lon } : null;
  }
  /** Kendi konumumu görünür olan rehber kişilerine bildir. */
  function shareNear(connId) {
    var p = myPoint();
    if (!p) return;
    sendNotice({ t: 'near', lat: p.lat, lon: p.lon, by: myName(), at: Date.now() }, connId || null);
  }

  function toggleNearby() {
    if (me.nearby) {
      if (geoWatch != null) { try { navigator.geolocation.clearWatch(geoWatch); } catch (e) {} geoWatch = null; }
      me.nearby = null; write();
      nears.clear();
      sendNotice({ t: 'near-off' });
      renderLists();
      toast('Artık yakındakilerde görünmüyorsun.');
      return;
    }
    if (!navigator.geolocation) { toast('Bu cihazda konum kullanılamıyor.'); return; }
    toast('Konum izni isteniyor…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      me.nearby = { lat: pos.coords.latitude, lon: pos.coords.longitude, since: Date.now() };
      write();
      renderLists();
      shareNear();
      toast('Yakındakiler listesinde görünüyorsun.');
      // Hareket ettikçe mesafe güncel kalsın
      try {
        geoWatch = navigator.geolocation.watchPosition(function (p2) {
          if (!me.nearby) return;
          var moved = distMeters(myPoint(), { lat: p2.coords.latitude, lon: p2.coords.longitude });
          me.nearby.lat = p2.coords.latitude;
          me.nearby.lon = p2.coords.longitude;
          write();
          renderLists();
          if (moved == null || moved >= 25) shareNear();
        }, function () {}, { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
      } catch (e) {}
    }, function () {
      toast('Konum izni verilmedi.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }



  /* -------------------- gelen duyuru ve akış (izleyici) -------------- */
  function onNotice(fromConnId, msg) {
    if (!fromConnId || !msg) return;
    if (msg.t === 'near') {
      // Rehberdeki kişi görünür oldu / konumunu güncelledi
      if (typeof msg.lat !== 'number' || typeof msg.lon !== 'number') return;
      var known = nears.has(fromConnId);
      nears.set(fromConnId, {
        name: msg.by || contactName(fromConnId),
        lat: msg.lat, lon: msg.lon, at: msg.at || Date.now()
      });
      renderLists();
      // Ben de görünürsem konumumu ona bildir (karşılıklı mesafe için); yanıta yanıt yok
      if (myPoint() && !msg.re) {
        sendNotice({ t: 'near', lat: myPoint().lat, lon: myPoint().lon, by: myName(), at: Date.now(), re: 1 }, fromConnId);
      }
      if (!known && myPoint()) {
        var d = distMeters(myPoint(), { lat: msg.lat, lon: msg.lon });
        toast((msg.by || contactName(fromConnId)) + ' yakınlarda • ' + distText(d));
      }
      return;
    }
    if (msg.t === 'near-off') {
      if (nears.delete(fromConnId)) renderLists();
      return;
    }

    if (msg.t === 'want') {
      // Biri yayınımı izlemek/dinlemek istiyor
      if (!shareStream) { sendNotice({ t: 'stop', kind: msg.kind || 'live' }, fromConnId); return; }
      callViewer(fromConnId, me.live ? 'live' : 'music');
      toast(contactName(fromConnId) + ' yayınına katıldı.');
      return;
    }
    if (msg.t === 'stop') {
      var r = remotes.get(fromConnId);
      if (r) {
        try { if (r.call) r.call.close(); } catch (e) {}
        remotes.delete(fromConnId);
        closeViewer(fromConnId);
      }
      renderLists();
      return;
    }
    if (msg.t === 'live' || msg.t === 'music') {
      remotes.set(fromConnId, {
        kind: msg.t,
        title: msg.title || (msg.t === 'live' ? 'Canlı yayın' : 'Bir parça'),
        name: msg.by || contactName(fromConnId),
        at: msg.at || Date.now(),
        call: null, stream: null
      });
      renderLists();
      toast((msg.by || contactName(fromConnId)) + (msg.t === 'live' ? ' canlı yayında.' : ' müzik paylaşıyor.'));
    }
  }

  /** Yayıncıdan medya çağrısı geldi: cevapla ve oynat. */
  function onMediaCall(call) {
    var from = call && call.peer;
    var kind = (call && call.metadata && call.metadata.dsc) || 'live';
    var r = remotes.get(from) || { kind: kind, title: kind === 'live' ? 'Canlı yayın' : 'Bir parça', name: contactName(from) };
    r.kind = kind; r.call = call;
    remotes.set(from, r);
    try { call.answer(); } catch (e) {}
    call.on('stream', function (st) {
      r.stream = st;
      remotes.set(from, r);
      renderLists();
      // Görüntülü yayın satırda mini oynar; tam ekran kullanıcı dokununca açılır
      if (r.kind !== 'live') openViewer(from);
      else toast(r.name + ' yayını satırda oynuyor — tam ekran için dokun.');
    });
    call.on('close', function () {
      r.stream = null; r.call = null;
      closeViewer(from);
      renderLists();
    });
    renderLists();
  }
  window.__dscMediaCall = onMediaCall;

  function requestJoin(connId) {
    var r = remotes.get(connId);
    if (!r) return;
    if (r.stream) { openViewer(connId); return; }
    try { if (peer() && peer().refresh) peer().refresh(connId); } catch (e) {}
    sendNotice({ t: 'want', kind: r.kind }, connId);
    toast(r.kind === 'live' ? 'Yayına bağlanılıyor…' : 'Parçaya bağlanılıyor…');
  }

  /* ------------------------------ oynatıcı --------------------------- */
  function ensureStyles() {
    if (document.getElementById('sb-dsc-style')) return;
    var s = document.createElement('style');
    s.id = 'sb-dsc-style';
    s.textContent =
      '.sb-dsc-viewer{position:fixed;inset:0;z-index:2147483000;background:#000;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:0;' +
      'backdrop-filter:none;-webkit-backdrop-filter:none}' +
      '.sb-dsc-viewer video{width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;' +
      'border-radius:0;background:#000}' +
      '.sb-dsc-viewer .sb-dsc-head{position:absolute;top:0;left:0;right:0;padding:14px 16px;' +
      'color:#fff;font-weight:600;text-align:center;line-height:1.35;' +
      'background:linear-gradient(180deg,rgba(0,0,0,.6),rgba(0,0,0,0))}' +
      '.sb-dsc-viewer .sb-dsc-head small{display:block;opacity:.7;font-weight:400;margin-top:3px}' +
      '.sb-dsc-viewer .sb-dsc-disc{width:150px;height:150px;border-radius:50%;background:' +
      'radial-gradient(circle at 50% 50%,#222 28%,#3b3b3b 30%,#191919 70%);display:flex;align-items:center;' +
      'justify-content:center;color:#fff;font-size:38px;animation:sbDscSpin 4s linear infinite}' +
      '@keyframes sbDscSpin{to{transform:rotate(360deg)}}' +
      '.sb-dsc-mini{position:relative;width:56px;height:56px;flex:0 0 56px;padding:0;border:0;' +
      'border-radius:14px;overflow:hidden;background:#000}' +
      '.sb-dsc-mini video{width:100%;height:100%;object-fit:cover;display:block}' +
      '.sb-dsc-mini i{position:absolute;right:3px;bottom:3px;font-size:10px;color:#fff;' +
      'background:rgba(0,0,0,.55);border-radius:6px;padding:2px 4px}' +
      '.sb-dsc-viewer button{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);' +
      'padding:10px 22px;border:0;border-radius:999px;background:#ef4444;color:#fff;font-weight:600}' +
      '.sb-dsc-viewer button.sb-dsc-cam{left:auto;right:20px;transform:none;width:46px;height:46px;' +
      'padding:0;background:rgba(255,255,255,.18);font-size:17px}' +
      '.sb-dsc-camrow{width:38px;height:38px;flex:0 0 38px;padding:0;border:0;border-radius:12px;' +
      'background:rgba(127,127,127,.18);color:inherit;font-size:15px;margin-right:6px}';


    document.head.appendChild(s);
  }

  function viewerId(connId) { return 'sb-dsc-view-' + String(connId).replace(/[^a-z0-9]/gi, ''); }

  function openViewer(connId) {
    var r = remotes.get(connId);
    if (!r || !r.stream) return;
    ensureStyles();
    closeViewer(connId);
    var w = document.createElement('div');
    w.className = 'sb-dsc-viewer';
    w.id = viewerId(connId);
    var head = '<div class="sb-dsc-head">' + esc(r.name) + '<small>' + esc(r.title) +
      (r.kind === 'live' ? ' • canlı' : ' • şimdi çalıyor') + '</small></div>';
    if (r.kind === 'live') {
      w.innerHTML = head + '<video autoplay playsinline></video>' +
        '<button type="button" data-dsc="view-close" data-cid="' + esc(connId) + '">Kapat</button>';
    } else {
      w.innerHTML = head + '<div class="sb-dsc-disc"><i class="fa-solid fa-music"></i></div>' +
        '<video autoplay playsinline hidden></video>' +
        '<button type="button" data-dsc="view-close" data-cid="' + esc(connId) + '">Kapat</button>';
    }
    document.body.appendChild(w);
    var v = w.querySelector('video');
    v.srcObject = r.stream;
    v.muted = false;
    v.volume = 1;
    try { v.play().catch(function () { toast('Sesi başlatmak için ekrana dokun.'); }); } catch (e) {}
    w.addEventListener('click', function (ev) {
      if (ev.target === w) { try { v.play(); } catch (e) {} }
    });
    renderLists();
  }

  /** Kendi yayınımı tam ekran izle (sessiz — yankı olmasın). */
  function openSelfViewer() {
    var st = stream || shareStream;
    if (!st) { toast('Yayın akışı hazır değil.'); return; }
    ensureStyles();
    closeViewer('me');
    var w = document.createElement('div');
    w.className = 'sb-dsc-viewer';
    w.id = viewerId('me');
    w.innerHTML = '<div class="sb-dsc-head">' + esc(myName()) + ' (Ben)<small>Kendi yayının • ' +
      (me.live ? (me.live.viewers || 0) : 0) + ' izleyici</small></div>' +
      '<video autoplay playsinline muted></video>' +
      '<button type="button" data-dsc="self-close">Kapat</button>' +
      (me.live ? '<button type="button" class="sb-dsc-cam" data-dsc="cam-flip" aria-label="Kamera değiştir">' +
        '<i class="fa-solid fa-camera-rotate"></i></button>' : '');

    document.body.appendChild(w);
    var v = w.querySelector('video');
    v.srcObject = st; v.muted = true;
    try { v.play().catch(function () {}); } catch (e) {}
  }

  function closeViewer(connId) {
    var el = document.getElementById(viewerId(connId));
    if (el) el.remove();
  }

  function leaveRemote(connId) {
    var r = remotes.get(connId);
    if (r && r.call) { try { r.call.close(); } catch (e) {} }
    if (r) { r.call = null; r.stream = null; remotes.set(connId, r); }
    closeViewer(connId);
    renderLists();
  }

  /* ------------------------------ listeler --------------------------- */
  function row(icon, title, sub, action, label, cid, mini, extra) {
    return '<div class="sb-dcard">' +
      (mini ? mini : '  <i class="fa-solid ' + icon + '"></i>') +
      '  <div class="sb-dcard-txt"><strong>' + esc(title) + '</strong><small>' + esc(sub) + '</small></div>' +
      (extra ? extra : '') +
      (action ? '  <button type="button" class="btn-ghost sb-dcard-btn" data-dsc="' + action + '"' +
        (cid ? ' data-cid="' + esc(cid) + '"' : '') + '>' + esc(label) + '</button>' : '') +
      '</div>';
  }


  /** Satır içi mini oynatıcı kabuğu (dokununca tam ekran). */
  function miniHtml(src, cid, muteIcon) {
    return '<button type="button" class="sb-dsc-mini" data-dsc="' + (src === 'me' ? 'self-full' : 'remote-full') + '"' +
      (cid ? ' data-cid="' + esc(cid) + '"' : '') + ' aria-label="Tam ekran">' +
      '<video data-mini="' + esc(src === 'me' ? 'me' : cid) + '" autoplay playsinline muted></video>' +
      '<i class="fa-solid ' + (muteIcon || 'fa-expand') + '"></i></button>';
  }

  function fill(listId, emptyId, html) {
    var list = document.getElementById(listId), empty = document.getElementById(emptyId);
    if (!list) return;
    if (list.innerHTML !== html) {
      // Oynayan mini oynatıcıları sakla; yeniden yazınca görüntü kararmasın
      var keep = {}, old = list.querySelectorAll('video[data-mini]');
      for (var k = 0; k < old.length; k++) keep[old[k].getAttribute('data-mini')] = old[k];
      list.innerHTML = html;
      var fresh = list.querySelectorAll('video[data-mini]');
      for (var j = 0; j < fresh.length; j++) {
        var nv = fresh[j], key = nv.getAttribute('data-mini'), ov = keep[key];
        if (ov && ov.srcObject) nv.parentNode.replaceChild(ov, nv);
      }
    }
    if (empty) empty.hidden = !!html;
  }


  /** Mini oynatıcılara akışları bağla (innerHTML sonrası). */
  function attachMedia(root) {
    var vids = (root || document).querySelectorAll('video[data-mini]');
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i], key = v.getAttribute('data-mini');
      var st = key === 'me' ? (stream || shareStream) : (remotes.get(key) && remotes.get(key).stream);
      if (!st) continue;
      if (v.srcObject !== st) v.srcObject = st;
      v.muted = true;
      if (v.paused) { try { v.play().catch(function () {}); } catch (e) {} }
    }
  }


  function remoteRows(kind) {
    var html = '';
    remotes.forEach(function (r, cid) {
      if (r.kind !== kind) return;
      var live = kind === 'live';
      var joined = !!r.stream;
      html += row(
        live ? 'fa-tower-broadcast' : 'fa-music',
        r.name,
        joined ? (live ? 'İzliyorsun • dokun, tam ekran' : 'Dinliyorsun') + ' • ' + r.title : r.title,
        joined ? 'remote-leave' : 'remote-join',
        joined ? 'Ayrıl' : (live ? 'İzle' : 'Dinle'),
        cid,
        joined && live ? miniHtml('remote', cid) : null
      );
    });
    return html;
  }

  function renderLists() {
    ensureStyles();
    var liveHtml = '';
    if (me.live) {
      liveHtml = row('fa-tower-broadcast', myName() + ' (Ben)',
        (me.live.mode === 'pc' ? pcName() + ' üzerinden yayında' : 'Telefondan yayında') +
        ' • ' + (me.live.viewers || 0) + ' izleyici • ' +
        (facing === 'user' ? 'ön kamera' : 'arka kamera') + ' • dokun, tam ekran',
        'live-stop', 'Bitir', '', (stream || shareStream) ? miniHtml('me') : null,
        '<button type="button" class="sb-dsc-camrow" data-dsc="cam-flip" aria-label="Kamera değiştir">' +
        '<i class="fa-solid fa-camera-rotate"></i></button>');

    }
    var liveAll = liveHtml + remoteRows('live');

    var musicHtml = me.music
      ? row('fa-music', myName() + ' (Ben)',
          me.music.title + ' • ' + (me.music.viewers || 0) + ' dinleyici',
          'music-stop', 'Durdur')
      : '';
    var musicAll = musicHtml + remoteRows('music');

    var nearHtml = me.nearby
      ? row('fa-location-dot', myName() + ' (Ben)', 'Görünürsün • yakındaki kişilere mesafen paylaşılıyor',
            'near-off', 'Gizlen')
      : '';
    var list = [];
    nears.forEach(function (n, cid) { list.push({ cid: cid, n: n, d: distMeters(myPoint(), n) }); });
    list.sort(function (a, b) { return (a.d == null ? 1e12 : a.d) - (b.d == null ? 1e12 : b.d); });
    list.forEach(function (it) {
      nearHtml += row('fa-user-large', it.n.name, distText(it.d), '', '', it.cid);
    });

    fill('discover-live-list', 'discover-live-empty', liveAll);
    fill('discover-music-list', 'discover-music-empty', musicAll);
    fill('discover-nearby-list', 'discover-nearby-empty', nearHtml);
    attachMedia();
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
    var cid = btn.dataset.cid || '';

    if (a === 'live') { if (me.live) { closeSheet(); stopLive(); } else openSheet(liveChoiceHtml()); }
    else if (a === 'live-phone') { closeSheet(); startLive('phone'); }
    else if (a === 'live-pc') { closeSheet(); startLive('pc'); }
    else if (a === 'live-stop') { stopLive(); }
    else if (a === 'music') { if (me.music) { closeSheet(); stopMusic(); } else pickMusic(); }
    else if (a === 'music-stop') { stopMusic(); }
    else if (a === 'near') { closeSheet(); toggleNearby(); }
    else if (a === 'near-off') { toggleNearby(); }
    else if (a === 'remote-join') { requestJoin(cid); }
    else if (a === 'remote-leave') { leaveRemote(cid); }
    else if (a === 'view-close') { leaveRemote(cid); }
    else if (a === 'self-full') { openSelfViewer(); }
    else if (a === 'cam-flip') { switchCam(); }

    else if (a === 'self-close') { closeViewer('me'); }
    else if (a === 'remote-full') { openViewer(cid); }
  });

  /* --------- taşıma katmanını dinle: "[DSC]" duyurularını ayıkla ------ */
  function hookTransport() {
    var orig = window.handleTransportMessage;
    if (typeof orig !== 'function' || orig.__dsc) { setTimeout(hookTransport, 600); return; }
    var wrapped = function (sConnId, sVirtualNo, tConnId, text) {
      if (typeof text === 'string' && text.indexOf(MARK) === 0) {
        var msg = null;
        try { msg = JSON.parse(text.slice(MARK.length)); } catch (e) { msg = null; }
        if (msg) { onNotice(sConnId, msg); return; }
      }
      return orig.apply(this, arguments);
    };
    wrapped.__dsc = 1;
    window.handleTransportMessage = wrapped;
  }
  hookTransport();

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

  // Görünürlük açık kaldıysa yeniden açılışta konumu tazele ve rehbere bildir
  if (me.nearby && navigator.geolocation) {
    setTimeout(function () {
      if (!me.nearby) return;
      navigator.geolocation.getCurrentPosition(function (pos) {
        if (!me.nearby) return;
        me.nearby.lat = pos.coords.latitude;
        me.nearby.lon = pos.coords.longitude;
        write(); renderLists(); shareNear();
        try {
          geoWatch = navigator.geolocation.watchPosition(function (p2) {
            if (!me.nearby) return;
            var moved = distMeters(myPoint(), { lat: p2.coords.latitude, lon: p2.coords.longitude });
            me.nearby.lat = p2.coords.latitude; me.nearby.lon = p2.coords.longitude;
            write(); renderLists();
            if (moved == null || moved >= 25) shareNear();
          }, function () {}, { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
        } catch (e) {}
      }, function () {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    }, 3500);
  }

  // Sayfa kapanırken yayında kalmış görünmeyi engelle
  window.addEventListener('beforeunload', function () {
    try { if (me.live || me.music) sendNotice({ t: 'stop', kind: me.live ? 'live' : 'music' }); } catch (e) {}
    try { if (me.nearby) sendNotice({ t: 'near-off' }); } catch (e) {}
  });

  window.SohbetoDiscover = {
    state: function () { return me; },
    remotes: function () { return remotes; },
    nears: function () { return nears; },
    stopLive: stopLive,
    stopMusic: stopMusic,
    join: requestJoin,
    render: renderLists
  };

})();

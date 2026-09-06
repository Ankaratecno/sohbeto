/* ============================================================================
 * SOHBETO — Ses yönlendirme (ahize / hoparlör)
 * ----------------------------------------------------------------------------
 * Amaç: Sesli arama AHİZE (kulağa tutulan hoparlör) ile başlasın; kullanıcı
 * arama ekranındaki hoparlör düğmesiyle sonradan hoparlöre geçebilsin.
 *
 * Yaklaşım (motor dosyalarına dokunmadan):
 *  1) #audioContainer'a eklenen <audio> ögeleri izlenir (MutationObserver).
 *  2) Çıkış aygıtı setSinkId ile seçilir: ahize modunda "earpiece/receiver/
 *     ahize/communications" etiketli aygıt, hoparlör modunda "speaker" veya
 *     varsayılan aygıt.
 *  3) APK (Capacitor) ortamında bir ses yönlendirme eklentisi varsa ona da
 *     haber verilir (varsa çalışır, yoksa sessizce atlanır).
 *  4) window.toggleSpeaker sarılır: motorun kendi durumu korunur, üstüne
 *     gerçek yönlendirme uygulanır.
 * ==========================================================================*/
(function () {
  'use strict';

  var speakerOn = false;      // arama ahize ile açılır
  var outs = [];              // audiooutput aygıtları
  var scanned = false;

  function els() {
    var box = document.getElementById('audioContainer');
    var list = box ? box.querySelectorAll('audio') : [];
    var arr = [];
    for (var i = 0; i < list.length; i++) arr.push(list[i]);
    // Motor dışında oluşan arama sesleri de olabilir
    var loose = document.querySelectorAll('audio[id^="audio_"]');
    for (var j = 0; j < loose.length; j++) if (arr.indexOf(loose[j]) < 0) arr.push(loose[j]);
    return arr;
  }

  function scan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve([]);
    return navigator.mediaDevices.enumerateDevices().then(function (ds) {
      outs = ds.filter(function (d) { return d.kind === 'audiooutput'; });
      scanned = true;
      return outs;
    }).catch(function () { return []; });
  }

  function pickId(wantSpeaker) {
    var earRe = /earpiece|receiver|ahize|kulak|handset|communications/i;
    var spkRe = /speaker|hoparl|loud/i;
    var hit = null;
    for (var i = 0; i < outs.length; i++) {
      var l = outs[i].label || '';
      if (wantSpeaker ? spkRe.test(l) : earRe.test(l)) { hit = outs[i].deviceId; break; }
    }
    if (hit) return hit;
    if (!wantSpeaker) {
      for (var k = 0; k < outs.length; k++) {
        if (outs[k].deviceId === 'communications') return 'communications';
      }
    }
    return wantSpeaker ? 'default' : null;
  }

  /** APK ortamında yerel ses yönlendirme eklentisi varsa kullan. */
  function native(wantSpeaker) {
    try {
      var cap = window.Capacitor;
      var pl = cap && (cap.Plugins || {});
      var p = pl.AudioRoute || pl.AudioToggle || pl.NativeAudio || null;
      if (!p) return;
      if (typeof p.setSpeakerOn === 'function') p.setSpeakerOn({ on: !!wantSpeaker });
      else if (typeof p.setAudioMode === 'function') p.setAudioMode({ mode: wantSpeaker ? 'speaker' : 'earpiece' });
      else if (wantSpeaker && typeof p.enableSpeakerphone === 'function') p.enableSpeakerphone();
      else if (!wantSpeaker && typeof p.enableEarpiece === 'function') p.enableEarpiece();
    } catch (e) {}
  }

  function apply() {
    native(speakerOn);
    var list = els();
    if (!list.length) return;
    var run = function () {
      var id = pickId(speakerOn);
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        el.volume = 1;
        if (id && el.setSinkId) {
          try { el.setSinkId(id).catch(function () {}); } catch (e) {}
        }
        if (el.paused) { try { el.play().catch(function () {}); } catch (e) {} }
      }
    };
    if (scanned) run(); else scan().then(run);
  }

  /** Aramada ahize ile başlat (yeni ses ögesi göründüğünde). */
  function onNewAudio() {
    // Yeni arama: hoparlör kapalı başlasın
    if (!document.getElementById('sb-ar-active')) {
      var m = document.createElement('span');
      m.id = 'sb-ar-active';
      m.hidden = true;
      document.body.appendChild(m);
      speakerOn = false;
      syncButtons();
    }
    apply();
  }

  function syncButtons() {
    var ids = ['btnSpeaker', 'btnVideoSpeaker', 'oocSpeaker'];
    for (var i = 0; i < ids.length; i++) {
      var b = document.getElementById(ids[i]);
      if (b) b.classList.toggle('active', speakerOn);
    }
  }

  function watch() {
    var box = document.getElementById('audioContainer');
    if (!box) { setTimeout(watch, 800); return; }
    var mo = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        if (recs[i].addedNodes && recs[i].addedNodes.length) { onNewAudio(); return; }
      }
      if (!box.querySelector('audio')) {
        var m = document.getElementById('sb-ar-active');
        if (m) m.remove();          // arama bitti → sonraki arama yine ahize
      }
    });
    mo.observe(box, { childList: true });
    if (box.querySelector('audio')) onNewAudio();
  }

  /** Motorun toggleSpeaker'ını sar: durum motorunda, yönlendirme burada. */
  function hookToggle() {
    var orig = window.toggleSpeaker;
    if (typeof orig !== 'function' || orig.__sbar) { setTimeout(hookToggle, 600); return; }
    var wrapped = function () {
      try { orig.apply(this, arguments); } catch (e) {}
      // Motorun global durumunu oku, yoksa kendi bayrağımızı çevir
      var s = null;
      try { if (typeof isSpeaker !== 'undefined') s = !!isSpeaker; } catch (e) {}
      speakerOn = (s === null) ? !speakerOn : s;
      syncButtons();
      apply();
    };
    wrapped.__sbar = true;
    window.toggleSpeaker = wrapped;
  }

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', function () { scan().then(apply); });
    }
  } catch (e) {}

  window.SohbetoAudioRoute = {
    get speaker() { return speakerOn; },
    setSpeaker: function (on) { speakerOn = !!on; syncButtons(); apply(); },
    refresh: function () { scanned = false; apply(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { watch(); hookToggle(); });
  } else { watch(); hookToggle(); }
})();

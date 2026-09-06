/* =====================================================================
   SOHBETO — FCM AD HARİTASI (APK bildirimleri için)

   Bildirim başlığında numara yerine rehberdeki ad çıksın diye
   ("Ayşe: yeni mesaj", "Ayşe seni arıyor") rehberdeki numara → ad
   eşlemesini ana pencereye (React) gönderir; o da native tarafa yazar.

   • Motor dosyalarına DOKUNULMAZ; contactsState yalnızca OKUNUR.
   • Web/PWA'da ana pencere bu mesajı alır ama native yoksa yok sayar.
   • Metin, mesaj içeriği vb. hiçbir şey gönderilmez; sadece ad-numara.
   ===================================================================== */
(function () {
  'use strict';

  var last = '';

  function parentWin() {
    try { return window.parent && window.parent !== window ? window.parent : null; }
    catch (e) { return null; }
  }

  function collect() {
    var out = {};
    try {
      var st = (typeof contactsState !== 'undefined') ? contactsState : window.contactsState;
      if (!st || !st.byNumber) return out;
      st.byNumber.forEach(function (c, num) {
        var name = (c && (c.name || c.nick || c.displayName)) || '';
        if (num && name) out[num] = String(name);
      });
    } catch (e) {}
    return out;
  }

  function sync() {
    var p = parentWin();
    if (!p) return;
    var names = collect();
    var key = JSON.stringify(names);
    if (key === last) return;
    last = key;
    try { p.postMessage({ type: 'sohbeto:rehber-adlari', names: names }, '*'); } catch (e) {}
  }

  setTimeout(sync, 4000);
  setInterval(sync, 30000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') sync();
  });
})();

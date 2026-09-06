/* ============================================================
   SOHBETO CARD ANIM — Adım 14
   Kişi kartı (#contactCardOverlay) için kullanıcı tercihleri:
     - Boyut:    size-lg (varsayılan)  | size-md | size-sm
     - Animasyon:anim-default (varsayılan) | anim-spin | anim-flip
   Tercihler localStorage:
     - sohbeto.oo.cardSize  ("lg" | "md" | "sm")
     - sohbeto.oo.cardAnim  ("default" | "spin" | "flip")
   Ayarlar > Tema ekranındaki .pick-tile butonlarına tıklayınca
   anında uygulanır; her kart açılışında overlay'in doğru sınıfları
   taşıdığı garanti altına alınır.
   ============================================================ */
(function () {
  'use strict';
  if (window.SohbetoCardAnim) return;

  var LS_SIZE = 'sohbeto.oo.cardSize';
  var LS_ANIM = 'sohbeto.oo.cardAnim';
  var SIZES = ['lg', 'md', 'sm'];
  var ANIMS = ['default', 'spin', 'flip'];

  // CSS düzeltmesi: overlay display:none -> display:flex geçişi yaptığı için
  // CSS transition'ı ilk açılışta tetiklenmiyordu. opacity/visibility kullanıp
  // contact-card her zaman layout'ta tutulursa animasyon her seferinde çalışır.
  function injectAnimCSS() {
    if (document.getElementById('__sohbeto_card_anim_css__')) return;
    var css = ''
      + '#contactCardOverlay{display:flex !important;opacity:0;visibility:hidden;'
      +   'transition:background .25s ease, opacity .2s ease, visibility 0s linear .25s;}'
      + '#contactCardOverlay.open{opacity:1;visibility:visible;transition:background .25s ease, opacity .2s ease, visibility 0s;}'
      + '#contactCardOverlay.closing{opacity:1;visibility:visible;transition:background .25s ease, opacity .2s ease, visibility 0s;}';
    var s = document.createElement('style');
    s.id = '__sohbeto_card_anim_css__';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function getSize() {
    var v = localStorage.getItem(LS_SIZE);
    return SIZES.indexOf(v) >= 0 ? v : 'lg';
  }
  function getAnim() {
    var v = localStorage.getItem(LS_ANIM);
    return ANIMS.indexOf(v) >= 0 ? v : 'default';
  }
  function setSize(v) { if (SIZES.indexOf(v) >= 0) { localStorage.setItem(LS_SIZE, v); apply(); refreshPickers(); } }
  function setAnim(v) { if (ANIMS.indexOf(v) >= 0) { localStorage.setItem(LS_ANIM, v); apply(); refreshPickers(); } }

  function apply() {
    var o = document.getElementById('contactCardOverlay');
    if (!o) return;
    SIZES.forEach(function (s) { o.classList.remove('size-' + s); });
    ANIMS.forEach(function (a) { o.classList.remove('anim-' + a); });
    o.classList.add('size-' + getSize());
    o.classList.add('anim-' + getAnim());
  }

  function refreshPickers() {
    var size = getSize(), anim = getAnim();
    document.querySelectorAll('#cardSizePicker .pick-tile').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-size') === size);
    });
    document.querySelectorAll('#cardAnimPicker .pick-tile').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-anim') === anim);
    });
  }

  function bindPickers() {
    var sz = document.getElementById('cardSizePicker');
    var an = document.getElementById('cardAnimPicker');
    if (sz && !sz.__bound) {
      sz.__bound = true;
      sz.addEventListener('click', function (e) {
        var t = e.target.closest('.pick-tile'); if (!t) return;
        setSize(t.getAttribute('data-size'));
      });
    }
    if (an && !an.__bound) {
      an.__bound = true;
      an.addEventListener('click', function (e) {
        var t = e.target.closest('.pick-tile'); if (!t) return;
        setAnim(t.getAttribute('data-anim'));
      });
    }
    refreshPickers();
  }

  // Overlay her açıldığında sınıfların doğru olduğundan emin ol
  function observeOverlay() {
    var o = document.getElementById('contactCardOverlay');
    if (!o) return;
    apply();
    var mo = new MutationObserver(function () {
      // Eğer dışarıdan sınıflar resetlendiyse tekrar uygula
      var hasSize = SIZES.some(function (s) { return o.classList.contains('size-' + s); });
      var hasAnim = ANIMS.some(function (a) { return o.classList.contains('anim-' + a); });
      if (!hasSize || !hasAnim) apply();
    });
    mo.observe(o, { attributes: true, attributeFilter: ['class'] });
  }

  window.SohbetoCardAnim = { apply: apply, getSize: getSize, getAnim: getAnim, setSize: setSize, setAnim: setAnim };

  function boot() {
    injectAnimCSS();
    observeOverlay();
    bindPickers();
    // Tema ekranı sonradan açıldığında pickerlar belirir; gözlemle
    var mo = new MutationObserver(function () { bindPickers(); apply(); });
    mo.observe(document.body, { childList: true, subtree: true });

    // Overlay .open eklendiğinde animasyonu garanti et: önceden size/anim
    // sınıflarını ata ve bir reflow zorla — böylece her açılışta transition oynar.
    var ov = document.getElementById('contactCardOverlay');
    if (ov) {
      var retriggering = false;
      var classMo = new MutationObserver(function (recs) {
        recs.forEach(function (r) {
          if (r.attributeName !== 'class') return;
          if (retriggering) return;
          var hasOpen = ov.classList.contains('open');
          var hadOpen = (r.oldValue || '').indexOf('open') >= 0;
          if (hasOpen && !hadOpen) {
            apply(); // size-XX, anim-YY garanti
            var card = ov.querySelector('.contact-card');
            if (card) {
              // .open class'ını bir frame kaldırıp tekrar ekleyerek transition'ı tetikle
              retriggering = true;
              ov.classList.remove('open');
              // reflow
              void ov.offsetWidth;
              void card.offsetWidth;
              requestAnimationFrame(function () {
                ov.classList.add('open');
                requestAnimationFrame(function () { retriggering = false; });
              });
            }
          }
        });
      });
      classMo.observe(ov, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    }
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();

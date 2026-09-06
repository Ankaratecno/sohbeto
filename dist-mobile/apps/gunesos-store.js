/**
 * gunesos-store.js — Hesap-bazlı kalıcı veri katmanı (Adım 9)
 *
 * Sözleşme: IndexedDB içinde tek bir paylaşımlı veritabanı `GunesOS` var.
 * Tüm anahtarlar sanal bir "klasör" yolu gibi yazılır:
 *
 *   .gunesos/sohbeto/<+90...>/contacts
 *   .gunesos/sohbeto/<+90...>/threads/<+90...>
 *   .gunesos/sohbeto/<+90...>/profile
 *   .gunesos/sohbeto/<+90...>/settings/privacy
 *   .gunesos/sohbeto/_global/theme
 *
 * - Tab id'sinden BAĞIMSIZDIR (sekme kapansa, tab id reset olsa da yaşar).
 * - Tarayıcı verisi temizlenirse silinir (bunu kullanıcıya ayarlarda anlattık).
 * - Engine.js'in kendi `EgaNetwork_<tabId>` deposuna dokunmaz; sadece üstüne
 *   ayna çıkar. Boot'ta buradan okuyup engine'in contactsState'ine seed eder.
 */
(function () {
  'use strict';
  if (window.GunesOSStore) return;

  var DB_NAME = 'GunesOS';
  var STORE   = 'kv';
  var VERSION = 1;
  var _dbPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror   = function () { reject(req.error); };
      } catch (e) { reject(e); }
    });
    return _dbPromise;
  }

  function get(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, 'readonly');
          var rq = tx.objectStore(STORE).get(key);
          rq.onsuccess = function () { resolve(rq.result || null); };
          rq.onerror   = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }).catch(function () { return null; });
  }

  function set(key, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(value, key);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror    = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    }).catch(function () { return false; });
  }

  function del(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(key);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror    = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    }).catch(function () { return false; });
  }

  function listByPrefix(prefix) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var out = [];
        try {
          var tx = db.transaction(STORE, 'readonly');
          var os = tx.objectStore(STORE);
          var rq = os.openCursor();
          rq.onsuccess = function (e) {
            var c = e.target.result;
            if (!c) { resolve(out); return; }
            if (typeof c.key === 'string' && c.key.indexOf(prefix) === 0) {
              out.push({ key: c.key, value: c.value });
            }
            c.continue();
          };
          rq.onerror = function () { resolve(out); };
        } catch (e) { resolve(out); }
      });
    }).catch(function () { return []; });
  }

  // Yol yardımcıları
  function accountRoot(number) {
    return '.gunesos/sohbeto/' + (number || '_anon');
  }
  function pathContacts(number)         { return accountRoot(number) + '/contacts'; }
  function pathProfile(number)          { return accountRoot(number) + '/profile'; }
  function pathPrivacy(number)          { return accountRoot(number) + '/settings/privacy'; }
  function pathThread(number, peerNum)  { return accountRoot(number) + '/threads/' + peerNum; }
  function pathThreadsPrefix(number)    { return accountRoot(number) + '/threads/'; }
  function pathGlobalTheme()            { return '.gunesos/sohbeto/_global/theme'; }

  // Debounce yardımcısı
  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  window.GunesOSStore = {
    get: get,
    set: set,
    del: del,
    listByPrefix: listByPrefix,
    path: {
      contacts: pathContacts,
      profile:  pathProfile,
      privacy:  pathPrivacy,
      thread:   pathThread,
      threadsPrefix: pathThreadsPrefix,
      globalTheme:   pathGlobalTheme
    },
    debounce: debounce
  };
})();

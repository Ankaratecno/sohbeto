/* ====================================================================
   SOHBETO — BİLGİSAYARIM (F4.1 eşleşme + F4.2 dosya aktarımı + F4.4 WoL)
   --------------------------------------------------------------------
   Telefon tarafı: PC Ajanı'nın gösterdiği 6 haneli kod ile eşleşme.
   Ajanın peer kimliği: "sohbeto-pc-<kod>" (bkz. pc-agent/agent.js).
   Sohbet taşımasından bağımsız, ayrı bir PeerJS bağlantısı kullanılır;
   böylece mesajlaşma katmanı hiç etkilenmez.

   Protokol (agent.js ile birebir):
     ->  { t:'hello', name, phone }      <-  { t:'hello', app, name, version }
     ->  { t:'ping', ... }               <-  { t:'pong', ts }
     ->  { t:'status' }                  <-  { t:'status', name, version, uptime }
     F4.2:
     ->  { t:'ls', path }                <-  { t:'ls', path, parent, entries[] }
     ->  { t:'get', id, path }           <-  { t:'get-meta', id, name, size }
                                         <-  { t:'chunk', id, seq, data(base64) }
                                         <-  { t:'get-done', id } | { t:'get-err' }
     ->  { t:'put', id, name, size }     <-  { t:'put-ok', id }
     ->  { t:'put-chunk', id, data }
     ->  { t:'put-done', id }            <-  { t:'put-saved', id, path }
     F4.4:
     ->  { t:'net' }                     <-  { t:'net', net:{mac,ip,broadcast} }
     ->  { t:'wake', mac, broadcast, ip} <-  { t:'wake-res', ok, reason }
     F4.5:
     ->  { t:'policy' }                  <-  { t:'policy', shares[], maxFileMB,
                                              dailyQuotaMB, usedMB, leftMB, audit }
   Çevrimiçi durumu: kayıtlı koda sessiz bir bağlantı denemesi yapılır;
   açılırsa bilgisayar "Çevrimiçi" sayılır, açılmazsa "Çevrimdışı" gösterilir.
   ==================================================================== */
(function () {
    'use strict';

    var LS_KEY = 'sohbeto.pc.paired';
    var BROKER = { host: '0.peerjs.com', port: 443, secure: true, path: '/', debug: 0 };
    var ICE = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ];
    var CHUNK = 8 * 1024;   // base64 sonrası ~11 KB; veri kanalı tek paket sınırının altında

    var peer = null;
    var conn = null;
    var pingTimer = null;
    var connectTimer = null;
    var state = 'idle';   // idle | connecting | connected
    var pcInfo = null;    // { name, version, uptime }
    var lastPing = null;
    var currentCode = '';
    var quiet = false;        // sessiz (otomatik) bağlantı denemesi mi?
    var probeTimer = null;    // çevrimiçi yoklaması
    var waking = false;       // uyandırma sürüyor
    var wakeVia = null;       // yardımcı kod formu açık mı
    var wakeTarget = null;    // uyandırılacak bilgisayarın { mac, broadcast, ip }
    var relayMode = false;    // yardımcı bilgisayara (aktarıcı) bağlıyız
    var policy = null;        // F4.5 güvenlik bilgisi (paylaşım, kota, kayıt)

    // F4.2 durumları
    var browsing = { path: '', parent: null, entries: [], loading: false, error: '' };
    var dl = null;        // { id, name, size, got, parts[] }
    var up = null;        // { id, name, size, sent }
    var pendingPing = null;

    /* ------------------------------ yardımcı ------------------------------ */
    // Gelen paketi biçimi ne olursa olsun (metin / ArrayBuffer / TypedArray / Blob)
    // tek yerde JSON'a çevirir ve cb(msg) çağırır.
    function decodePacket(raw, cb) {
        if (raw == null) return;
        if (typeof raw === 'object' && !(raw instanceof ArrayBuffer) &&
            !ArrayBuffer.isView(raw) && typeof Blob !== 'undefined' && !(raw instanceof Blob)) {
            cb(raw); return;   // peer zaten nesne olarak çözmüş
        }
        if (typeof Blob !== 'undefined' && raw instanceof Blob) {
            raw.arrayBuffer().then(function (buf) { decodePacket(buf, cb); }, function () {});
            return;
        }
        var text;
        try {
            text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
        } catch (e) { return; }
        var msg;
        try { msg = JSON.parse(text); } catch (e) { return; }
        cb(msg);
    }

    function saved() {
        try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; }
    }
    function mergeSaved(patch) {
        var cur = saved() || {};
        for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) cur[k] = patch[k];
        save(cur);
        return cur;
    }
    function fmtAgo(ts) {
        if (!ts) return '—';
        var d = Math.max(0, Math.round((Date.now() - ts) / 1000));
        if (d < 60) return d + ' sn önce';
        if (d < 3600) return Math.round(d / 60) + ' dk önce';
        if (d < 86400) return Math.round(d / 3600) + ' sa önce';
        return Math.round(d / 86400) + ' gün önce';
    }
    function save(obj) {
        try {
            if (obj) localStorage.setItem(LS_KEY, JSON.stringify(obj));
            else localStorage.removeItem(LS_KEY);
        } catch (e) {}
    }
    function myPhone() {
        try {
            var n = (window.state && window.state.myNumber) || (window.app && window.app.myNumber) || '';
            return String(n || '');
        } catch (e) { return ''; }
    }
    function myName() {
        try {
            var n = (window.state && (window.state.myName || window.state.profileName)) || '';
            return String(n || 'Sohbeto telefonu');
        } catch (e) { return 'Sohbeto telefonu'; }
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function toast(msg) {
        try {
            if (window.app && typeof window.app.showToast === 'function') { window.app.showToast(msg); return; }
        } catch (e) {}
        try { console.log('[PC]', msg); } catch (e) {}
    }
    function fmtUptime(sec) {
        sec = Math.max(0, Number(sec) || 0);
        var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
        if (h) return h + ' sa ' + m + ' dk';
        if (m) return m + ' dk';
        return sec + ' sn';
    }
    function fmtSize(n) {
        n = Number(n) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
        if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB';
        return (n / 1073741824).toFixed(2) + ' GB';
    }
    function reasonText(r) {
        var map = {
            'izin-yok': 'Bu klasör paylaşıma kapalı.',
            'dosya-cok-buyuk': 'Dosya, izin verilen boyutu aşıyor.',
            'gunluk-kota-doldu': 'Günlük aktarım kotası doldu.',
            'dosya-yok': 'Dosya bulunamadı.',
            'klasor': 'Bu bir klasör.'
        };
        return map[r] || r || '';
    }
    function uid() { return Math.random().toString(36).slice(2, 10); }
    function b64ToBytes(b64) {
        var bin = atob(b64), len = bin.length, arr = new Uint8Array(len);
        for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
        return arr;
    }
    function bytesToB64(bytes) {
        var s = '', chunk = 0x8000;
        for (var i = 0; i < bytes.length; i += chunk) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(s);
    }

    /* ------------------------------- arayüz ------------------------------- */
    function host() { return document.querySelector('#screen-bilgisayarim .sb-computer-content'); }

    function browserHtml() {
        var rows = '';
        if (browsing.loading) {
            rows = '<div class="sb-pc-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Yükleniyor…</div>';
        } else if (browsing.error) {
            rows = '<div class="sb-pc-loading">' + esc(browsing.error) + '</div>';
        } else if (!browsing.entries.length) {
            rows = '<div class="sb-pc-loading">Bu klasör boş.</div>';
        } else {
            for (var i = 0; i < browsing.entries.length; i++) {
                var e = browsing.entries[i];
                rows +=
                    '<div class="sb-pc-item" data-pc="' + (e.dir ? 'open' : 'download') + '" data-path="' + esc(e.path) + '">' +
                    '  <i class="fa-solid ' + (e.dir ? 'fa-folder' : 'fa-file') + '"></i>' +
                    '  <span class="sb-pc-item-name">' + esc(e.name) + '</span>' +
                    '  <span class="sb-pc-item-meta">' + (e.dir ? '' : esc(fmtSize(e.size))) + '</span>' +
                    '</div>';
            }
        }

        var bar = '';
        if (dl) {
            var p = dl.size ? Math.round((dl.got / dl.size) * 100) : 0;
            bar = '<div class="sb-pc-progress"><span>İndiriliyor: ' + esc(dl.name) + ' • %' + p + '</span>' +
                  '<div class="sb-pc-bar"><i style="width:' + p + '%"></i></div></div>';
        } else if (up) {
            var q = up.size ? Math.round((up.sent / up.size) * 100) : 0;
            bar = '<div class="sb-pc-progress"><span>Gönderiliyor: ' + esc(up.name) + ' • %' + q + '</span>' +
                  '<div class="sb-pc-bar"><i style="width:' + q + '%"></i></div></div>';
        }

        return '<div class="sb-pc-browser">' +
            '  <div class="sb-pc-path">' +
            '    <button class="sb-pc-up" data-pc="up" ' + (browsing.path ? '' : 'disabled') + '><i class="fa-solid fa-arrow-up"></i></button>' +
            '    <span>' + esc(browsing.path || 'Bilgisayar') + '</span>' +
            '    <button class="sb-pc-up" data-pc="reload"><i class="fa-solid fa-rotate"></i></button>' +
            '  </div>' +
            bar +
            '  <div class="sb-pc-list">' + rows + '</div>' +
            '  <div class="sb-pc-actions">' +
            '    <button class="btn-solid" data-pc="send"><i class="fa-solid fa-upload"></i> Bilgisayara gönder</button>' +
            '  </div>' +
            '  <input type="file" id="pc-file-input" hidden />' +
            '</div>';
    }

    function policyHtml() {
        if (!policy) return '';
        var names = (policy.shares || []).map(function (p) {
            return esc(String(p).split(/[\\/]/).filter(Boolean).pop() || p);
        }).join(', ') || 'yok';
        var used = Number(policy.usedMB || 0), left = Number(policy.leftMB || 0);
        var total = used + left || 1;
        var pct = Math.min(100, Math.round((used / total) * 100));
        return '<div class="sb-pc-card">' +
            '  <div class="sb-pc-head"><i class="fa-solid fa-shield-halved"></i>' +
            '    <div><strong>Güvenlik</strong><span class="sb-pc-badge">Korumalı</span></div></div>' +
            '  <div class="sb-pc-rows">' +
            '    <div><span>Paylaşılan klasörler</span><b>' + names + '</b></div>' +
            '    <div><span>Tek dosya sınırı</span><b>' + esc(policy.maxFileMB) + ' MB</b></div>' +
            '    <div><span>Bugün kullanılan</span><b>' + esc(used) + ' / ' + esc(used + left) + ' MB</b></div>' +
            '    <div><span>İşlem kaydı</span><b>' + (policy.audit ? 'Açık' : 'Kapalı') + '</b></div>' +
            '  </div>' +
            '  <div class="sb-pc-bar" style="margin-top:10px"><i style="width:' + pct + '%"></i></div>' +
            '  <p class="sb-pc-note" style="margin-top:8px">Yalnızca bu klasörler görünür; diğer sürücüler telefondan açılamaz.</p>' +
            '</div>';
    }

    function render() {
        var el = host();
        if (!el) return;
        var s = saved();

        if (state === 'connected') {
            el.innerHTML =
                '<div class="sb-pc-card">' +
                '  <div class="sb-pc-head"><i class="fa-solid fa-desktop"></i>' +
                '    <div><strong>' + esc((pcInfo && pcInfo.name) || 'Bilgisayar') + '</strong>' +
                '    <span class="sb-pc-badge">Bağlı</span></div></div>' +
                '  <div class="sb-pc-rows">' +
                '    <div><span>Eşleşme kodu</span><b>' + esc(currentCode) + '</b></div>' +
                '    <div><span>Ajan sürümü</span><b>' + esc((pcInfo && pcInfo.version) || '—') + '</b></div>' +
                '    <div><span>Açık kalma</span><b>' + esc(pcInfo && pcInfo.uptime != null ? fmtUptime(pcInfo.uptime) : '—') + '</b></div>' +
                '    <div><span>Gecikme</span><b>' + (lastPing == null ? '—' : esc(lastPing + ' ms')) + '</b></div>' +
                '    <div><span>Ağ adresi</span><b>' + esc((s && s.ip) || '—') + '</b></div>' +
                '    <div><span>MAC (uyandırma)</span><b>' + esc((s && s.mac) || '—') + '</b></div>' +
                '  </div>' +
                '  <div class="sb-pc-actions">' +
                '    <button class="btn-ghost" data-pc="disconnect">Bağlantıyı kes</button>' +
                '  </div>' +
                '</div>' +
                policyHtml() +
                browserHtml();
        } else if (state === 'connecting' && !quiet) {
            el.innerHTML =
                '<div class="sb-empty-panel sb-computer-empty">' +
                '  <i class="fa-solid fa-circle-notch fa-spin"></i>' +
                '  <strong>Bağlanılıyor…</strong>' +
                '  <span>Bilgisayarda onay isteniyor olabilir. Ekranı kontrol et.</span>' +
                '  <button class="btn-ghost" data-pc="cancel" style="margin-top:12px">Vazgeç</button>' +
                '</div>';
        } else if (s && s.code) {
            el.innerHTML =
                '<div class="sb-pc-card">' +
                '  <div class="sb-pc-head"><i class="fa-solid fa-desktop"></i>' +
                '    <div><strong>' + esc(s.name || 'Bilgisayar') + '</strong>' +
                '    <span class="sb-pc-badge" style="color:var(--app-text-2)">' +
                (state === 'connecting' ? 'Yoklanıyor…' : 'Çevrimdışı') + '</span></div></div>' +
                '  <div class="sb-pc-rows">' +
                '    <div><span>Eşleşme kodu</span><b>' + esc(s.code) + '</b></div>' +
                '    <div><span>Son görülme</span><b>' + esc(fmtAgo(s.lastSeen)) + '</b></div>' +
                '    <div><span>MAC (uyandırma)</span><b>' + esc(s.mac || '—') + '</b></div>' +
                '  </div>' +
                (waking ? '<p class="sb-pc-note">Sihirli paket gönderiliyor…</p>' : '') +
                (wakeVia ? (
                    '<div class="sb-pc-form">' +
                    '  <input id="pc-wake-code" inputmode="numeric" maxlength="6" placeholder="Yardımcı kod" />' +
                    '  <button class="btn-solid" data-pc="wake-go">Gönder</button>' +
                    '</div>' +
                    '<p class="sb-pc-note">Aynı ev ağındaki açık bir bilgisayarda PC Ajanı\'nı çalıştır ve oradaki 6 haneli kodu yaz; uyandırma sinyalini o bilgisayar iletecek.</p>'
                ) : '') +
                '  <div class="sb-pc-actions">' +
                '    <button class="btn-solid" data-pc="reconnect">Bağlan</button>' +
                '    <button class="btn-ghost" data-pc="wake"' + (s.mac ? '' : ' disabled') + '>Uyandır</button>' +
                '    <button class="btn-ghost" data-pc="forget">Unut</button>' +
                '  </div>' +
                '</div>';
        } else {
            el.innerHTML =
                '<div class="sb-empty-panel sb-computer-empty">' +
                '  <i class="fa-solid fa-desktop"></i>' +
                '  <strong>Henüz bir bilgisayar bağlı değil</strong>' +
                '  <span>Bilgisayarda Sohbeto PC Ajanı\'nı çalıştır ve ekrandaki 6 haneli kodu buraya gir.</span>' +
                '  <div class="sb-pc-form">' +
                '    <input id="pc-code-input" inputmode="numeric" maxlength="6" placeholder="000000" value="' + esc(s && s.code ? s.code : '') + '" />' +
                '    <button class="btn-solid" data-pc="connect">Bağlan</button>' +
                '  </div>' +
                (s && s.name ? '<p class="sb-pc-note">Son eşleşen: ' + esc(s.name) + '</p>' : '') +
                '</div>';
        }
    }

    document.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-pc]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-pc');
        if (act === 'connect') {
            var inp = document.getElementById('pc-code-input');
            var code = (inp && inp.value || '').replace(/\D/g, '');
            if (code.length !== 6) { toast('6 haneli kodu gir.'); return; }
            api.connect(code);
        } else if (act === 'reconnect') {
            var sv = saved();
            if (sv && sv.code) api.connect(sv.code);
        } else if (act === 'forget') {
            api.disconnect(true);
        } else if (act === 'wake') {
            api.wake();
        } else if (act === 'wake-go') {
            var wi = document.getElementById('pc-wake-code');
            var wc = (wi && wi.value || '').replace(/\D/g, '');
            if (wc.length !== 6) { toast('Yardımcı bilgisayarın 6 haneli kodunu gir.'); return; }
            api.wakeVia(wc);
        } else if (act === 'disconnect') {
            api.disconnect(true);
        } else if (act === 'cancel') {
            api.disconnect(false);
        } else if (act === 'refresh') {
            send({ t: 'status' });
            ping();
        } else if (act === 'open') {
            ls(btn.getAttribute('data-path') || '');
        } else if (act === 'up') {
            ls(browsing.parent == null ? '' : browsing.parent);
        } else if (act === 'reload') {
            ls(browsing.path);
        } else if (act === 'download') {
            download(btn.getAttribute('data-path') || '');
        } else if (act === 'send') {
            var f = document.getElementById('pc-file-input');
            if (f) f.click();
        }
    });

    document.addEventListener('change', function (ev) {
        if (!ev.target || ev.target.id !== 'pc-file-input') return;
        var file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (file) upload(file);
    });

    /* ------------------------------ bağlantı ------------------------------ */
    function send(obj) {
        try { if (conn && conn.open) conn.send(JSON.stringify(obj)); } catch (e) {}
    }

    function ping() {
        var t0 = Date.now();
        pendingPing = t0;
        send({ t: 'ping', ts: t0 });
    }

    function startPing() {
        clearInterval(pingTimer);
        pingTimer = setInterval(function () {
            if (state !== 'connected') return;
            ping();
            send({ t: 'status' });
            send({ t: 'policy' });
        }, 10000);
    }

    /* ------------------------------ F4.2 akış ----------------------------- */
    function ls(p) {
        browsing.loading = true;
        browsing.error = '';
        render();
        send({ t: 'ls', path: p || '' });
    }

    function download(p) {
        if (dl || up) { toast('Önce mevcut aktarımın bitmesini bekle.'); return; }
        dl = { id: uid(), name: p.split(/[\\/]/).pop(), size: 0, got: 0, parts: [] };
        send({ t: 'get', id: dl.id, path: p });
        render();
    }

    function finishDownload() {
        try {
            var blob = new Blob(dl.parts, { type: 'application/octet-stream' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = dl.name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
            toast(dl.name + ' indirildi.');
        } catch (e) { toast('Dosya kaydedilemedi.'); }
        dl = null;
        render();
    }

    function upload(file) {
        if (dl || up) { toast('Önce mevcut aktarımın bitmesini bekle.'); return; }
        up = { id: uid(), name: file.name, size: file.size, sent: 0, file: file, offset: 0 };
        send({ t: 'put', id: up.id, name: file.name, size: file.size });
        render();
    }

    function pumpUpload() {
        if (!up) return;
        if (up.offset >= up.size) {
            send({ t: 'put-done', id: up.id });
            return;
        }
        var slice = up.file.slice(up.offset, up.offset + CHUNK);
        var fr = new FileReader();
        fr.onload = function () {
            if (!up) return;
            send({ t: 'put-chunk', id: up.id, data: bytesToB64(new Uint8Array(fr.result)) });
            up.offset += slice.size;
            up.sent = up.offset;
            render();
            setTimeout(pumpUpload, 8);
        };
        fr.onerror = function () { toast('Dosya okunamadı.'); up = null; render(); };
        fr.readAsArrayBuffer(slice);
    }

    var listeners = [];
    function emit(msg) {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](msg); } catch (e) {}
        }
    }

    function onMessage(msg) {
        emit(msg);
        if (msg.t === 'pong') {
            if (pendingPing) { lastPing = Date.now() - pendingPing; pendingPing = null; }
            render();
        } else if (msg.t === 'hello' || msg.t === 'status') {
            pcInfo = {
                name: msg.name || (pcInfo && pcInfo.name),
                version: msg.version || (pcInfo && pcInfo.version),
                uptime: msg.uptime != null ? msg.uptime : (pcInfo && pcInfo.uptime)
            };
            if (msg.policy) policy = msg.policy;
            if (relayMode) { render(); return; }
            var patch = { code: currentCode, name: pcInfo.name || '', lastSeen: Date.now() };
            if (msg.net) {
                if (msg.net.mac) patch.mac = msg.net.mac;
                if (msg.net.ip) patch.ip = msg.net.ip;
                if (msg.net.broadcast) patch.broadcast = msg.net.broadcast;
            }
            mergeSaved(patch);
            render();
        } else if (msg.t === 'policy') {
            policy = msg;
            render();
        } else if (msg.t === 'net') {
            if (msg.net) mergeSaved({ mac: msg.net.mac || '', ip: msg.net.ip || '', broadcast: msg.net.broadcast || '' });
            render();
        } else if (msg.t === 'wake-res') {
            waking = false;
            toast(msg.ok ? 'Uyandırma sinyali gönderildi. Bilgisayar birkaç saniye içinde açılabilir.'
                         : 'Uyandırma başarısız: ' + (msg.reason || ''));
            if (wakeVia) { wakeVia = null; api.disconnect(false); }
            else render();
            setTimeout(function () { probe(); }, 15000);
        } else if (msg.t === 'ls') {
            browsing = { path: msg.path || '', parent: msg.parent, entries: msg.entries || [], loading: false, error: '' };
            render();
        } else if (msg.t === 'ls-err') {
            browsing.loading = false;
            browsing.error = 'Klasör açılamadı: ' + (msg.reason || '');
            render();
        } else if (msg.t === 'get-meta') {
            if (dl && dl.id === msg.id) { dl.name = msg.name || dl.name; dl.size = msg.size || 0; render(); }
        } else if (msg.t === 'chunk') {
            if (dl && dl.id === msg.id) {
                var bytes = b64ToBytes(msg.data || '');
                dl.parts.push(bytes);
                dl.got += bytes.length;
                render();
            }
        } else if (msg.t === 'get-done') {
            if (dl && dl.id === msg.id) finishDownload();
        } else if (msg.t === 'get-err') {
            toast('Dosya alınamadı: ' + reasonText(msg.reason));
            dl = null; render();
        } else if (msg.t === 'put-ok') {
            if (up && up.id === msg.id) pumpUpload();
        } else if (msg.t === 'put-saved') {
            toast('Bilgisayara kaydedildi: ' + (msg.path || ''));
            up = null; render();
        } else if (msg.t === 'put-err') {
            toast('Gönderilemedi: ' + reasonText(msg.reason));
            up = null; render();
        }
    }

    function ensurePeer(cb) {
        if (peer && !peer.destroyed && peer.open) { cb(); return; }
        if (typeof window.Peer !== 'function') { toast('Bağlantı kütüphanesi yüklenemedi.'); return; }
        try { if (peer) peer.destroy(); } catch (e) {}
        var id = 'sohbeto-phone-' + Math.random().toString(36).slice(2, 10);
        peer = new window.Peer(id, { host: BROKER.host, port: BROKER.port, secure: BROKER.secure, path: BROKER.path, debug: BROKER.debug, config: { iceServers: ICE } });
        peer.on('open', function () { cb(); });
        peer.on('error', function (e) {
            if (!quiet) toast('Bağlantı hatası: ' + (e && e.type ? e.type : 'bilinmiyor'));
            if (state === 'connecting') { state = 'idle'; render(); }
        });
    }

    /* --------------------- F4.4: çevrimiçi yoklaması ---------------------- */
    function probe() {
        var sv = saved();
        if (!sv || !sv.code) return;
        if (state !== 'idle') return;
        if (typeof document !== 'undefined' && document.hidden) return;
        api.connect(sv.code, { quiet: true });
    }

    function startProbe() {
        clearInterval(probeTimer);
        probeTimer = setInterval(probe, 30000);
    }

    var api = {
        connect: function (code, opts) {
            opts = opts || {};
            quiet = !!opts.quiet;
            relayMode = !!opts.relay;
            currentCode = String(code);
            state = 'connecting';
            render();
            ensurePeer(function () {
                try { if (conn) conn.close(); } catch (e) {}
                // 'raw': paketler düz metin olarak gider/gelir. PC Ajanı JSON metin
                // beklediği için binary/json paketleme kullanılmaz (aksi hâlde ajan
                // gelen paketi çözemez ve telefon "Yükleniyor…" ekranında kalır).
                conn = peer.connect('sohbeto-pc-' + currentCode, { reliable: true, serialization: 'raw' });
                clearTimeout(connectTimer);
                connectTimer = setTimeout(function () {
                    if (state !== 'connected') {
                        if (!quiet) toast('Bilgisayara ulaşılamadı ya da onay verilmedi.');
                        if (waking && relayMode) { waking = false; }
                        api.disconnect(false);
                    }
                }, quiet ? 12000 : 45000);

                conn.on('open', function () {
                    state = 'connected';
                    quiet = false;
                    lastPing = null;
                    clearTimeout(connectTimer);
                    send({ t: 'hello', name: myName(), phone: myPhone() });
                    if (relayMode && wakeTarget) {
                        send({ t: 'wake', mac: wakeTarget.mac, broadcast: wakeTarget.broadcast || '', ip: wakeTarget.ip || '' });
                        render();
                        return;
                    }
                    send({ t: 'status' });
                    send({ t: 'net' });
                    send({ t: 'policy' });
                    ping();
                    startPing();
                    render();
                    ls('');
                });
                conn.on('data', function (raw) {
                    decodePacket(raw, onMessage);
                });
                conn.on('close', function () {
                    if (state === 'connected' && !relayMode) toast('Bilgisayar bağlantısı kapandı.');
                    if (state === 'connected' && !relayMode) mergeSaved({ lastSeen: Date.now() });
                    state = 'idle';
                    conn = null;
                    dl = null; up = null;
                    clearInterval(pingTimer);
                    render();
                });
                conn.on('error', function () {
                    if (!quiet) toast('Bilgisayara bağlanılamadı.');
                    api.disconnect(false);
                });
            });
        },
        disconnect: function (forget) {
            clearTimeout(connectTimer);
            clearInterval(pingTimer);
            try { if (conn) conn.close(); } catch (e) {}
            conn = null;
            state = 'idle';
            pcInfo = null;
            lastPing = null;
            dl = null; up = null;
            quiet = false;
            relayMode = false;
            policy = null;
            wakeTarget = null;
            browsing = { path: '', parent: null, entries: [], loading: false, error: '' };
            if (forget) { save(null); wakeVia = null; waking = false; }
            render();
        },
        wake: function () {
            var sv = saved();
            if (!sv || !sv.mac) { toast('Önce bir kez bağlanmalısın; uyandırma için MAC adresi gerekiyor.'); return; }
            if (state === 'connected') { toast('Bilgisayar zaten açık ve bağlı.'); return; }
            wakeVia = true;
            render();
        },
        wakeVia: function (helperCode) {
            var sv = saved();
            if (!sv || !sv.mac) return;
            wakeTarget = { mac: sv.mac, broadcast: sv.broadcast || '', ip: sv.ip || '' };
            waking = true;
            render();
            api.connect(helperCode, { relay: true });
        },
        probe: function () { probe(); },
        isConnected: function () { return state === 'connected'; },
        info: function () { return pcInfo; },
        on: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
        off: function (fn) { listeners = listeners.filter(function (f) { return f !== fn; }); },
        send: send,
        render: render
    };

    window.SohbetoPC = api;
    startProbe();
    setTimeout(probe, 1500);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) probe(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    else render();
})();

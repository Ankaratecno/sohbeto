#!/usr/bin/env node
'use strict';
/**
 * SOHBETO PC AJANI — F4.1 (eşleşme + P2P bağlantı)
 *
 * Ne yapar:
 *  - 6 haneli bir eşleşme kodu üretir ve PeerJS bulutuna bu kodla kaydolur.
 *  - Telefondaki Sohbeto, kodu girince bu id'ye WebRTC veri kanalı açar.
 *  - İlk bağlantıda ekranda onay ister; onaylanan telefonlar config'e yazılır,
 *    sonraki girişlerde otomatik kabul edilir.
 *  - Kanal açıkken basit komutlara cevap verir: ping/pong, status.
 *  - F4.5: güvenlik — yalnızca izin verilen klasörler paylaşılır, günlük
 *    aktarım kotası uygulanır ve her işlem denetim günlüğüne yazılır.
 *  - F4.4: kendi ağ bilgisini (MAC / IP / yayın adresi) telefona bildirir ve
 *    istenen MAC adresine "sihirli paket" (Wake-on-LAN) gönderir; böylece
 *    aynı ağdaki kapalı/uyuyan bir bilgisayar uzaktan uyandırılabilir.
 *    (Dosya al/gönder F4.2/F4.3'te eklenecek — burada yalnızca hat kurulur.)
 *
 * Sunucuya hiçbir dosya/mesaj metni gitmez; PeerJS bulutu yalnızca
 * eşleştirme (sinyal) içindir, veri WebRTC ile uçtan uca şifreli akar.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const dgram = require('dgram');
const readline = require('readline');

const VERSION = '0.4.0';
const SIGNAL_HOST = 'wss://0.peerjs.com/peerjs?key=peerjs';

/* ------------------------------------------------------------------ *
 * pkg ile tek exe yapıldığında native (.node) dosyayı dışarı çıkar.
 * Normal `node agent.js` çalıştırmada hiçbir şey yapmaz.
 * ------------------------------------------------------------------ */
function prebuildName() {
  const p = process.platform, a = process.arch;
  if (p === 'win32') return `win32-${a}-msvc`;
  if (p === 'darwin') return `darwin-${a}`;
  if (p === 'linux') return `linux-${a}-gnu`;
  return `${p}-${a}`;
}

function setupNativeLoader() {
  if (!process.pkg) return; // normal kurulum: optionalDependencies yeterli
  const Module = require('module');
  const name = prebuildName();
  const src = path.join(__dirname, 'native', name + '.node'); // paket içi (snapshot)
  const dstDir = path.join(os.tmpdir(), 'sohbeto-pc-agent');
  fs.mkdirSync(dstDir, { recursive: true });
  const dst = path.join(dstDir, name + '.node');
  try {
    if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) {
      fs.copyFileSync(src, dst);
    }
  } catch (e) {
    console.error('Native modül çıkarılamadı:', e.message);
  }
  let binding = null;
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request.startsWith('@node-datachannel/')) {
      if (!binding) binding = require(dst);
      return binding;
    }
    return originalLoad.apply(this, [request, ...rest]);
  };
}

setupNativeLoader();
const ndc = require('node-datachannel');
const WebSocket = require('ws');

/* ----------------------------- Ayarlar ----------------------------- */
const cfgDir = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'SohbetoAgent')
  : path.join(os.homedir(), '.config', 'sohbeto-agent');
fs.mkdirSync(cfgDir, { recursive: true });
const cfgFile = path.join(cfgDir, 'config.json');

const HOME = os.homedir();
const DEFAULT_SHARES = [
  path.join(HOME, 'Documents'),
  path.join(HOME, 'Downloads'),
  path.join(HOME, 'Desktop'),
  path.join(HOME, 'Pictures'),
];

let config = {
  trusted: [],
  pcName: os.hostname(),
  code: null,
  /* F4.5 güvenlik ayarları */
  shares: DEFAULT_SHARES.slice(),   // yalnızca bu klasörler ve altları
  maxFileMB: 2048,                  // tek dosya üst sınırı
  dailyQuotaMB: 10240,              // günlük toplam (indir + gönder)
  usage: { day: '', bytes: 0 },     // günlük sayaç
  audit: true,                      // işlem kaydı tutulsun mu
};
try {
  Object.assign(config, JSON.parse(fs.readFileSync(cfgFile, 'utf8')));
} catch (e) { /* ilk çalıştırma */ }
function saveConfig() {
  try { fs.writeFileSync(cfgFile, JSON.stringify(config, null, 2)); } catch (e) {}
}

// İlk çalıştırmada varsayılan güvenlik ayarlarını dosyaya yaz ki
// kullanıcı config.json'dan klasör/kota değiştirebilsin.
saveConfig();

/* --------------------------- Yardımcılar --------------------------- */
function makeCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}
function peerIdFor(code) {
  return 'sohbeto-pc-' + code;
}
function log(...a) {
  const t = new Date().toLocaleTimeString('tr-TR');
  console.log(`[${t}]`, ...a);
}
/* ------------------ F4.5: güvenlik (klasör/kota/kayıt) ------------- */
const auditFile = path.join(cfgDir, 'islem-kaydi.log');

function audit(src, action, detail) {
  const line = `${new Date().toISOString()}\t${src || '-'}\t${action}\t${detail || ''}`;
  if (config.audit) {
    try { fs.appendFileSync(auditFile, line + os.EOL); } catch (e) {}
  }
  log(`kayıt: ${action} ${detail || ''}`);
}

function shareList() {
  return (config.shares || []).filter((p) => { try { fs.accessSync(p); return true; } catch (e) { return false; } });
}

function isAllowed(target) {
  const t = path.resolve(target);
  return shareList().some((root) => {
    const r = path.resolve(root);
    return t === r || t.startsWith(r + path.sep);
  });
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function quotaLeft() {
  if (config.usage.day !== today()) config.usage = { day: today(), bytes: 0 };
  return Math.max(0, config.dailyQuotaMB * 1024 * 1024 - config.usage.bytes);
}

function addUsage(bytes) {
  if (config.usage.day !== today()) config.usage = { day: today(), bytes: 0 };
  config.usage.bytes += Math.max(0, Number(bytes) || 0);
  saveConfig();
}

function policyMsg() {
  return {
    t: 'policy',
    shares: shareList(),
    maxFileMB: config.maxFileMB,
    dailyQuotaMB: config.dailyQuotaMB,
    usedMB: Math.round((config.usage.bytes / 1048576) * 10) / 10,
    leftMB: Math.round((quotaLeft() / 1048576) * 10) / 10,
    audit: !!config.audit,
    auditFile: config.audit ? auditFile : '',
  };
}

/* ------------------- F4.4: ağ bilgisi + Wake-on-LAN ---------------- */
function broadcastFor(addr, mask) {
  const a = addr.split('.').map(Number), m = mask.split('.').map(Number);
  if (a.length !== 4 || m.length !== 4) return '255.255.255.255';
  return a.map((o, i) => (o & m[i]) | (~m[i] & 255)).join('.');
}

function netInfo() {
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] || []) {
      const fam = i.family === 'IPv4' || i.family === 4;
      if (!fam || i.internal) continue;
      if (!i.mac || i.mac === '00:00:00:00:00:00') continue;
      return {
        iface: name,
        mac: i.mac.toLowerCase(),
        ip: i.address,
        broadcast: broadcastFor(i.address, i.netmask || '255.255.255.0'),
      };
    }
  }
  return { iface: '', mac: '', ip: '', broadcast: '255.255.255.255' };
}

function magicPacket(mac) {
  const bytes = String(mac).replace(/[^0-9a-fA-F]/g, '');
  if (bytes.length !== 12) return null;
  const buf = Buffer.alloc(102, 0xff);
  const m = Buffer.from(bytes, 'hex');
  for (let i = 0; i < 16; i++) m.copy(buf, 6 + i * 6);
  return buf;
}

function sendWol(mac, targets) {
  return new Promise((resolve) => {
    const pkt = magicPacket(mac);
    if (!pkt) { resolve({ ok: false, reason: 'gecersiz-mac' }); return; }
    const list = (targets && targets.length ? targets : []).concat(['255.255.255.255']);
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.bind(() => {
      try { sock.setBroadcast(true); } catch (e) {}
      let left = list.length * 2;
      const done = () => { if (--left <= 0) { try { sock.close(); } catch (e) {} resolve({ ok: true, targets: list }); } };
      for (const host of list) {
        for (const port of [7, 9]) sock.send(pkt, 0, pkt.length, port, host, done);
      }
    });
    setTimeout(() => { try { sock.close(); } catch (e) {} resolve({ ok: true, targets: list }); }, 1500);
  });
}

function showCode(code) {
  console.log('');
  console.log('  ╔══════════════════════════════════╗');
  console.log(`  ║   EŞLEŞME KODU:   ${code.split('').join(' ')}       ║`);
  console.log('  ╚══════════════════════════════════╝');
  console.log('  Telefonda Sohbeto → Bilgisayarım → "Kodu gir" ile bağlan.');
  console.log('');
}

/* ------------------------ Onay (readline) -------------------------- */
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let asking = false;
function askApproval(src) {
  return new Promise((resolve) => {
    if (asking) { resolve(false); return; } // aynı anda tek soru
    asking = true;
    const timer = setTimeout(() => { asking = false; rl.pause(); resolve(false); }, 60000);
    rl.question(`  "${src}" bu bilgisayara bağlanmak istiyor. Onaylıyor musun? (e/h) `, (ans) => {
      clearTimeout(timer);
      asking = false;
      resolve(/^e(evvet)?$/i.test(ans.trim()));
    });
    rl.resume();
  });
}

/* --------------------- WebRTC bağlantı yönetimi -------------------- */
const peers = new Map(); // key: src|connectionId -> { pc, dc, src }

/* ----------------------- F4.2: dosya işlemleri --------------------- */
const CHUNK = 32 * 1024;              // ham bayt
const MAX_BUFFER = 1 * 1024 * 1024;   // kanalda bekleyen üst sınır
const uploads = new Map();            // id -> { fd, path, name, size, got }

function downloadDir() {
  const d = path.join(os.homedir(), 'Downloads', 'Sohbeto');
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
  return d;
}

function listRoots() {
  // F4.5: yalnızca izin verilen klasörler görünür; sürücülerin tamamı değil.
  const names = { Documents: 'Belgeler', Downloads: 'İndirilenler', Desktop: 'Masaüstü', Pictures: 'Resimler' };
  return shareList().map((p) => ({
    name: names[path.basename(p)] || path.basename(p) || p,
    path: p, dir: true, size: 0, mtime: 0,
  }));
}

function listDir(p) {
  const items = fs.readdirSync(p, { withFileTypes: true });
  const out = [];
  for (const it of items) {
    if (it.name.startsWith('.')) continue;
    const full = path.join(p, it.name);
    let st = null;
    try { st = fs.statSync(full); } catch (e) { continue; }
    out.push({
      name: it.name, path: full, dir: st.isDirectory(),
      size: st.isDirectory() ? 0 : st.size, mtime: Math.round(st.mtimeMs),
    });
  }
  out.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, 'tr') : (a.dir ? -1 : 1)));
  return out;
}

function sendFile(dc, src, id, filePath) {
  if (!isAllowed(filePath)) {
    audit(src, 'RED-KLASOR', filePath);
    dc.sendMessage(JSON.stringify({ t: 'get-err', id, reason: 'izin-yok' })); return;
  }
  let st;
  try { st = fs.statSync(filePath); } catch (e) {
    dc.sendMessage(JSON.stringify({ t: 'get-err', id, reason: 'dosya-yok' })); return;
  }
  if (st.isDirectory()) {
    dc.sendMessage(JSON.stringify({ t: 'get-err', id, reason: 'klasor' })); return;
  }
  if (st.size > config.maxFileMB * 1024 * 1024) {
    audit(src, 'RED-BOYUT', `${filePath} (${st.size})`);
    dc.sendMessage(JSON.stringify({ t: 'get-err', id, reason: 'dosya-cok-buyuk' })); return;
  }
  if (st.size > quotaLeft()) {
    audit(src, 'RED-KOTA', filePath);
    dc.sendMessage(JSON.stringify({ t: 'get-err', id, reason: 'gunluk-kota-doldu' })); return;
  }
  addUsage(st.size);
  audit(src, 'INDIRME', `${filePath} (${st.size} bayt)`);
  dc.sendMessage(JSON.stringify({
    t: 'get-meta', id, name: path.basename(filePath), size: st.size,
  }));
  const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK });
  let seq = 0;
  stream.on('data', (buf) => {
    dc.sendMessage(JSON.stringify({ t: 'chunk', id, seq: seq++, data: buf.toString('base64') }));
    try {
      if (dc.bufferedAmount && dc.bufferedAmount() > MAX_BUFFER) {
        stream.pause();
        const tick = setInterval(() => {
          if (!dc.bufferedAmount || dc.bufferedAmount() < MAX_BUFFER / 2) {
            clearInterval(tick); stream.resume();
          }
        }, 60);
      }
    } catch (e) {}
  });
  stream.on('end', () => { dc.sendMessage(JSON.stringify({ t: 'get-done', id })); log(`Gönderildi → ${filePath}`); });
  stream.on('error', (e) => dc.sendMessage(JSON.stringify({ t: 'get-err', id, reason: e.message })));
}

/* ------------------- F5: canlı yayın istasyonu ---------------------- *
 * Telefon görüntüyü TEK bir akış hâlinde buraya yollar; bilgisayar
 * parçaları izleyicilere dağıtır. Böylece telefon yalnızca tek bağlantı
 * taşır (ısınma/pil/yükleme sorunu ortadan kalkar).
 * -------------------------------------------------------------------- */
const live = {
  on: false, title: '', mime: '', by: '', startedAt: 0, seq: 0,
  viewers: new Set(),   // izleyici veri kanalları
  header: null,         // MediaRecorder'ın ilk parçası (yeni izleyiciye gönderilir)
};

function liveInfo() {
  return {
    t: 'live-info', on: live.on, title: live.title, mime: live.mime,
    by: live.by, startedAt: live.startedAt, viewers: live.viewers.size,
    station: code,
  };
}

function liveBroadcast(obj) {
  const raw = JSON.stringify(obj);
  for (const v of live.viewers) {
    try { v.sendMessage(raw); } catch (e) { live.viewers.delete(v); }
  }
}

function handleChannel(src, dc) {
  const key = [...peers.entries()].find(([, v]) => v.src === src)?.[0];
  log(`Veri kanalı açıldı ← ${src}`);
  dc.onMessage((raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch (e) { return; }
    if (msg.t === 'ping') {
      dc.sendMessage(JSON.stringify({ t: 'pong', ts: Date.now() }));
    } else if (msg.t === 'hello') {
      log(`Telefon merhaba dedi: ${msg.name || '?'} (${msg.phone || src})`);
      dc.sendMessage(JSON.stringify({
        t: 'hello', app: 'sohbeto-pc', name: config.pcName, version: VERSION,
        code, net: netInfo(), policy: policyMsg(), live: liveInfo(),
      }));
    } else if (msg.t === 'status') {
      dc.sendMessage(JSON.stringify({
        t: 'status', name: config.pcName, version: VERSION,
        uptime: Math.round(process.uptime()), code, net: netInfo(), policy: policyMsg(), live: liveInfo(),
      }));
    } else if (msg.t === 'net') {
      dc.sendMessage(JSON.stringify({ t: 'net', net: netInfo() }));
    } else if (msg.t === 'wake') {
      const target = String(msg.mac || '');
      log(`Uyandırma isteği → ${target}`);
      audit(src, 'UYANDIRMA', target);
      sendWol(target, [msg.broadcast, msg.ip].filter(Boolean)).then((r) => {
        dc.sendMessage(JSON.stringify({ t: 'wake-res', mac: target, ok: r.ok, reason: r.reason || '', targets: r.targets || [] }));
        log(r.ok ? 'Sihirli paket gönderildi.' : 'Uyandırma başarısız: ' + r.reason);
      });
    } else if (msg.t === 'policy') {
      dc.sendMessage(JSON.stringify(policyMsg()));
    } else if (msg.t === 'ls') {
      try {
        const p = msg.path ? path.resolve(msg.path) : '';
        if (p && !isAllowed(p)) {
          audit(src, 'RED-KLASOR', p);
          dc.sendMessage(JSON.stringify({ t: 'ls-err', path: p, reason: 'Bu klasör paylaşıma kapalı.' }));
          return;
        }
        const entries = p ? listDir(p) : listRoots();
        const parent = p ? (path.dirname(p) === p ? '' : path.dirname(p)) : null;
        dc.sendMessage(JSON.stringify({ t: 'ls', path: p, parent, entries }));
      } catch (e) {
        dc.sendMessage(JSON.stringify({ t: 'ls-err', path: msg.path || '', reason: e.message }));
      }
    } else if (msg.t === 'get') {
      sendFile(dc, src, msg.id, path.resolve(msg.path || ''));
    } else if (msg.t === 'put') {
      const incoming = Number(msg.size) || 0;
      if (incoming > config.maxFileMB * 1024 * 1024) {
        audit(src, 'RED-BOYUT', String(msg.name || ''));
        dc.sendMessage(JSON.stringify({ t: 'put-err', id: msg.id, reason: 'dosya-cok-buyuk' })); return;
      }
      if (incoming > quotaLeft()) {
        audit(src, 'RED-KOTA', String(msg.name || ''));
        dc.sendMessage(JSON.stringify({ t: 'put-err', id: msg.id, reason: 'gunluk-kota-doldu' })); return;
      }
      try {
        const dir = downloadDir();
        let name = path.basename(String(msg.name || 'dosya')).replace(/[\\/:*?"<>|]/g, '_');
        let full = path.join(dir, name);
        let i = 1;
        while (fs.existsSync(full)) {
          const ext = path.extname(name), base = path.basename(name, ext);
          full = path.join(dir, `${base} (${i++})${ext}`);
        }
        uploads.set(msg.id, { fd: fs.openSync(full, 'w'), path: full, name, size: msg.size || 0, got: 0 });
        dc.sendMessage(JSON.stringify({ t: 'put-ok', id: msg.id }));
      } catch (e) {
        dc.sendMessage(JSON.stringify({ t: 'put-err', id: msg.id, reason: e.message }));
      }
    } else if (msg.t === 'put-chunk') {
      const up = uploads.get(msg.id);
      if (!up) return;
      try {
        const buf = Buffer.from(msg.data || '', 'base64');
        fs.writeSync(up.fd, buf);
        up.got += buf.length;
      } catch (e) {
        try { fs.closeSync(up.fd); } catch (x) {}
        uploads.delete(msg.id);
        dc.sendMessage(JSON.stringify({ t: 'put-err', id: msg.id, reason: e.message }));
      }
    } else if (msg.t === 'put-done') {
      const up = uploads.get(msg.id);
      if (!up) return;
      try { fs.closeSync(up.fd); } catch (e) {}
      uploads.delete(msg.id);
      addUsage(up.got);
      audit(src, 'YUKLEME', `${up.path} (${up.got} bayt)`);
      log(`Alındı ← ${up.path}`);
      dc.sendMessage(JSON.stringify({ t: 'put-saved', id: msg.id, path: up.path }));
    } else if (msg.t === 'live-caps') {
      dc.sendMessage(JSON.stringify({
        t: 'live-caps', ok: true, relay: true, station: code,
        pcName: config.pcName, maxViewers: 50, live: live.on,
      }));
    } else if (msg.t === 'live-start') {
      live.on = true;
      live.title = String(msg.title || 'Canlı yayın');
      live.mime = String(msg.mime || 'video/webm');
      live.by = String(msg.by || src);
      live.startedAt = Date.now();
      live.seq = 0;
      live.header = null;
      audit(src, 'YAYIN-BASLADI', live.title);
      log(`Canlı yayın başladı: ${live.title}`);
      dc.sendMessage(JSON.stringify({ t: 'live-started', station: code, title: live.title }));
      liveBroadcast(liveInfo());
    } else if (msg.t === 'frame') {
      if (!live.on) return;
      if (live.seq === 0 && msg.data) live.header = msg.data;
      live.seq++;
      liveBroadcast({ t: 'frame', seq: live.seq, mime: live.mime, data: msg.data });
      if (live.seq % 50 === 0) dc.sendMessage(JSON.stringify({ t: 'live-stat', seq: live.seq, viewers: live.viewers.size }));
    } else if (msg.t === 'live-stop') {
      live.on = false;
      audit(src, 'YAYIN-BITTI', live.title);
      log('Canlı yayın bitti.');
      liveBroadcast({ t: 'live-ended' });
      live.viewers.clear();
      live.header = null;
      dc.sendMessage(JSON.stringify({ t: 'live-stopped' }));
    } else if (msg.t === 'watch') {
      live.viewers.add(dc);
      dc.sendMessage(JSON.stringify(liveInfo()));
      if (live.on && live.header) dc.sendMessage(JSON.stringify({ t: 'frame', seq: 0, mime: live.mime, data: live.header }));
      audit(src, 'IZLEYICI-KATILDI', live.title);
    } else if (msg.t === 'unwatch') {
      live.viewers.delete(dc);
    } else if (msg.t === 'live-status') {
      dc.sendMessage(JSON.stringify(liveInfo()));
    } else if (msg.t === 'cancel') {
      const up = uploads.get(msg.id);
      if (up) { try { fs.closeSync(up.fd); fs.unlinkSync(up.path); } catch (e) {} uploads.delete(msg.id); }
    } else {
      dc.sendMessage(JSON.stringify({ t: 'error', reason: 'bilinmeyen-komut' }));
    }
  });
  dc.onClosed(() => {
    log(`Bağlantı kapandı ← ${src}`);
    live.viewers.delete(dc);
    for (const [id, up] of uploads) { try { fs.closeSync(up.fd); } catch (e) {} uploads.delete(id); }
    if (key) peers.delete(key);
  });
}


async function handleOffer(sig, msg) {
  const src = msg.src;
  const payload = msg.payload || {};
  const connectionId = payload.connectionId || 'c';

  // Güven listesi: tanıdık telefonlar onaysız bağlanır
  let ok = config.trusted.includes(src);
  if (!ok) {
    ok = await askApproval(src);
    if (ok) {
      config.trusted.push(src);
      saveConfig();
      log(`"${src}" güven listesine eklendi.`);
      audit(src, 'ESLESME-ONAY', '');
    } else {
      log(`"${src}" reddedildi.`);
      audit(src, 'ESLESME-RED', '');
      return; // cevap verme, telefon zaman aşımına düşer
    }
  }

  const pc = new ndc.PeerConnection('pc', {
    iceServers: ['stun:stun.l.google.com:19302'],
  });
  const entry = { pc, dc: null, src, connectionId };
  peers.set(`${src}|${connectionId}`, entry);

  pc.onLocalDescription((sdp, type) => {
    sig.send({
      type: 'ANSWER', src: sig.id, dst: src,
      payload: { sdp: { sdp, type }, type: 'data', connectionId, browser: 'sohbeto-pc-agent' },
    });
  });
  pc.onLocalCandidate((candidate, mid) => {
    if (!candidate) return;
    sig.send({
      type: 'CANDIDATE', src: sig.id, dst: src,
      payload: { candidate: { candidate, sdpMid: mid }, type: 'data', connectionId },
    });
  });
  pc.onDataChannel((dc) => {
    entry.dc = dc;
    handleChannel(src, dc);
  });
  pc.setRemoteDescription(payload.sdp.sdp, 'offer');
}

/* ----------------------- Sinyal (PeerJS bulut) --------------------- */
let ws = null;
let code = null;
let hbTimer = null;

function connect() {
  if (!code) code = config.code || makeCode();
  if (config.code !== code) { config.code = code; saveConfig(); }
  const id = peerIdFor(code);
  const token = crypto.randomBytes(8).toString('hex');
  const url = `${SIGNAL_HOST}&id=${encodeURIComponent(id)}&token=${token}`;
  log('Sinyal sunucusuna bağlanılıyor...');

  ws = new WebSocket(url);
  const sig = {
    id,
    send(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    },
  };

  ws.on('open', () => {
    const n = netInfo();
    log(`Bağlandı. Bilgisayar adı: ${config.pcName}`);
    log(`Ağ: ${n.ip || '?'}  MAC: ${n.mac || '?'}  (Wake-on-LAN için)`);
    log(`Paylaşılan klasörler: ${shareList().join(' | ') || 'yok'}`);
    log(`Günlük kota: ${config.dailyQuotaMB} MB • Kayıt: ${config.audit ? auditFile : 'kapalı'}`);
    showCode(code);
    clearInterval(hbTimer);
    hbTimer = setInterval(() => sig.send({ type: 'HEARTBEAT' }), 25000);
  });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (msg.type === 'OPEN') return;
    if (msg.type === 'ID-TAKEN') {
      log('Kod çakıştı, yeni kod üretiliyor...');
      code = makeCode();
      config.code = code; saveConfig();
      try { ws.close(); } catch (e) {}
      setTimeout(connect, 500);
      return;
    }
    if (msg.type === 'ERROR' || msg.type === 'INVALID-KEY') {
      log('Sinyal hatası:', msg.payload?.msg || msg.type);
      return;
    }
    if (msg.type === 'OFFER') {
      handleOffer(sig, msg).catch((e) => log('Teklif hatası:', e.message));
      return;
    }
    if (msg.type === 'CANDIDATE') {
      const p = msg.payload || {};
      const entry = peers.get(`${msg.src}|${p.connectionId || 'c'}`);
      if (entry && p.candidate) {
        try { entry.pc.addRemoteCandidate(p.candidate.candidate, p.candidate.sdpMid || '0'); } catch (e) {}
      }
      return;
    }
    // HEARTBEAT / EXPIRE / LEAVE: yoksay
  });

  ws.on('close', () => {
    clearInterval(hbTimer);
    log('Sinyal bağlantısı koptu, 5 sn içinde yeniden denenecek...');
    setTimeout(connect, 5000);
  });
  ws.on('error', (e) => log('Sinyal hatası:', e.message));
}

/* ------------------------------ Başlat ----------------------------- */
console.log('');
console.log('  SOHBETO PC AJANI  v' + VERSION);
console.log('  Kapatmak için bu pencereyi kapatman yeterli.');
connect();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

'use strict';
/**
 * prepare-native.js — pkg paketlemeden önce çalışır.
 * node-datachannel'ın bu platforma ait hazır .node binary'sini bulur ve
 * native/<platform-adı>.node olarak kopyalar. pkg bu dosyayı exe'nin içine
 * gömer; ajan ilk çalışmada onu geçici klasöre çıkarıp oradan yükler.
 */
const fs = require('fs');
const path = require('path');

function prebuildName() {
  const p = process.platform, a = process.arch;
  if (p === 'win32') return `win32-${a}-msvc`;
  if (p === 'darwin') return `darwin-${a}`;
  if (p === 'linux') return `linux-${a}-gnu`;
  return `${p}-${a}`;
}

const name = prebuildName();
const srcDir = path.join(__dirname, '..', 'node_modules', '@node-datachannel', name);

function findNodeFile(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      const r = findNodeFile(full);
      if (r) return r;
    } else if (f.name.endsWith('.node')) {
      return full;
    }
  }
  return null;
}

const found = findNodeFile(srcDir);
if (!found) {
  console.error(`HATA: ${name} için hazır binary bulunamadı (${srcDir}). "npm install" çalıştırıldı mı?`);
  process.exit(1);
}

const outDir = path.join(__dirname, '..', 'native');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, name + '.node');
fs.copyFileSync(found, out);
console.log(`Native binary hazır: native/${name}.node`);

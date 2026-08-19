# Sohbeto

Sohbeto — tam ekran, PWA olarak kurulabilen sohbet uygulaması.

- Arayüz: `public/apps/sohbetoOO.html` (varsayılan) ve `public/apps/sohbetoA2.html`
- Motor dosyaları (DOKUNULMAZ): `sohbeto-engine.js`, `sohbeto-adapter.js`,
  `sohbeto-extras.js`, `sohbeto-fluid-tabs.js`, `sohbeto-card-anim.js`,
  `sohbeto-peer.js`, `gunesos-store.js`
- Ek varlıklar: `public/apps/flag-dogu-turkistan.png` (bayrak/emoji seti için)

## GitHub Pages yayını

1. Depo adı **sohbeto** olmalı (yayın adresi `https://ankaratecno.github.io/sohbeto/`).
2. Settings → Pages → Source: **GitHub Actions**.
3. `main` dalına push → `.github/workflows/deploy.yml` build alır, `dist` yayınlanır.

`vite.config.ts` içinde production `base` = `/sohbeto/`, `public/manifest.json`
içindeki `scope`/`start_url` da `/sohbeto/` ile uyumludur; bu yüzden PWA
tam olarak `https://ankaratecno.github.io/sohbeto/` adresinden kurulur.

## PWA

- Service worker: `public/sw.js` (scope-aware, önbellek adları `sohbeto-*`)
- Kurulum kartı: `src/pwa/InstallSheet.tsx` (mobil/tablette 8 sn sonra)
- Lovable önizleme, iframe ve dev modda SW **kaydedilmez**.

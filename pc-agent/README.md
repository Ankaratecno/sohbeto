# Sohbeto PC Ajanı

Telefonundaki Sohbeto uygulaması ile bilgisayarın arasında **P2P (sunucusuz)
köprü** kuran küçük program. Dosya al/gönder, WoL gibi Faz 4 özelliklerinin
bilgisayar tarafıdır.

- Kurulum gerektirmez: tek dosya, çift tıkla çalışır.
- Mesaj/dosya içeriği hiçbir sunucudan geçmez; PeerJS bulutu yalnızca
  eşleştirme (sinyal) için kullanılır, veri WebRTC ile uçtan uca şifreli akar.

## Kullanıcı nasıl kurar?

1. Bu deponun **Releases** sayfasından kendi sistemine uygun dosyayı indir:
   - Windows: `sohbeto-pc-agent-windows.exe`
   - macOS: `sohbeto-pc-agent-macos`
   - Linux: `sohbeto-pc-agent-linux`
2. Dosyaya çift tıkla. Ekranda **6 haneli bir kod** belirir.
3. Telefonda Sohbeto → **Bilgisayarım** → "Kodu gir" ile bu kodu yaz.
4. Bilgisayar ekranında gelen onay sorusuna `e` de. Hepsi bu.

> Windows ilk açılışta "bilinmeyen yayıncı" uyarısı gösterebilir:
> "Ek bilgi" → "Yine de çalıştır" de. (İmza sertifikası ileride eklenebilir.)

### Bilgisayar her açıldığında kendiliğinden başlasın istersen (Windows)

1. `Win + R` → `shell:startup` → Enter.
2. Açılan klasöre `sohbeto-pc-agent-windows.exe` kısayolunu sürükle.

## Geliştirici / derleme

```bash
npm install
npm start            # normal çalıştırma (Node 18+)

npm run pack:win     # tek exe üretir (dist/sohbeto-pc-agent.exe)
npm run pack:linux
npm run pack:mac
```

GitHub'da otomatik paket: `v0.1.0` gibi bir **etiket at** → Actions üç
platform için paketleri üretip Releases'a ekler. Telefon uygulamasındaki
"PC Ajanını İndir" butonu bu Releases sayfasına bağlanır.

## Yol haritası (Faz 4)

- [x] F4.1 — Eşleşme kodu + P2P bağlantı + onay + güven listesi
- [x] F4.2 — Telefonda PC klasörünü listeleme + dosya indirme
- [x] F4.3 — Telefondan PC'ye dosya gönderme (F4.2 ile birlikte yapıldı)
- [x] F4.4 — WoL (kapalı PC'yi ağdan uyandırma) + çevrimiçi durumu
- [x] F4.5 — Ek güvenlik katmanları (kısıtlı klasör, kota, işlem kaydı)

## Güvenlik ayarları (F4.5)

Ajan ilk çalıştığında `config.json` dosyasına varsayılanları yazar
(Windows: `%APPDATA%\SohbetoAgent`, diğerleri: `~/.config/sohbeto-agent`):

```json
{
  "shares": ["~/Documents", "~/Downloads", "~/Desktop", "~/Pictures"],
  "maxFileMB": 2048,
  "dailyQuotaMB": 10240,
  "audit": true
}
```

- `shares` dışındaki hiçbir klasör telefondan görüntülenemez veya indirilemez.
- Tek dosya `maxFileMB`, günlük toplam trafik `dailyQuotaMB` ile sınırlıdır.
- Her işlem (eşleşme, indirme, gönderme, uyandırma, reddedilen istekler)
  `islem-kaydi.log` dosyasına tarih damgasıyla yazılır.

## F5.1 — Canlı yayın istasyonu (tamamlandı)

Telefon görüntüyü tek bir akış hâlinde ajana gönderir; dağıtımı bilgisayar yapar.

| Komut (telefon → ajan) | Yanıt (ajan → telefon) |
| --- | --- |
| `{t:'live-caps'}` | `{t:'live-caps', ok, station, maxViewers, live}` |
| `{t:'live-start', title, mime, by}` | `{t:'live-started', station, title}` |
| `{t:'frame', seq, data}` | (izleyicilere dağıtılır) `{t:'live-stat', seq, viewers}` |
| `{t:'live-stop'}` | `{t:'live-stopped'}` |
| `{t:'watch'}` | `{t:'live-info', ...}` + `frame` akışı |
| `{t:'unwatch'}` | — |

Yayın başlangıcı, bitişi ve izleyici katılımı `islem-kaydi.log` dosyasına yazılır.

### Sınırların paketlenmesi

`config.json` içindeki `shares`, `maxFileMB` ve `dailyQuotaMB` alanları
serbestçe değiştirilebilir; varsayılanlar yalnızca güvenli bir başlangıçtır ve
ileride ücretlendirme paketlerinin doğal ekseni olabilir.

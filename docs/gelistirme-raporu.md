# Pulse Radio — Geliştirme Raporu

**Tarih:** Temmuz 2026 · **Sürüm:** v15.0.10 · **Kapsam:** Tüm kod tabanı (`index.html`, `js/app.js`, `js/storage.js`, `css/styles.css`, `sw.js`, `src/lib/core.js`, testler, CI)

## Özet

Pulse Radio, olgunlaşmış ve iyi cilalanmış bir statik PWA. iOS kesinti yönetimi (IM), akıllı reconnect, Media Session, araba modu, ekonomi modu ve yedekleme akışları rakip birçok uygulamadan daha kapsamlı. Erişilebilirlik (focus trap, aria etiketleri, geri tuşu yönetimi) ve güvenlik hijyeni (URL doğrulama, private host filtresi, import limitler) yerinde.

Bu rapordaki bulgular üç eksende toplandı: **değişmesi gerekenler** (mevcut ama sorunlu), **eklenmesi gerekenler** (eksik özellik/fırsat), **kaldırılması gerekenler** (ölü kod / gereksiz yük). Sonda öncelik sıralı bir yol haritası var.

---

## 1. Değişmesi Gerekenler

### 1.1 `src/lib/core.js` "ayna modül" mimarisi — en büyük teknik borç

`core.js` kendini şöyle tanımlıyor: *"app.js içindeki saf yardımcı fonksiyonların test edilebilir AYNASIDIR... biri değişirse burası da birebir aynı davranışla güncellenmelidir."* Bu, elle senkronize tutulan kod kopyası demek; testler gerçek uygulamayı değil kopyasını test ediyor. Nitekim `8537820` commit'i tam da bu senkron kaymasını düzeltmek için atılmış.

**Öneri:** `index.html`'de `<script type="module">`'a geçilip `app.js`'in `core.js`'i doğrudan `import` etmesi. Build adımı gerekmez (ES modülleri tüm hedef tarayıcılarda native), statik hosting modeli bozulmaz. Tek seferde ~190 satır kopya kod silinir ve testler gerçek kodu test etmeye başlar.

### 1.2 `app.js` monoliti (2.190 satır, sıkıştırılmış stil)

Tek IIFE içinde tek harfli değişkenler ve boşluksuz satırlarla yazılmış ~55K token'lık dosya, her değişikliği riskli kılıyor. 1.1'deki modül geçişiyle birlikte mantıksal bölümlere ayrılabilir: `player.js` (S, IM, IOS, NP), `data.js` (LS, import/export), `ui.js` (render, modal), `api.js` (Radio Browser). Davranış değişikliği gerektirmez, yalnızca taşıma.

### 1.3 İlk açılış deneyimi: boş uygulama

Yeni kullanıcı sıfır kanalla başlıyor; radyo dinleyebilmek için önce arama yapıp kanal eklemesi gerekiyor. Bir radyo uygulaması için en kritik huni kaybı burası.

**Öneri:** Repo içine küçük bir `data/starter-stations.json` (20–30 popüler Türk radyosu: ad, URL, tür, bitrate) eklenip ilk açılışta "Popüler radyolarla başla / Boş başla" seçeneği sunulmalı. Statik dosya olduğu için SW precache'e girer, çevrimdışı da çalışır.

### 1.4 `prompt()` tabanlı akışlar tasarımla uyumsuz

Sync endpoint girişi (`askSyncEndpoint`, app.js:370), yedek linki yapıştırma (`doCloudRestore`, app.js:397) ve link gösterme fallback'i native `prompt()` kullanıyor. Uygulamanın geri kalanı özenli özel modallarla çalışırken bu akışlar sistem diyaloğuna düşüyor; bazı WebView/standalone ortamlarında `prompt()` sessizce `null` döner. Mevcut modal altyapısıyla (`setDialogOpen`) küçük bir giriş modalı yeterli.

### 1.5 Tür (genre) listesi iki yerde tanımlı

`GENRES` sabiti `app.js:7`'de, aynı liste `index.html:338`'de `<select>` seçenekleri olarak elle tekrarlanmış. Yeni tür ekleyen biri iki yeri de bulmak zorunda. `inC` select'i JS'te `GENRES`'ten doldurulmalı.

### 1.6 Sürüm numarası dört yerde

`package.json`, `app.js:5` (`APP_VERSION`), `sw.js:1` (`CACHE`), `core.js:6`. Lint tutarlılığı denetliyor ama bump işlemi elle. 10 satırlık bir `scripts/bump-version.mjs` (tek kaynaktan dört dosyayı yazan) hata sınıfını tamamen kapatır.

### 1.7 Google Fonts harici bağımlılığı

İki font ailesi (`Plus Jakarta Sans`, `Outfit`) Google sunucularından geliyor; `sw.js` bunları ayrıca cache'lemek için özel dal taşıyor (sw.js:36-51). Fontlar `woff2` olarak repoya alınırsa: üçüncü taraf istek/KVKK yüzeyi sıfırlanır, iki `preconnect` ve SW'deki `FONT_CACHE` dalı silinir, ilk açılış hızlanır. Statik hosting hedefiyle de daha tutarlı.

### 1.8 Manifest iyileştirmeleri

- `id` alanı yok — eklenmezse start_url değişikliğinde yüklü PWA kimliği kopar.
- `screenshots` yok — Android'de zengin yükleme diyaloğu (Richer Install UI) çıkmıyor.
- `orientation: "portrait"` araba moduyla çelişebilir; araba modunda yatay kullanım makul bir senaryo. `"any"` düşünülmeli (CSS zaten responsive).

---

## 2. Eklenmesi Gerekenler

### 2.1 HLS (m3u8) desteği — gerçek işlevsel boşluk

Manuel ekleme formu "MP3 / AAC / M3U8" vaat ediyor (index.html:336) ama `<audio>` elementi m3u8'i yalnızca Safari'de çalar; Chrome/Android'de bu istasyonlar sessizce başarısız olur ve reconnect döngüsüne düşer. Seçenekler:

- **A (önerilen):** `hls.js`'i repoya vendorlayıp (tek dosya, ~200KB) yalnızca URL `.m3u8` ile bitiyorsa ve `!aud.canPlayType('application/vnd.apple.mpegurl')` ise lazy-load etmek. "Bağımlılıksız" felsefe korunur (CDN yok, npm runtime bağımlılığı yok).
- **B (asgari):** HLS oynatılamayan tarayıcıda m3u8 URL'si eklenirken/çalınırken açık bir uyarı göstermek.

### 2.2 İstasyon düzenleme

Kanal eklendikten sonra ad, tür, emoji, logo veya URL **düzenlenemiyor**; tek seçenek silip yeniden eklemek (bu da favori/geçmiş bağını koparıyor). Manuel ekleme formu zaten mevcut; aynı form `editCh(id)` modunda açılarak düşük maliyetle çözülür. Ayarlar > Kanallarım listesindeki satırlara kalem ikonu yeterli.

### 2.3 Arama sonuçlarında "daha fazla yükle" ve yazarken arama

- Radio Browser aramaları 35 sonuçla kesiliyor; sayfalama (`offset` parametresi) yok.
- Arama buton tetiklemeli; uygulama içi kanal aramasında olduğu gibi 300–400ms debounce ile yazarken arama beklenen davranış.
- Dünya sekmesine ülke filtresi (Radio Browser `countrycode` zaten destekliyor) eklenebilir.

### 2.4 Dinleme istatistikleri

`rc` yalnızca son çalma zamanını tutuyor. Kanal başına toplam dinleme süresi (play/pause anlarında delta biriktirme — `DU` mantığının aynısı) tutulursa: "En çok dinlenenler" ana sayfa bölümü, ayarlarda "toplam dinleme süresi" istatistiği ve daha akıllı ana sayfa sıralaması mümkün olur. Depolama maliyeti kanal başına bir sayı.

### 2.5 Deep-link ile istasyon paylaşımı

`shareStation` şu an muhtemelen ad+URL paylaşıyor; alan kişi uygulamada tek dokunuşla ekleyemiyor. Yedek linki altyapısı (`#backup=`) zaten var — tek istasyonluk `#add=<token>` varyantı ile "paylaş → aç → ekle onayı" akışı kurulabilir. Ek olarak manifest'e `share_target` eklenirse Android'de başka uygulamadan stream URL'si doğrudan Pulse Radio'ya paylaşılabilir.

### 2.6 Açık tema

`color-scheme: dark` sabit. Kod tabanı zaten CSS değişkenleri kullanıyorsa (`styles.css`) `prefers-color-scheme: light` bloğu + ayarlarda üçlü seçim (Sistem/Koyu/Açık) orta maliyetli bir kazanım. Öncelik düşük — mevcut koyu tasarım tutarlı.

### 2.7 Test kapsamı

7 birim testi yalnızca `core.js` yardımcılarını kapsıyor. Kritik ve test edilmemiş saf mantık: `trMatchRange` (indeks eşleme), `DU.format`/ay devri, `extractBackupToken` kenar durumları, `pickSR` tür çıkarımı. Bunlar 1.1'deki modül geçişi sonrası doğrudan import edilip test edilebilir. E2E'ye "istasyon düzenleme" (2.2 yapılırsa) ve "yedek linki geri yükleme" akışları eklenmeli.

---

## 3. Kaldırılması Gerekenler

### 3.1 Eski tarayıcı fallback'leri — ölü kod

Kod tabanı her yerde optional chaining (`?.`), `Promise.finally`, `URLSearchParams` kullanıyor; bu sözdizimini parse edemeyen tarayıcı `app.js`'i hiç çalıştıramaz. Dolayısıyla şu fallback'ler erişilemez durumda:

- `firstFulfilled` içindeki `Promise.any` yokluğu dalı (app.js:58-69) — `Promise.any` optional chaining'den daha eski tarayıcılarda da var.
- `timeoutSignal`/`fetchWithTimeout` içindeki `AbortController === undefined` dalları (app.js:37-45).
- `storage.js`'teki `TextEncoder`/`TextDecoder` yokluğunda `unescape/escape` yolları (storage.js:28-29, 57).
- `window.MSStream` kontrolü (app.js:1898) — IE11 mobil tespiti, hedef kitlede yok.
- `webkit-playsinline` özniteliği (index.html:357) — iOS 10'dan beri gereksiz.

Tahmini kazanım ~40 satır ve daha okunur yardımcılar.

### 3.2 Özel Sync Endpoint (Buluta Yedekle / Buluttan Geri Yükle)

Üç ayar satırı + ~70 satır kod (`loadSyncCfg`…`syncPull`, app.js:353-432), kullanıcının **kendi HTTPS endpoint'ini barındırmasını** gerektiriyor. Hedef kitle (telefonda radyo dinleyen son kullanıcı) için erişilmez bir güç-kullanıcı özelliği; ayarlar sayfasını kalabalıklaştırıyor ve rastgele URL'ye POST atan bir yüzey açıyor. Anonim yedek linki + JSON dosyası ihtiyacı zaten karşılıyor. **Öneri:** tamamen kaldırmak; en azından "Gelişmiş" başlığı altına gizlemek.

### 3.3 Yinelenen apple-touch-icon

`index.html:14-15` aynı dosyayı iki `<link>` ile veriyor (`atiAny`, `ati180`). ID'lerine JS'te referans yok; teki yeterli.

### 3.4 `?page=add` yönlendirme fazlalığı

`initialRoute` hem `add` hem `a`'yı işliyor ve `add` durumunda modal açıyor — bu kalsın; ancak manifest kısayolu `./?page=add` kullanmıyor (fav/add/recent var, `add` kısayolu `Radyo Ekle`). Sorun değil, yalnızca not: route takma adları (`fav|favorites|f` vb.) test edilmiyor; birim test eklenirse sadeleştirilebilir.

---

## 4. Öncelikli Yol Haritası

| # | İş | Etki | Maliyet |
|---|---|---|---|
| 1 | Başlangıç istasyon paketi + boş durum onboarding'i (1.3) | Yüksek — ilk kullanım hunisi | Düşük |
| 2 | HLS desteği veya en azından uyarı (2.1) | Yüksek — sessiz çalma hatası | Orta |
| 3 | İstasyon düzenleme (2.2) | Yüksek — sık istenen temel özellik | Düşük |
| 4 | ES modül geçişi, ayna modülün kaldırılması (1.1) | Yüksek — teknik borç kökü | Orta |
| 5 | Ölü fallback'lerin temizliği (3.1) + sync endpoint kaldırma (3.2) | Orta | Düşük |
| 6 | `prompt()` → özel modal (1.4), GENRES tekilleştirme (1.5) | Orta | Düşük |
| 7 | Arama: debounce + sayfalama + ülke filtresi (2.3) | Orta | Orta |
| 8 | Fontları self-host etme (1.7), manifest `id`/`screenshots` (1.8) | Orta | Düşük |
| 9 | Dinleme istatistikleri (2.4), deep-link paylaşım (2.5) | Orta | Orta |
| 10 | app.js'in dosyalara bölünmesi (1.2), test genişletme (2.7) | Uzun vadeli sağlık | Orta |
| 11 | Açık tema (2.6) | Düşük | Orta |

## 5. Bilinçli Olarak Önerilmeyenler

- **Kayıt/hesap sistemi, gerçek bulut senkronu:** Sunucusuz statik model uygulamanın kimliği; anonim link yedeği yeterli.
- **Yayın kaydetme:** Telif ve depolama sorunları; PWA'da güvenilir arka plan kaydı da yok.
- **Ekolayzır (Web Audio):** Çoğu radyo stream'i CORS başlığı vermediği için `MediaElementSource` sessizlik üretir; iOS'ta ayrıca kesinti yönetimini bozar. Riski getirisinden büyük.
- **Alarm/radyoyla uyanma:** PWA'lar kapalıyken güvenilir zamanlayıcı çalıştıramaz; yarım çalışan özellik güven kaybettirir.
- **Framework'e geçiş (React/Vue):** Mevcut vanilla yapı hızlı ve bağımlılıksız; sorun framework eksikliği değil dosya organizasyonu (1.1/1.2 yeterli).

# Pulse Radio

Pulse Radio, tarayıcıda çalışan statik bir canlı radyo PWA uygulamasıdır. Kanal ekleme/düzenleme, Radio Browser üzerinden arama, favoriler, son dinlenenler, dinleme istatistikleri, ana sayfa, tam ekran oynatıcı, araba modu, uyku zamanlayıcısı, HLS desteği, açık/koyu tema, veri kullanımı takibi ve JSON/link yedekleme özelliklerini içerir.

## Özellikler

- Favori, son dinlenenler, dinleme istatistikleri ve kategori filtreleri
- Manuel radyo ekleme, düzenleme ve Radio Browser araması (yazarken arama, sayfalama, ülke filtresi)
- İlk açılışta popüler Türk radyolarından oluşan başlangıç paketi
- HLS (m3u8) desteği: Safari native, diğer tarayıcılarda vendorlanmış hls.js lazy yüklenir
- Media Session kontrolleri, tam ekran oynatıcı ve araba modu
- Dokunmatik jestler: tam ekran oynatıcıyı ve alt sayfaları aşağı sürükleyip kapatma, mini oynatıcıda yatay kaydırarak istasyon değiştirme, yukarı kaydırarak tam ekranı açma
- Aktif sekmeye yeniden dokunma listeyi en üste kaydırır (iOS'ta durum çubuğuna dokunma bu düzende çalışmadığı için)
- Sistem/Koyu/Açık tema seçimi (koyu tema OLED için saf siyah)
- Mini oynatıcıda hızlı "sonraki istasyon" düğmesi, geçmişi temizleme, pil dostu uyku zamanlayıcısı
- PWA kurulumu, service worker cache ve offline fallback
- JSON yedek dışa/içe aktarma, anonim yedek linki ve tek istasyonluk paylaşım linki
- Basit veri kullanımı tahmini ve düşük bağlantı uyarıları

## Tasarım ilkeleri (iPhone'u yormayan arayüz)

Arayüz iPhone 13 / iOS 27 hedeflenerek sade, iOS'a özgü gruplu listelerle tasarlandı ve ısınmaya yol açan her şey bilinçli olarak dışarıda bırakıldı:

- `backdrop-filter`, `filter: blur()` ve benzeri GPU süzgeçleri kullanılmaz; tüm yüzeyler opaktır.
- Sonsuz (infinite) CSS animasyonu yoktur; yalnızca dokunuşla tetiklenen kısa `transform`/`opacity` geçişleri vardır. Hareketli arka plan, dalga çubuğu ve ilerleme animasyonu kaldırıldı.
- Koyu tema saf siyahtır (`#000`); OLED ekranda siyah piksel güç harcamaz.
- Web fontu yerine sistem fontu (SF Pro) kullanılır; indirme ve çözme maliyeti yoktur.
- Uzun listeler `content-visibility` ile yalnızca ekrandayken çizilir.
- Uyku zamanlayıcısı saniyelik geri sayımı yalnızca oynatıcı açık ve ekran görünürken çizer.
- iOS'ta `audio.volume` salt okunur olduğundan çalışmayan ses kaydırıcısı gizlenir, yerine donanım tuşu notu gösterilir.

Bu kurallar `tests/unit.test.mjs` içindeki "CSS ısınma bütçesi" testiyle korunur.

## Geliştirme

Bu repo framework gerektirmeyen statik bir uygulama olarak kalır. Kod, build adımı olmadan tarayıcının native ES modülleriyle çalışır (`js/app.js`, paylaşılan saf yardımcıları `src/lib/core.js`'ten import eder). NPM yalnızca geliştirme, kalite kontrolü ve test komutları için kullanılır.

```bash
npm install
npm run dev
```

Yerel sunucu varsayılan olarak `http://localhost:4173` adresinde açılır.

## Komutlar

```bash
npm run lint
npm test
npm run test:e2e
```

- `lint`: temel dosya varlığı, HTML/PWA referansları, CSS brace dengesi ve JS syntax kontrollerini çalıştırır.
- `test`: URL doğrulama, Türkçe arama normalizasyonu, station doğrulama, import merge ve Radio Browser normalizasyonu birim testlerini çalıştırır.
- `test:e2e`: Playwright ile uygulamanın açılış, navigasyon, radyo ekleme, favori ve modal akışlarını dener.

## Yayınlama

Uygulama statik dosyalarla çalışır. GitHub Pages veya herhangi bir statik hosting kök dizine şu dosyaları koyarak yayınlayabilir:

- `index.html`
- `manifest.json`
- `sw.js`
- `css/`
- `js/`
- `src/`
- `data/`
- `screenshots/`
- `icons/`

Build adımı zorunlu değildir.

## PWA Notları

Service worker uygulama kabuğunu ve ikonları önbelleğe alır; radyo streamleri, range istekleri ve Radio Browser API çağrıları cache'lenmez. Cache sürümü `sw.js` içindeki `CACHE` sabitiyle yönetilir.

## Bilinen Sınırlar

- Radyo streamlerinin çalması yayın sağlayıcısının CORS, codec ve uptime durumuna bağlıdır.
- Now Playing bilgisi Icecast/Shoutcast endpointleri izin verdiğinde best-effort olarak görünür.
- CI, gerçek radyo yayınını doğrulamaz; uygulama akışlarını ve güvenli veri işleme mantığını test eder.

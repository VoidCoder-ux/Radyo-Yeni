# TürkRadyo

TürkRadyo, tarayıcıda çalışan statik bir canlı radyo PWA uygulamasıdır. Kanal ekleme, Radio Browser üzerinden arama, favoriler, son dinlenenler, tam ekran oynatıcı, araba modu, uyku zamanlayıcısı, veri kullanımı takibi ve JSON yedek içe/dışa aktarma özelliklerini içerir.

## Özellikler

- Favori, son dinlenenler ve kategori filtreleri
- Manuel radyo ekleme ve Radio Browser araması
- Media Session kontrolleri, tam ekran oynatıcı ve araba modu
- PWA kurulumu, service worker cache ve offline fallback
- JSON yedek dışa/içe aktarma
- Basit veri kullanımı tahmini ve düşük bağlantı uyarıları

## Geliştirme

Bu repo framework gerektirmeyen statik bir uygulama olarak kalır. NPM yalnızca geliştirme, kalite kontrolü ve test komutları için kullanılır.

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
- `src/`
- `icons/`

Build adımı zorunlu değildir.

## PWA Notları

Service worker uygulama kabuğunu ve ikonları önbelleğe alır; radyo streamleri, range istekleri ve Radio Browser API çağrıları cache'lenmez. Cache sürümü `sw.js` içindeki `APP_VERSION` ile yönetilir.

## Bilinen Sınırlar

- Radyo streamlerinin çalması yayın sağlayıcısının CORS, codec ve uptime durumuna bağlıdır.
- Now Playing bilgisi Icecast/Shoutcast endpointleri izin verdiğinde best-effort olarak görünür.
- CI, gerçek radyo yayınını doğrulamaz; uygulama akışlarını ve güvenli veri işleme mantığını test eder.

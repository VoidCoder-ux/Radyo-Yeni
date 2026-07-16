// hls.js'in light dağıtımını node_modules'ten js/vendor/ altına kopyalar.
// Sürüm yükseltme: package.json devDependencies'te hls.js'i güncelle,
// `npm install && npm run vendor:hls` çalıştır, değişikliği commit'le.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('node_modules/hls.js/package.json', 'utf8'));
mkdirSync('js/vendor', { recursive: true });
copyFileSync('node_modules/hls.js/dist/hls.light.min.js', 'js/vendor/hls.light.min.js');
console.log(`Vendored hls.js ${pkg.version} -> js/vendor/hls.light.min.js`);

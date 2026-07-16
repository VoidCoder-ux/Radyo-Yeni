// Değişken (variable) fontları node_modules'ten fonts/ altına kopyalar.
// Sürüm yükseltme: devDependencies'teki @fontsource-variable paketlerini
// güncelleyip `npm install && npm run vendor:fonts` çalıştırın.
import { copyFileSync, mkdirSync } from 'node:fs';

const files = [
  ['node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2', 'fonts/plus-jakarta-sans-latin-wght-normal.woff2'],
  ['node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-ext-wght-normal.woff2', 'fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2'],
  ['node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2', 'fonts/outfit-latin-wght-normal.woff2'],
  ['node_modules/@fontsource-variable/outfit/files/outfit-latin-ext-wght-normal.woff2', 'fonts/outfit-latin-ext-wght-normal.woff2']
];

mkdirSync('fonts', { recursive: true });
for (const [from, to] of files) {
  copyFileSync(from, to);
  console.log(`${from} -> ${to}`);
}

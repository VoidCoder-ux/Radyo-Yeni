import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);

const types = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function resolveRequest(url) {
  const parsed = new URL(url, `http://localhost:${port}`);
  const safePath = normalize(parsed.pathname).replace(/^(\.\.[/\\])+/, '');
  const target = resolve(join(root, safePath));
  if (!target.startsWith(root)) return null;
  if (!existsSync(target)) return null;
  if (statSync(target).isDirectory()) return join(target, 'index.html');
  return target;
}

const server = createServer((request, response) => {
  const file = resolveRequest(request.url);
  if (!file || !existsSync(file)) {
    response.writeHead(404, { 'content-type': 'text/plain;charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(response);
});

server.listen(port, () => {
  console.log(`TürkRadyo dev server: http://localhost:${port}`);
});

// Two origins so the ad unit is cross-origin to the host, like production.
//   :4173 host page   (host-demo/dist, /img -> media/host)
//   :4174 ad + media  (adslot/dist, /creative -> media/creative, POST /beacon)
// Gzips text, sends Timing-Allow-Origin so the bench can see cross-origin transfer sizes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.vtt': 'text/vtt',
};
const TEXT = /\.(html|js|css|json|m3u8|vtt)$/;

function server(port, mounts) {
  return http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Timing-Allow-Origin', '*');
    if (pathname === '/beacon') return res.writeHead(204).end();
    const [prefix, dir] = mounts.find(([p]) => pathname.startsWith(p));
    let file = path.join(root, dir, pathname.slice(prefix.length));
    if (!file.startsWith(path.join(root, dir))) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    const ext = path.extname(file);
    res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    let body = fs.readFileSync(file);
    if (TEXT.test(file) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
      body = zlib.gzipSync(body, { level: 9 });
      res.setHeader('Content-Encoding', 'gzip');
    }
    res.writeHead(200).end(body);
  }).listen(port);
}

export function start() {
  return [
    server(4173, [['/img/', 'media/host'], ['/', 'packages/host-demo/dist']]),
    server(4174, [['/creative/', 'media/creative'], ['/', 'packages/adslot/dist']]),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start();
  console.log('host http://localhost:4173  (?ad=0 for baseline, /layouts.html for layouts)\nad   http://localhost:4174');
}

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${host}:${port}`).pathname;
  const allowed = { '/': 'dist/index.html', '/index.html': 'dist/index.html', '/Snapoly.html': 'Snapoly.html', '/PolySnap.html': 'Snapoly.html', '/THIRD_PARTY_NOTICES.txt': 'THIRD_PARTY_NOTICES.txt', '/music/controlled-groove.mp3':'dist/music/controlled-groove.mp3', '/music/digital-arpeggio.mp3':'dist/music/digital-arpeggio.mp3', '/sw.js':'dist/sw.js', '/manifest.webmanifest':'dist/manifest.webmanifest', '/icons/icon-180.png':'dist/icons/icon-180.png', '/icons/icon-192.png':'dist/icons/icon-192.png', '/icons/icon-512.png':'dist/icons/icon-512.png' };
  const file = allowed[pathname];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(path.join(root, file));
    const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.webmanifest') ? 'application/manifest+json' : file.endsWith('.mp3') ? 'audio/mpeg' : file.endsWith('.png') ? 'image/png' : 'text/plain; charset=utf-8';
    res.writeHead(200, { 'Content-Type':type, 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(500); res.end('Run npm run build first.'); }
});
server.listen(port, host, () => console.log(`Snapoly: http://${host}:${port}`));

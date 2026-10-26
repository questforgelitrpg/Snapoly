import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Script } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
if (/[/\\]OneDrive[/\\]/i.test(root)) throw new Error('Build outside OneDrive.');
const result = await build({
  entryPoints: [path.join(root, 'src/app.js')], bundle: true, write: false,
  format: 'iife', target: 'es2020', minify: true, legalComments: 'none'
});
const template = await readFile(path.join(root, 'src/index.html'), 'utf8');
const css = await readFile(path.join(root, 'src/style.css'), 'utf8') + '\n' + await readFile(path.join(root, 'src/mobile.css'), 'utf8');
const js = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
// Function replacers preserve literal $&, $' and $` inside bundled shader code.
const html = template.replace('<!-- STYLES -->', () => `<style>${css}</style>`)
  .replace('<!-- GAME -->', () => `<script>${js}</script>`);
// Validate the actual embedded payload, not just the bundler output.
const embedded = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
new Script(embedded, { filename: 'Snapoly.html:inline-script' });
const tracks=[{title:'Controlled Groove',file:'controlled-groove.mp3'},{title:'Digital Arpeggio',file:'digital-arpeggio.mp3'}];
const webTracks=tracks.map(t=>({title:t.title,url:`music/${t.file}`}));
const localTracks=await Promise.all(tracks.map(async t=>({title:t.title,url:'data:audio/mpeg;base64,'+(await readFile(path.join(root,'public/music',t.file))).toString('base64')})));
const catalog=list=>`<script id="music-catalog" type="application/json">${JSON.stringify(list)}</script>`;
await writeFile(path.join(root, 'Snapoly.html'), html.replace('<!-- MUSIC -->',()=>catalog(localTracks)));
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist/index.html'), html.replace('<!-- MUSIC -->',()=>catalog(webTracks)));
await copyFile(path.join(root, 'THIRD_PARTY_NOTICES.txt'), path.join(root, 'dist/THIRD_PARTY_NOTICES.txt'));
const { cp } = await import('node:fs/promises');
await cp(path.join(root, 'public'), path.join(root, 'dist'), { recursive:true });
console.log(`Built Snapoly.html and dist/index.html (${Math.round(Buffer.byteLength(html) / 1024)} KB).`);

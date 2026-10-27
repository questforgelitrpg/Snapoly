import {cp,mkdir,readFile,writeFile,stat} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));if(/[/\\]OneDrive(?:[/\\]|$)/i.test(root))throw Error('Build outside OneDrive.');
const out=path.join(root,'website');await mkdir(out,{recursive:true});await cp(path.join(root,'site'),out,{recursive:true});await cp(path.join(root,'dist'),path.join(out,'play'),{recursive:true});
// Hosted pages only: keep the standalone game and Android bundle offline.
const analytics='<script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments);};</script><script defer src="/_vercel/insights/script.js"></script>';
for(const page of ['index.html','play/index.html']){const file=path.join(out,page);const html=await readFile(file,'utf8');await writeFile(file,html.replace('</body>',analytics+'</body>'));}
const apk=path.join(out,'downloads/Snapoly-0.5.0-android.apk');const info=await stat(apk);if(info.size<1000000)throw Error('Android download missing or incomplete.');
const sha=createHash('sha256').update(await readFile(apk)).digest('hex');await writeFile(path.join(out,'downloads/SHA256SUMS.txt'),`${sha}  Snapoly-0.5.0-android.apk\n`);
console.log(`Built website with web game, iPhone PWA and verified Android download (${sha}).`);

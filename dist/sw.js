const CACHE = 'polysnap-mobile-v13-snapoly-save';
const BASE=new URL('./',self.location).pathname;
const ASSETS = ['/', '/manifest.webmanifest', '/icons/icon-180.png', '/icons/icon-192.png', '/icons/icon-512.png', '/music/controlled-groove.mp3', '/music/digital-arpeggio.mp3'].map(p=>BASE+p.slice(1));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('polysnap-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      // A private host may redirect expired sessions to sign-in. Never cache that
      // page as the game, or replace the offline game with an error response.
      if (response.ok && !response.redirected) {
        const copy = response.clone();caches.open(CACHE).then(cache => cache.put(BASE,copy));
      }
      return response;
    }).catch(() => caches.match(BASE)));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then(async hit => {
      if(!hit)return fetch(event.request);
      const range=event.request.headers.get('range');
      if(!range||!url.pathname.endsWith('.mp3'))return hit;
      // Safari requests byte ranges for media, including offline cached tracks.
      const bytes=await hit.arrayBuffer(),size=bytes.byteLength,match=/^bytes=(\d*)-(\d*)$/.exec(range);
      let start=match?.[1]?Number(match[1]):0,end=match?.[2]?Number(match[2]):size-1;
      if(match&&!match[1]&&match[2]){start=Math.max(0,size-Number(match[2]));end=size-1;}
      if(!match||(!match[1]&&!match[2])||start>=size||start>end)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
      end=Math.min(end,size-1);
      return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':'audio/mpeg','Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`}});
    }));
  }
});

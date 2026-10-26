let deferredInstall = null;
let ready = false;
const nativeAndroid = !!document.querySelector('meta[name="polysnap-native"][content="android"]');
export function setupPwa() {
  if (nativeAndroid) return;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();deferredInstall = event;
  });
  if ('serviceWorker' in navigator && ['https:','http:'].includes(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
        ready = true;
        document.querySelectorAll('[data-offline-status]').forEach(el => el.textContent='Ready for offline play');
      }).catch(() => {});
    });
  }
  document.addEventListener('click', async event => {
    if (!event.target.closest('[data-install-game]')) return;
    if (deferredInstall) {
      await deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall = null;
    }
  });
}
export function installInstructions() {
  if (nativeAndroid) return '<div class="install-note">Android test app · ready for offline play</div>';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
  if (standalone) return `<div class="install-note"><span data-offline-status>${ready?'Ready for offline play':'Preparing offline play…'}</span></div>`;
  return `<div class="install-note"><strong>Keep Snapoly on your home screen</strong><br>${ios?'Tap Share, then Add to Home Screen in Safari.':'In Chrome, open ⋮ and choose Add to Home screen or Install app.'}<br><span data-offline-status>${ready?'Ready for offline play':'Keep this page open briefly to prepare offline play.'}</span>${deferredInstall?'<br><button class="install-inline" data-install-game>Install Snapoly ↗</button>':''}</div>`;
}

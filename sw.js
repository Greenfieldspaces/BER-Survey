// Offline support: keep the app and its fonts on the device so it opens with no signal
const CACHE='ber-survey-v2';
const SHELL=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  // the app itself: open the saved copy straight away (works with no or weak signal), refresh it in the background
  if(url.origin===location.origin){
    const key=req.mode==='navigate'?'index.html':req;
    const update=fetch(req).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(key,cp))}return r});
    e.respondWith(caches.match(key,{ignoreSearch:true}).then(r=>r||update.catch(()=>caches.match('index.html'))));
    e.waitUntil(update.catch(()=>{}));
    return;
  }
  // fonts: saved copy first
  if(/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp));return res})));
  }
});

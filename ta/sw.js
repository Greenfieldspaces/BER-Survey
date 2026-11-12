// Offline support for the Upgrade Report app (its own cache; the BER Survey app's cache is separate)
const CACHE='ta-v1';
const SHELL=['./','index.html','app.js','reports.js','calc.js','parse.js','pdftext.js','pdf.min.js','pdf.worker.min.js','logo.png','manifest.webmanifest','../jspdf.umd.min.js','../jspdf.plugin.autotable.min.js','../icon-192.png','../icon-512.png','../apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('ta-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url); if(url.origin!==location.origin) return;
  const key=req.mode==='navigate'?new URL('index.html',self.registration.scope).href:req;
  const update=fetch(req).then(r=>{ if(r.ok){ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(key,cp)); } return r; });
  e.respondWith(caches.match(key,{ignoreSearch:true}).then(r=>r||update.catch(()=>caches.match(new URL('index.html',self.registration.scope).href))));
  e.waitUntil(update.catch(()=>{}));
});

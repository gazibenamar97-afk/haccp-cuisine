/* Service Worker strictement limité à /offline-lab/. Ne touche pas au cache de production. */
const OFFLINE_CACHE='mt-haccp-offline-lab-20261015-v1';
const CORE=['./index.html','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(OFFLINE_CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('mt-haccp-offline-lab-')&&k!==OFFLINE_CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);
 const scopePath=new URL(self.registration.scope).pathname;
 if(url.origin!==self.location.origin||!url.pathname.startsWith(scopePath))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(response=>response.ok?response:Promise.reject(Error('Network HTTP '+response.status)))
   .then(async response=>{const cache=await caches.open(OFFLINE_CACHE);await cache.put('./index.html',response.clone());return response})
   .catch(async()=>await caches.match('./index.html')||Response.error()));
  return;
 }
 event.respondWith(caches.match(req).then(hit=>hit||fetch(req)));
});
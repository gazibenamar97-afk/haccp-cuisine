const CACHE='mt-haccp-shell-v130';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
 self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('mt-haccp-')&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return; // Firebase et API restent en ligne, jamais en cache.
 if(req.mode==='navigate'){
  event.respondWith((async()=>{
   try{
    const response=await fetch(req,{cache:'no-store'});
    if(response.ok){const cache=await caches.open(CACHE);await cache.put('./index.html',response.clone())}
    return response;
   }catch(error){
    return (await caches.match('./index.html'))||Response.error();
   }
  })());
  return;
 }
 event.respondWith((async()=>{
  try{
   const response=await fetch(req);
   if(response.ok){const cache=await caches.open(CACHE);await cache.put(req,response.clone())}
   return response;
  }catch(error){return (await caches.match(req))||Response.error()}
 })());
});

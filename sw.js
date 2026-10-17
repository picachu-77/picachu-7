/* Network-only: never store Firebase responses, rosters or authenticated pages. */
self.addEventListener('install',function(event){event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',function(event){event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',function(event){
 if(event.request.mode!=='navigate'||!event.request.url.startsWith(self.registration.scope))return;
 event.respondWith(fetch(event.request).catch(function(){
  return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>인터넷 연결 확인</title><body style="margin:40px 24px;font-family:system-ui;background:#f6f8f6;color:#0f1714;line-height:1.7"><h1>인터넷 연결을 확인해 주세요</h1><p>동호회 자료를 불러오려면 인터넷 연결이 필요합니다.</p><a href="./">다시 연결</a></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
 }));
});

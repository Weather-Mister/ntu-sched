self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Never cache mail, passwords, API responses, or the app shell here.
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let value;try{value=event.data.json();}catch{return;}
 try{const response=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});if(response.ok&&(await response.json()).studentNumber!==value.studentNumber)return;
  // Login cookies may expire while the PWA is closed. Never unsubscribe a
  // healthy push endpoint just because the background session has expired.
 }catch{/* An offline device may still display the generic, private alert. */}
 const test=value.kind==='test';
 await self.registration.showNotification(test?'Campus Week test':'New NTU mail',{body:test?'Test push received successfully.':'You have new mail in Campus Mail.',tag:test?'campus-mail-test':'campus-mail',icon:'/mail-icon-512.png',data:{url:'/skeleton/?mail=1'}});
})()));
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true}),tab=tabs.find(t=>new URL(t.url).pathname.startsWith('/skeleton/'));if(tab){await tab.focus();tab.postMessage({type:'open-mail'});}else await self.clients.openWindow('/skeleton/?mail=1');})());
});

/* Installation UI only; account data and credentials are never cached here. */
(function(){
 var installPrompt=null;
 function standalone(){return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
 window.installControl=function(){return standalone()?'':'<button type="button" class="btn gho" data-install-app>휴대폰에 앱 설치</button>';};
 function refresh(){document.querySelectorAll('[data-install-app]').forEach(function(el){el.hidden=standalone();});}
 window.addEventListener('beforeinstallprompt',function(event){event.preventDefault();installPrompt=event;refresh();});
 window.addEventListener('appinstalled',function(){installPrompt=null;refresh();});
 window.matchMedia('(display-mode: standalone)').addEventListener('change',refresh);
 function instructions(){
  var previous=document.getElementById('install-dialog');if(previous){previous.showModal();return;}
  var ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  var dialog=document.createElement('dialog');dialog.id='install-dialog';dialog.setAttribute('aria-labelledby','install-title');
  dialog.style.cssText='width:min(90vw,440px);padding:24px;border:1px solid #dfe6e1;border-radius:20px;background:#fff;color:#0f1714;line-height:1.7';
  dialog.innerHTML='<h2 id="install-title">홈 화면에 앱 설치</h2>'+(ios?
   '<p>Safari에서 이 사이트를 연 뒤 <strong>공유 → 홈 화면에 추가 → 추가</strong>를 눌러 주세요. “웹 앱으로 열기”가 나오면 켜 두세요.</p>':
   '<p>안드로이드는 Chrome에서 이 사이트를 열고 오른쪽 위 <strong>⋮ → 앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 눌러 주세요.</p><p>아이폰은 Safari의 <strong>공유 → 홈 화면에 추가</strong>를 이용하세요.</p>')+
   '<p>카카오톡 등의 앱 안에서 열었다면 먼저 Safari 또는 Chrome으로 열어 주세요. 컴퓨터에서는 브라우저 주소창의 설치 메뉴를 이용할 수 있습니다.</p><p>설치 후 홈 화면 아이콘으로 실행할 수 있습니다. 로그인과 동호회 자료 이용에는 인터넷 연결이 필요합니다.</p><form method="dialog"><button class="btn pri" autofocus>확인</button></form>';
  document.body.appendChild(dialog);dialog.addEventListener('close',function(){dialog.remove();});dialog.showModal();
 }
 document.addEventListener('click',async function(event){
  var button=event.target.closest('[data-install-app]');if(!button)return;
  if(standalone())return;
  if(!installPrompt){instructions();return;}
  var prompt=installPrompt;installPrompt=null;button.disabled=true;
  try{await prompt.prompt();await prompt.userChoice;}catch(e){instructions();}finally{button.disabled=false;refresh();}
 });
 if('serviceWorker' in navigator&&window.isSecureContext){
  window.addEventListener('load',function(){navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(function(){/* Browser menu installation remains available. */});});
 }
})();

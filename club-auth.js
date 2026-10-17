/* Account and club portal. Permissions are enforced by DB rules. */
var AUTH={ready:false,user:null,profile:null,profileLoaded:false,superadmin:false,busy:false,error:'',message:'',mode:'login',username:'',view:'home',clubId:null,clubs:{},memberships:{},adminMembers:{},allAccess:null};
var authGeneration=0,identityGeneration=0,rawDb=null,accessWatches=[],clubWatches=[],adminWatch=null,boundClub=null;
function authEscape(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function authError(e){
 var messages={'auth/invalid-email':'아이디를 확인해 주세요.','auth/user-not-found':'아이디 또는 비밀번호를 확인해 주세요.','auth/wrong-password':'아이디 또는 비밀번호를 확인해 주세요.','auth/invalid-credential':'아이디 또는 비밀번호를 확인해 주세요.','auth/invalid-login-credentials':'아이디 또는 비밀번호를 확인해 주세요.','auth/email-already-in-use':'이미 사용 중인 아이디입니다.','auth/requires-recent-login':'다시 로그인한 후 비밀번호를 변경해 주세요.','auth/weak-password':'비밀번호는 8자 이상으로 입력해 주세요.','auth/network-request-failed':'인터넷 연결을 확인해 주세요.','auth/too-many-requests':'요청이 많습니다. 잠시 후 다시 시도해 주세요.','PERMISSION_DENIED':'권한 또는 승인 상태를 확인해 주세요. 책임 관리자는 후임 지정 후 권한을 변경할 수 있습니다.','permission-denied':'권한 또는 승인 상태를 확인해 주세요. 책임 관리자는 후임 지정 후 권한을 변경할 수 있습니다.'};
 return messages[e&&e.code]||(e&&!e.code?e.message:'요청을 처리하지 못했습니다. 다시 시도해 주세요.');
}
function field(id,label,type,extra){return '<label class="portal-field" for="'+id+'">'+label+'<input class="inp" id="'+id+'" name="'+id+'" type="'+(type||'text')+'" '+(extra||'')+'></label>';}
function button(label,action,extra,kind){return '<button type="button" class="btn '+(kind||'gho')+'" data-portal="'+action+'" '+(extra||'')+(AUTH.busy?' disabled':'')+'>'+label+'</button>';}
function notice(){return '<p class="portal-notice" role="'+(AUTH.error?'alert':'status')+'">'+authEscape(AUTH.error||AUTH.message)+'</p>';}
function renderAuth(){
  var signup=AUTH.mode==='signup',disabled=!AUTH.ready||AUTH.busy?' disabled':'';
  document.getElementById('app').innerHTML='<main class="wrap auth-wrap"><section class="card"><div class="app-mark">⚡🏸</div><h1 class="ttl">피카츄의 배드민턴매치</h1><p class="sub">내 동호회와 함께하는 배드민턴</p><h2>'+(signup?'회원가입 신청':'아이디로 로그인')+'</h2><form id="portal-login">'
    +field('username','아이디','text','required minlength="4" maxlength="24" pattern="[a-zA-Z0-9][a-zA-Z0-9_]{3,23}" autocomplete="username" value="'+authEscape(AUTH.username)+'"'+disabled)
    +'<p class="sub">영문·숫자·밑줄 4~24자 (대소문자 구분 없음)</p>'
    +field('password','비밀번호','password','required '+(signup?'minlength="8"':'')+' maxlength="128" autocomplete="'+(signup?'new-password':'current-password')+'"'+disabled)
    +(signup?field('password-confirm','비밀번호 확인','password','required minlength="8" maxlength="128" autocomplete="new-password"'+disabled)+field('display-name','본인 이름','text','required maxlength="40" autocomplete="name" placeholder="본인 이름을 입력해 주세요"'+disabled)
      +'<label class="portal-field" for="signup-kind">가입 방법<select class="inp" id="signup-kind"'+disabled+'><option value="join">동호회 코드로 가입 신청</option><option value="create">새 동호회 생성 신청</option></select></label>'
      +'<div id="signup-join">'+field('signup-code','동호회 코드','text','required maxlength="10" autocapitalize="characters"'+disabled)+'</div>'
      +'<div id="signup-create" hidden>'+field('signup-name','새 동호회 이름','text','maxlength="60"'+disabled)+'</div><p class="sub">동호회 가입은 동호회 관리자가, 신규 동호회는 총관리자가 승인합니다.</p>':'')
    +notice()+(!AUTH.ready&&!AUTH.error?'<p role="status">로그인 서비스를 연결하고 있어요.</p>':'')
    +'<button class="btn pri" type="submit" style="width:100%"'+disabled+'>'+(AUTH.busy?'처리 중…':signup?'가입 신청':'로그인')+'</button></form><div class="brow portal-gap">'
    +button(signup?'로그인으로 돌아가기':'회원가입','auth-mode','data-mode="'+(signup?'login':'signup')+'"')+(typeof installControl==='function'?installControl():'')+'</div>'
    +'<p class="sub portal-gap">비밀번호를 잊었다면 앱 총관리자에게 문의해 주세요.</p>'
    +(!AUTH.ready&&AUTH.error?button('다시 연결','reload'):'')+'</section></main>';
  bindPortal();
  document.getElementById('portal-login').onsubmit=submitAuth;
  var kind=document.getElementById('signup-kind');if(kind)kind.onchange=function(){var create=this.value==='create';document.getElementById('signup-join').hidden=create;document.getElementById('signup-create').hidden=!create;document.getElementById('signup-code').required=!create;document.getElementById('signup-name').required=create;};
}
function submitAuth(e){
  e.preventDefault();if(!AUTH.ready||AUTH.busy)return;
  var username=document.getElementById('username').value.trim().toLowerCase(),password=document.getElementById('password').value;
  AUTH.username=username;var data={username:username,password:password},signup=AUTH.mode==='signup';
  if(signup){
    if(password!==document.getElementById('password-confirm').value){AUTH.error='비밀번호가 서로 다릅니다.';document.querySelector('.portal-notice').textContent=AUTH.error;document.querySelector('.portal-notice').setAttribute('role','alert');return;}
    data.displayName=document.getElementById('display-name').value.trim();
    if(document.getElementById('signup-kind').value==='create')data.newClubName=document.getElementById('signup-name').value.trim();else data.code=document.getElementById('signup-code').value.trim().toUpperCase();
  }
  AUTH.busy=true;AUTH.error='';AUTH.message='';renderAuth();
  callServer(signup?'registerAccount':'loginById',data).catch(function(error){AUTH.error=authError(error);}).finally(function(){AUTH.busy=false;render();});
}
function watch(path,handler,list){
  var ref=rawDb.ref(path),epoch=identityGeneration;
  var cb=function(s){if(epoch===identityGeneration)handler(s.val());};
  var cancel=function(error){if(epoch!==identityGeneration)return;AUTH.error='접근 권한을 확인하지 못했습니다. 다시 로그인해 주세요.';resetClubData();render();};
  ref.on('value',cb,cancel);(list||accessWatches).push(function(){ref.off('value',cb);});
}
function stopList(list){list.splice(0).forEach(function(stop){stop();});}
function stopAdmin(){if(adminWatch){adminWatch();adminWatch=null;}AUTH.adminMembers={};AUTH.allAccess=null;}
function resetClubData(){
  if(typeof stopEventSchedule==='function')stopEventSchedule();
  authGeneration++;
  if(db)['roster','groupNames','stats','session'].forEach(function(path){db.ref(path).off();});
  db=null;boundClub=null;
  var dialog=document.getElementById('restore-dialog');if(dialog)dialog.remove();
  var theme=S.theme;S=JSON.parse(initialAppState);S.theme=theme;
}
function activeProfile(){return AUTH.user&&AUTH.profile&&AUTH.profile.status==='active';}
function allowedClub(cid){var c=AUTH.clubs[cid],m=AUTH.memberships[cid];return !!(activeProfile()&&c&&c.status==='approved'&&(AUTH.superadmin||(m&&m.status==='approved')));}
function clubCanUse(){return AUTH.view==='app'&&allowedClub(AUTH.clubId)&&boundClub===AUTH.clubId;}
function canManageClub(cid){if(!cid||!AUTH.clubs[cid]||AUTH.clubs[cid].status==='rejected')return false;var m=AUTH.memberships[cid];return !!(activeProfile()&&(AUTH.superadmin||(allowedClub(cid)&&m&&m.role==='admin')));}
function preferredClub(){
 var ids=Object.keys(AUTH.profile&&AUTH.profile.clubs||{}).sort().filter(allowedClub),saved='';
 try{saved=localStorage.getItem('badminton:lastClub:'+AUTH.user.uid)||'';}catch(e){}
 return ids.includes(saved)?saved:ids[0];
}
function autoOpenClub(){
 if(AUTH.view!=='home'||!activeProfile()||AUTH.registering)return false;
 var ids=Object.keys(AUTH.profile.clubs||{}).filter(function(cid){return !AUTH.clubs[cid]||AUTH.clubs[cid].status!=='rejected';});
 if(!ids.every(function(cid){return Object.prototype.hasOwnProperty.call(AUTH.clubs,cid)&&Object.prototype.hasOwnProperty.call(AUTH.memberships,cid);}))return false;
 var cid=preferredClub();if(!cid)return false;
 openClub(cid);return true;
}
function refreshAccess(){
  if(!activeProfile()||!allowedClub(AUTH.clubId)){if(boundClub)resetClubData();if(AUTH.view==='app')AUTH.view='clubs';}
  if(AUTH.view==='clubAdmin'&&!canManageClub(AUTH.clubId)){stopAdmin();AUTH.view='clubs';}
  if(AUTH.view==='super'&&!AUTH.superadmin){stopAdmin();AUTH.view='clubs';}
  if(autoOpenClub())return;
  render();
}
function startAuth(){
  firebase.auth().onAuthStateChanged(function(user){
    identityGeneration++;stopList(accessWatches);stopList(clubWatches);stopAdmin();resetClubData();
    AUTH.user=user;AUTH.ready=true;AUTH.busy=false;AUTH.profile=null;AUTH.profileLoaded=false;AUTH.superadmin=false;AUTH.clubs={};AUTH.memberships={};AUTH.clubId=null;AUTH.view='home';AUTH.error='';AUTH.message='';
    if(!user){render();return;}
    rawDb=firebase.database();var uid=user.uid,ids='';
    watch('access/profiles/'+uid,function(p){
      AUTH.profile=p;AUTH.profileLoaded=true;
      var next=Object.keys(p&&p.clubs||{}).sort().join(',');
      if(next!==ids){ids=next;stopList(clubWatches);AUTH.clubs={};AUTH.memberships={};
        Object.keys(p&&p.clubs||{}).forEach(function(cid){
          watch('access/clubs/'+cid,function(c){AUTH.clubs[cid]=c;refreshAccess();},clubWatches);
          watch('access/members/'+cid+'/'+uid,function(m){AUTH.memberships[cid]=m;refreshAccess();},clubWatches);
        });
      }
      refreshAccess();
    });
    watch('access/superadmins/'+uid,function(v){AUTH.superadmin=v===true;refreshAccess();});
    render();
  },function(e){AUTH.error=authError(e);AUTH.ready=false;renderAuth();});
}
function openClub(cid){
  if(!allowedClub(cid)){AUTH.error='동호회와 회원 승인이 필요합니다.';render();return;}
  stopAdmin();resetClubData();AUTH.clubId=cid;AUTH.view='app';boundClub=cid;AUTH.error='';AUTH.message='';
  try{localStorage.setItem('badminton:lastClub:'+AUTH.user.uid,cid);}catch(e){}
  db={ref:function(path){return rawDb.ref('clubData/'+cid+'/'+path);}};
  render();fbListen();
}
function logout(){
  if(AUTH.busy)return;AUTH.busy=true;resetClubData();render();
  firebase.auth().signOut().catch(function(e){AUTH.error=authError(e);AUTH.view='clubs';}).finally(function(){AUTH.busy=false;render();});
}
function accountDisplayName(profile){
  if(profile.username==='hh3355')return '이동하';
  if(profile.username==='chease312'&&profile.displayName==='chease312')return '최승현';
  return profile.displayName;
}
function accountBar(){
  var name=AUTH.profile?accountDisplayName(AUTH.profile):'계정';
  var controls=button('설정','clubs','aria-label="설정 열기"');
  if(AUTH.view!=='app')controls=(preferredClub()?button('동호회로 돌아가기','home'):'')+controls+(AUTH.superadmin?button('총관리','super'):'')+button('로그아웃','logout');
  return '<div class="account-bar"><span>'+authEscape([(AUTH.clubs[AUTH.clubId]||{}).name,name].filter(Boolean).join(' · '))+'</span>'+controls+'</div>';
}
var statusLabels={pending:'승인 대기',approved:'승인됨',rejected:'반려',removed:'탈퇴 처리',suspended:'사용 중지',active:'사용 중'};
function statusLabel(v){return statusLabels[v]||'확인 중';}
function clubCards(){
  var ids=Object.keys(AUTH.profile.clubs||{}).filter(function(cid){return !AUTH.clubs[cid]||AUTH.clubs[cid].status!=='rejected';});
  if(!ids.length)return '<p class="sub">아직 신청한 동호회가 없습니다. 코드로 가입하거나 새 동호회를 신청해 주세요.</p>';
  return ids.map(function(cid){var c=AUTH.clubs[cid],m=AUTH.memberships[cid];if(!c||!m)return '<p>동호회 확인 중…</p>';
    return '<section class="card"><h2>'+authEscape(c.name)+'</h2><p class="sub">동호회 '+statusLabel(c.status)+' · 내 가입 '+statusLabel(m.status)+' · '+(m.role==='admin'?'동호회 관리자':'회원')+'</p>'
      +(m.status==='approved'?'<p>가입 코드 <strong>'+authEscape(c.code)+'</strong> '+button('코드 복사','copy-code','data-code="'+authEscape(c.code)+'"')+'</p>':'')
      +'<div class="brow portal-gap">'+(allowedClub(cid)?button('동호회 입장','open','data-club="'+authEscape(cid)+'"','pri'):'')+(canManageClub(cid)?button('회원 관리','club-admin','data-club="'+authEscape(cid)+'"'):'')+'</div></section>';
  }).join('');
}
function formsHtml(){return (typeof installControl==='function'&&installControl()?'<section class="card"><h2>앱 설치</h2><p class="sub">휴대폰 홈 화면에서 바로 실행하세요.</p>'+installControl()+'</section>':'')+'<div class="portal-grid"><section class="card"><h2>동호회 가입 신청</h2><form id="join-form">'+field('join-code','동호회 코드','text','required maxlength="10" autocapitalize="characters"')+'<button class="btn pri" type="submit"'+(AUTH.busy?' disabled':'')+'>가입 신청</button></form></section><section class="card"><h2>새 동호회 만들기</h2><p class="sub">총관리자 승인 후 사용할 수 있습니다. 승인되면 신청자가 동호회 관리자가 됩니다.</p><form id="create-form">'+field('club-name','동호회 이름','text','required maxlength="60"')+'<button class="btn pri" type="submit"'+(AUTH.busy?' disabled':'')+'>생성 승인 요청</button></form></section></div><details class="card"><summary>내 비밀번호 변경</summary><form id="password-form">'+field('new-password','새 비밀번호','password','required minlength="8" maxlength="128" autocomplete="new-password"')+field('confirm-password','새 비밀번호 확인','password','required minlength="8" maxlength="128" autocomplete="new-password"')+'<button class="btn gho" type="submit"'+(AUTH.busy?' disabled':'')+'>변경 후 로그아웃</button></form></details>';}
function memberRows(cid,members){
 return Object.keys(members||{}).map(function(uid){var m=members[uid],attrs='data-club="'+authEscape(cid)+'" data-uid="'+authEscape(uid)+'"';
  var actions='';
  if(['pending','rejected','removed'].includes(m.status))actions+=button(m.status==='pending'?'가입 승인':'재승인','member',attrs+' data-operation="approve"','pri');
  if(m.status==='pending')actions+=button('반려','member',attrs+' data-operation="reject"');
  if(m.status==='approved'){
    actions+=button(m.role==='admin'?'관리자 권한 회수':'관리자 지정','member',attrs+' data-operation="'+(m.role==='admin'?'demote':'promote')+'"');
    if(AUTH.superadmin&&m.role==='admin'&&(AUTH.clubs[cid]||{}).ownerUid!==uid)actions+=button('책임 관리자 지정','transfer-owner',attrs);
    actions+=button('동호회 탈퇴 처리','member',attrs+' data-operation="remove"','dan');
  }
  return '<div class="portal-row"><div><strong>'+authEscape(accountDisplayName(m))+'</strong> <span>'+authEscape(m.username)+'</span><p class="sub">'+statusLabel(m.status)+' · '+(m.role==='admin'?((AUTH.clubs[cid]||{}).ownerUid===uid?'책임 관리자':'관리자'):'회원')+'</p></div><div class="brow">'+actions+'</div></div>';
 }).join('')||'<p>회원 정보를 불러오는 중입니다.</p>';
}
function superHtml(){
 var a=AUTH.allAccess;if(!a)return '<p>전체 현황을 불러오는 중입니다.</p>';
 var clubs=Object.keys(a.clubs||{}).filter(function(cid){return a.clubs[cid].status!=='rejected';}).map(function(cid){var c=a.clubs[cid],attr='data-club="'+authEscape(cid)+'"',buttons='';
  if(c.status==='pending')buttons=button('동호회 승인','review-club',attr+' data-status="approved"','pri')+button('반려','review-club',attr+' data-status="rejected"');
  if(['approved','suspended'].includes(c.status))buttons=button(c.status==='suspended'?'운영 재개':'동호회 사용 중지','club-status',attr+' data-status="'+(c.status==='suspended'?'approved':'suspended')+'"');
  return '<section class="card"><h3>'+authEscape(c.name)+'</h3><p class="sub">'+statusLabel(c.status)+' · 코드 '+authEscape(c.code)+'</p><div class="brow">'+buttons+button('회원 관리','club-admin',attr)+(c.status==='approved'?button('동호회 입장','open',attr):'')+'</div></section>';
 }).join('');
 var accounts=Object.keys(a.profiles||{}).map(function(uid){var p=a.profiles[uid],attr='data-uid="'+authEscape(uid)+'"',isRoot=a.superadmins&&a.superadmins[uid];
  return '<div class="portal-row"><div><strong>'+authEscape(accountDisplayName(p))+'</strong> '+authEscape(p.username)+'<p class="sub">'+statusLabel(p.status)+(isRoot?' · 총관리자':'')+'</p></div><div class="brow">'
    +(uid===AUTH.user.uid?'<span>내 계정</span>':(p.status==='active'?button('계정 사용 중지','account',attr+' data-status="suspended"')+button('앱 탈퇴 처리','account',attr+' data-status="removed"','dan'):button('계정 복구','account',attr+' data-status="active"')))
    +(p.status==='active'?button(isRoot?'총관리자 권한 회수':'총관리자 지정','super-role',attr+' data-enabled="'+(!isRoot)+'"'):'')+'</div></div>';
 }).join('');
 return '<h1 class="ttl">앱 총관리</h1><p class="sub">신규 동호회 승인 · 전체 계정과 관리자 권한 관리</p><h2>동호회</h2><div class="portal-grid">'+clubs+'</div><section class="card"><h2>전체 계정</h2>'+accounts+'</section>';
}
function renderPortal(){
 if(!AUTH.user){renderAuth();return;}
 var body='';
 if(AUTH.registering)body='<p role="status">계정과 동호회 신청을 저장하고 있어요.</p>';
 else if(!AUTH.profileLoaded)body='<p role="status">계정 권한을 확인하고 있어요.</p>';
 else if(!AUTH.profile)body='<h1 class="ttl">아이디 연결이 필요합니다</h1><p>계정 정보를 저장한 뒤 동호회에 가입 신청할 수 있습니다.</p>'+button('계정 설정 완료','complete-profile');
 else if(!activeProfile())body='<h1 class="ttl">'+statusLabel(AUTH.profile.status)+'</h1><p>계정 접근 권한이 없습니다. 총관리자에게 문의해 주세요.</p>';
 else if(AUTH.view==='super'&&AUTH.superadmin)body=superHtml();
 else if(AUTH.view==='clubAdmin'&&canManageClub(AUTH.clubId))body='<h1 class="ttl">'+authEscape((AUTH.clubs[AUTH.clubId]||{}).name)+' 회원 관리</h1><p class="sub">가입 승인 · 탈퇴 처리 · 관리자 권한 관리</p><section class="card">'+memberRows(AUTH.clubId,AUTH.adminMembers)+'</section>';
 else body=(AUTH.view==='clubs'?'<h1 class="ttl">설정</h1>':'')+(AUTH.user.email==='rnftm312@gmail.com'?'<section class="card"><h2>꿀배 초기 설정</h2><p class="sub">총관리자를 연결하고 기존 공용 자료를 꿀배로 복사합니다. 이미 가져온 자료는 덮어쓰지 않습니다.</p>'+button('총관리자·꿀배 설정','setup-kkulbae','','pri')+'</section>':'')+'<h1 class="ttl">내 동호회</h1><p class="sub">가입과 동호회 생성 승인이 완료되면 입장할 수 있어요.</p><div class="portal-grid">'+clubCards()+'</div>'+formsHtml();
 document.getElementById('app').innerHTML='<main class="wrap portal-wrap">'+accountBar()+notice()+body+'</main>';
 bindPortal();bindForms();
}
function actionRequest(data){
 if(AUTH.busy)return Promise.resolve();AUTH.busy=true;AUTH.error='';AUTH.message='';render();
 return callServer('manageClub',data).then(function(){AUTH.message='처리되었습니다.';}).catch(function(e){AUTH.error=authError(e);}).finally(function(){AUTH.busy=false;render();});
}
function showAdmin(cid){
 if(!canManageClub(cid))return;stopAdmin();resetClubData();AUTH.clubId=cid;AUTH.view='clubAdmin';
 var ref=rawDb.ref('access/members/'+cid),epoch=identityGeneration;
 var cb=function(s){if(epoch!==identityGeneration||AUTH.view!=='clubAdmin'||AUTH.clubId!==cid)return;AUTH.adminMembers=s.val()||{};render();};
 ref.on('value',cb,function(){AUTH.error='관리자 권한이 변경되었습니다.';stopAdmin();AUTH.view='clubs';render();});adminWatch=function(){ref.off('value',cb);};render();
}
function showSuper(){
 if(!AUTH.superadmin)return;stopAdmin();resetClubData();AUTH.view='super';
 var ref=rawDb.ref('access'),epoch=identityGeneration;
 var cb=function(s){if(epoch!==identityGeneration||AUTH.view!=='super')return;AUTH.allAccess=s.val()||{};Object.assign(AUTH.clubs,AUTH.allAccess.clubs||{});render();};
 ref.on('value',cb,function(){AUTH.error='총관리자 권한이 변경되었습니다.';stopAdmin();AUTH.view='clubs';render();});adminWatch=function(){ref.off('value',cb);};render();
}
function bindPortal(){
 document.querySelectorAll('[data-portal]').forEach(function(el){el.onclick=function(){
  if(AUTH.busy)return;var d=this.dataset,action=d.portal;AUTH.error='';AUTH.message='';
  if(action==='reload')location.reload();
  else if(action==='auth-mode'){AUTH.username=(document.getElementById('username')||{}).value||AUTH.username;AUTH.mode=d.mode;renderAuth();}
  else if(action==='logout')logout();
  else if(action==='setup-kkulbae'){if(confirm('기존 공용 자료를 꿀배로 복사하고 총관리자를 설정할까요? 기존 자료는 보존됩니다.')){AUTH.busy=true;render();setupKkulbae().then(function(message){AUTH.message=message;}).catch(function(e){AUTH.error=authError(e);}).finally(function(){AUTH.busy=false;render();});}}
  else if(action==='complete-profile'){AUTH.busy=true;completeProfile().catch(function(e){AUTH.error=authError(e);}).finally(function(){AUTH.busy=false;render();});}
  else if(action==='home'){var cid=preferredClub();if(cid)openClub(cid);}
  else if(action==='clubs'){stopAdmin();resetClubData();AUTH.view='clubs';render();}
  else if(action==='open')openClub(d.club);
  else if(action==='club-admin')showAdmin(d.club||AUTH.clubId);
  else if(action==='super')showSuper();
  else if(action==='copy-code'){navigator.clipboard.writeText(d.code).then(function(){toast('동호회 코드를 복사했습니다.');}).catch(function(){toast('동호회 코드: '+d.code);});}
  else {
   var data={clubId:d.club,uid:d.uid};
   if(action==='member'){data.action='member';data.operation=d.operation;}
   if(action==='review-club'){data.action='reviewClub';data.status=d.status;}
   if(action==='club-status'){data.action='clubStatus';data.status=d.status;}
   if(action==='account'){data.action='account';data.status=d.status;}
   if(action==='transfer-owner'){data.action='transferOwner';}
   if(action==='super-role'){data.action='superRole';data.enabled=d.enabled==='true';}
   if(data.action&&confirm(this.textContent+' 하시겠습니까?'))actionRequest(data);
  }
 };});
}
function bindForms(){
 var join=document.getElementById('join-form');if(join)join.onsubmit=function(e){e.preventDefault();actionRequest({action:'joinClub',code:document.getElementById('join-code').value.trim().toUpperCase()});};
 var create=document.getElementById('create-form');if(create)create.onsubmit=function(e){e.preventDefault();actionRequest({action:'createClub',name:document.getElementById('club-name').value.trim()});};
 var password=document.getElementById('password-form');if(password)password.onsubmit=function(e){
  e.preventDefault();if(AUTH.busy)return;var p=document.getElementById('new-password').value;
  if(p!==document.getElementById('confirm-password').value){AUTH.error='비밀번호가 서로 다릅니다.';render();return;}
  AUTH.busy=true;AUTH.error='';render();callServer('changePassword',{password:p}).then(function(){return firebase.auth().signOut();}).catch(function(error){AUTH.error=authError(error);}).finally(function(){AUTH.busy=false;render();});
 };
}

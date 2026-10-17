/* Spark-only data operations. Every mutation is independently authorized by RTDB rules. */
function loginAddress(username){
 var id=String(username||'').trim().toLowerCase();
 if(!/^[a-z0-9][a-z0-9_]{3,23}$/.test(id))throw Error('아이디는 영문·숫자·밑줄 4~24자로 입력해 주세요.');
 return id==='chease312'?'rnftm312@gmail.com':id+'@users.badminton.invalid';
}
function accountUsername(user){if(user.email==='rnftm312@gmail.com')return 'chease312';if(/@users\.badminton\.invalid$/.test(user.email||''))return user.email.split('@')[0].toLowerCase();throw Error('기존 이메일 계정의 아이디 연결은 총관리자에게 문의해 주세요.');}
function newClubCode(){var bytes=new Uint8Array(5);crypto.getRandomValues(bytes);return Array.from(bytes).map(function(b){return b.toString(16).padStart(2,'0');}).join('').toUpperCase();}
function currentMember(role,status){return {username:AUTH.profile.username,displayName:AUTH.profile.displayName,role:role,status:status,createdAt:firebase.database.ServerValue.TIMESTAMP};}
async function completeProfile(displayName){
 var user=firebase.auth().currentUser;if(!user)throw Error('로그인이 필요합니다.');
 var db=firebase.database(),ref=db.ref('access/profiles/'+user.uid),old=(await ref.once('value')).val();if(old){AUTH.profile=old;AUTH.profileLoaded=true;return old;}
 var name=String(displayName||user.displayName||accountUsername(user)).trim();if(!name||name.length>40)throw Error('이름은 1~40자로 입력해 주세요.');
 var value={username:accountUsername(user),displayName:name,status:'active',createdAt:firebase.database.ServerValue.TIMESTAMP};
 await ref.set(value);AUTH.profile=(await ref.once('value')).val();AUTH.profileLoaded=true;return AUTH.profile;
}
async function sparkManage(data){
 var user=firebase.auth().currentUser;if(!user)throw Error('로그인이 필요합니다.');
 var database=firebase.database(),uid=user.uid,updates={},cid=data.clubId;
 if(data.action==='createClub'){
  var name=String(data.name||'').trim();if(!name||name.length>60)throw Error('동호회 이름은 1~60자로 입력해 주세요.');
  cid=newClubCode();
  updates['access/clubs/'+cid]={name:name,code:cid,ownerUid:uid,status:'pending',createdAt:firebase.database.ServerValue.TIMESTAMP};
  updates['access/members/'+cid+'/'+uid]=currentMember('admin','pending');
  updates['access/profiles/'+uid+'/clubs/'+cid]=true;
 }else if(data.action==='joinClub'){
  cid=String(data.code||'').trim().toUpperCase();if(!/^[A-Z0-9]{10}$/.test(cid))throw Error('동호회 코드는 영문·숫자 10자리입니다.');
  var club=(await database.ref('access/clubs/'+cid).once('value')).val();
  if(!club||club.status!=='approved')throw Error('가입 가능한 동호회 코드를 확인해 주세요.');
  var previous=(await database.ref('access/members/'+cid+'/'+uid).once('value')).val();
  if(previous)throw Error('이미 신청했거나 탈퇴 처리된 동호회입니다. 관리자에게 문의해 주세요.');
  updates['access/members/'+cid+'/'+uid]=currentMember('member','pending');updates['access/profiles/'+uid+'/clubs/'+cid]=true;
 }else if(data.action==='reviewClub'){
  var club=(await database.ref('access/clubs/'+cid).once('value')).val();if(!club||club.status!=='pending')throw Error('승인 대기 중인 동호회가 아닙니다.');
  updates['access/clubs/'+cid+'/status']=data.status;
  updates['access/members/'+cid+'/'+club.ownerUid+'/status']=data.status;
  updates['access/members/'+cid+'/'+club.ownerUid+'/role']='admin';
 }else if(data.action==='member'){
  var path='access/members/'+cid+'/'+data.uid;
  var target=(await database.ref(path).once('value')).val();if(!target)throw Error('회원을 찾을 수 없습니다.');
  var operations={approve:['approved','member'],reject:['rejected','member'],remove:['removed','member'],promote:['approved','admin'],demote:['approved','member']};
  var change=Object.prototype.hasOwnProperty.call(operations,data.operation)&&operations[data.operation];if(!change)throw Error('지원하지 않는 작업입니다.');
  updates[path+'/status']=change[0];updates[path+'/role']=change[1];
 }else if(data.action==='clubStatus')updates['access/clubs/'+cid+'/status']=data.status;
 else if(data.action==='transferOwner')updates['access/clubs/'+cid+'/ownerUid']=data.uid;
 else if(data.action==='account')updates['access/profiles/'+data.uid+'/status']=data.status;
 else if(data.action==='superRole')updates['access/superadmins/'+data.uid]=data.enabled?true:null;
 else throw Error('지원하지 않는 요청입니다.');
 await database.ref().update(updates);return {ok:true};
}
async function configureLoginPersistence(enabled){
 await firebase.auth().setPersistence(enabled===true?'local':'session');
 try{localStorage.setItem('badminton:autoLogin',String(enabled===true));}catch(e){}
}
async function callServer(name,data){
 if(name==='loginById'){await configureLoginPersistence(data.autoLogin);await firebase.auth().signInWithEmailAndPassword(loginAddress(data.username),data.password);return {ok:true};}
 if(name==='registerAccount'){
  data.displayName=String(data.displayName||'').trim();
  if(!data.displayName||data.displayName.length>40)throw Error('본인 이름을 1~40자로 입력해 주세요.');
  if(String(data.password||'').length<8)throw Error('비밀번호는 8자 이상으로 입력해 주세요.');
  if(String(data.username).toLowerCase()==='chease312')throw Error('이미 사용 중인 아이디입니다.');
  AUTH.registering=true;
  try{
   await configureLoginPersistence(data.autoLogin);
   var credential=await firebase.auth().createUserWithEmailAndPassword(loginAddress(data.username),data.password);
   await credential.user.updateProfile({displayName:String(data.displayName||'').trim()});
   await completeProfile(data.displayName);
   return await sparkManage(data.newClubName?{action:'createClub',name:data.newClubName}:{action:'joinClub',code:data.code});
  }finally{AUTH.registering=false;}
 }
 if(name==='manageClub')return sparkManage(data);
 if(name==='changePassword'){
  if(!firebase.auth().currentUser)throw Error('로그인이 필요합니다.');
  await firebase.auth().currentUser.updatePassword(data.password);return {ok:true};
 }
 throw Error('지원하지 않는 작업입니다.');
}
async function setupKkulbae(){
 var user=firebase.auth().currentUser;if(!user||user.email!=='rnftm312@gmail.com')throw Error('지정된 최초 총관리자 계정으로 로그인해 주세요.');
 await completeProfile();var database=firebase.database(),uid=user.uid,updates={},cid='KKULBAE001';
 var pinned=(await database.ref('access/system/ownerUid').once('value')).val();
 if(pinned&&pinned!==uid)throw Error('다른 최초 총관리자가 이미 설정되어 있습니다.');
 if(!pinned)updates['access/system/ownerUid']=uid;
 var isRoot=(await database.ref('access/superadmins/'+uid).once('value')).val();
 if(isRoot!==true)updates['access/superadmins/'+uid]=true;
 if(Object.keys(updates).length)await database.ref().update(updates);
 var club=(await database.ref('access/clubs/'+cid).once('value')).val();
 if(club&&(club.name!=='꿀배'||club.ownerUid!==uid))throw Error('기본 동호회 코드가 다른 동호회에서 사용 중입니다.');
 if(!club){
  updates={};updates['access/clubs/'+cid]={name:'꿀배',code:cid,ownerUid:uid,status:'pending',createdAt:firebase.database.ServerValue.TIMESTAMP};updates['access/members/'+cid+'/'+uid]=currentMember('admin','pending');updates['access/profiles/'+uid+'/clubs/'+cid]=true;
  await database.ref().update(updates);club={status:'pending'};
 }
 if(club.status==='pending')await sparkManage({action:'reviewClub',clubId:cid,status:'approved'});
 else if(club.status!=='approved')throw Error('꿀배 동호회 운영 상태를 확인해 주세요.');
 var legacy={},keys=['roster','stats','session','groupNames'];
 await Promise.all(keys.map(async function(key){var value=(await database.ref(key).once('value')).val();if(value!==null)legacy[key]=value;}));
 if(!Object.keys(legacy).length)return '총관리자와 꿀배 설정 완료. 가져올 기존 자료가 없습니다.';
 var result=await database.ref('clubData/'+cid).transaction(function(current){return current===null?legacy:undefined;},undefined,false);
 return result.committed?'총관리자와 꿀배 설정 및 기존 자료 가져오기를 완료했습니다.':'총관리자와 꿀배가 설정되어 있습니다. 기존 꿀배 자료는 보존했습니다.';
}

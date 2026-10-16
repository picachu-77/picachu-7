'use strict';
// Run only in a trusted admin environment. Dry-run by default; no passwords needed.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {initializeApp,applicationDefault}=require('../functions/node_modules/firebase-admin/app');
const {getAuth}=require('../functions/node_modules/firebase-admin/auth');
const {getDatabase}=require('../functions/node_modules/firebase-admin/database');
const D=require('../functions/domain');
const projectId='badminton-e0788',email='rnftm312@gmail.com',username='chease312',clubId='kkulbae',clubName='꿀배';
if(process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.FIREBASE_DATABASE_EMULATOR_HOST)throw Error('Bootstrap is for the explicit production project. Do not mix emulator settings.');
initializeApp({credential:applicationDefault(),projectId,databaseURL:'https://badminton-e0788-default-rtdb.firebaseio.com'});
function validateData(value){if(typeof value==='string'&&(value.length>256||/[<>"'&]/.test(value)))throw Error('기존 자료에 허용되지 않는 문자열이 있습니다. 자료를 검토한 뒤 다시 실행하세요.');if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(/[<>"'&]/.test(k))throw Error('기존 자료의 이름을 검토해 주세요.');validateData(v);}}
(async()=>{
 const user=await getAuth().getUserByEmail(email);if(user.disabled)throw Error('총관리자 계정이 사용 중지 상태입니다.');
 const root=getDatabase().ref(),snap=await root.get(),before=snap.val()||{};
 const legacy={};for(const k of ['roster','stats','session','groupNames'])if(before[k]!==undefined)legacy[k]=before[k];validateData(legacy);
 const a=D.init(before.access),oldClub=a.clubs[clubId];
 if(a.usernames[username]&&a.usernames[username]!==user.uid)throw Error('아이디가 다른 계정에 연결되어 있습니다.');
 if(oldClub&&(oldClub.ownerUid!==user.uid||oldClub.name!==clubName))throw Error('대상 동호회가 이미 다른 소유자로 존재합니다.');
 console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',projectId,email,username,clubName,existingPassword:'preserved',copyLegacy:!before.clubData?.[clubId],legacyCollections:Object.keys(legacy)},null,2));
 if(!process.argv.includes('--apply'))return;
 const dir=path.join(__dirname,'../backups');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const file=path.join(dir,'before-clubs-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify(before),{mode:0o600,flag:'wx'});
 const code=oldClub?.code||crypto.randomBytes(5).toString('hex').toUpperCase(),now=Date.now();let failure;
 const result=await root.transaction(current=>{
  try{
   current=current||{};const access=D.init(current.access);const profile=access.profiles[user.uid];
   if(access.usernames[username]&&access.usernames[username]!==user.uid)throw Error('Username changed during bootstrap.');
   if(profile&&profile.username!==username)throw Error('Existing profile has a different username.');
   if(access.clubs[clubId]&&(access.clubs[clubId].ownerUid!==user.uid||access.clubs[clubId].name!==clubName))throw Error('Club changed during bootstrap.');
   if(access.codes[code]&&access.codes[code]!==clubId)throw Error('Club code collision; retry.');
   access.profiles[user.uid]={...(profile||{}),username,displayName:profile?.displayName||'꿀배 총관리자',status:'active',createdAt:profile?.createdAt||now,clubs:{...(profile?.clubs||{}),[clubId]:true}};
   access.usernames[username]=user.uid;access.superadmins[user.uid]=true;
   access.clubs[clubId]={...(access.clubs[clubId]||{}),name:clubName,code,status:'approved',ownerUid:user.uid,createdAt:access.clubs[clubId]?.createdAt||now};access.codes[code]=clubId;
   access.members[clubId]=access.members[clubId]||{};access.members[clubId][user.uid]={username,displayName:access.profiles[user.uid].displayName,role:'admin',status:'approved',createdAt:now};
   current.access=access;current.clubData=current.clubData||{};
   if(!current.clubData[clubId]){const copy={};for(const k of ['roster','stats','session','groupNames'])if(current[k]!==undefined)copy[k]=current[k];validateData(copy);current.clubData[clubId]=copy;}
   return current;
  }catch(e){failure=e;return;}
 });
 if(!result.committed)throw failure||Error('Bootstrap transaction did not commit.');
 console.log('총관리자/꿀배 연결 완료. 기존 비밀번호 유지. 백업: '+file);
})().catch(e=>{console.error(e.message);process.exitCode=1;});

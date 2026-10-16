'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getDatabase}=require('firebase-admin/database');
const {randomBytes,createHash}=require('node:crypto');
const domain=require('./domain');
initializeApp();
const db=getDatabase(),auth=getAuth();
const options={region:'asia-northeast3',maxInstances:10,cors:['https://picachu-77.github.io','https://picachu-7.vercel.app'],timeoutSeconds:30};
const WEB_API_KEY='AIzaSyDwJb2U13k5aBgk5toecGp-j025lupdd00'; // Public Firebase web key, not an admin credential.
function context(){return {clubId:db.ref('access/clubs').push().key,code:randomBytes(5).toString('hex').toUpperCase(),auditId:db.ref('access/audit').push().key,now:Date.now()};}
const {transact}=require('./access-store');
async function transaction(change){return transact(db.ref('access'),change);}
function callable(fn){return onCall(options,async request=>{try{return await fn(request);}catch(error){
 if(error instanceof HttpsError)throw error;
 if(error instanceof domain.DomainError)throw new HttpsError(error.code,error.message);
 if(error.code==='auth/email-already-exists')throw new HttpsError('already-exists','이미 사용 중인 아이디입니다.');
 // Never log request bodies: they may contain passwords.
 console.error('Club operation failed', {code:error.code||'unknown'});
 throw new HttpsError('internal','요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
 }});}
async function rateLimit(request,kind,limit){
 const ip=request.rawRequest.ip||'unknown';
 const bucket=Math.floor(Date.now()/600000);
 const hash=createHash('sha256').update(ip+':'+kind+':'+bucket).digest('hex');
 const r=await db.ref('rateLimits/'+hash).transaction(v=>{if(v&&v.count>=limit)return;return {count:(v?v.count:0)+1,expiresAt:(bucket+1)*600000};});
 if(!r.committed)throw new HttpsError('resource-exhausted','요청이 많습니다. 10분 후 다시 시도해 주세요.');
}
async function requireUser(request){
 if(!request.auth)throw new HttpsError('unauthenticated','로그인이 필요합니다.');
 // Admin mutations must reject revoked tokens as well as suspended metadata.
 const [user,profileSnapshot]=await Promise.all([auth.getUser(request.auth.uid),db.ref('access/profiles/'+request.auth.uid).get()]);
 const profile=profileSnapshot.val();
 if(!profile||profile.status!=='active'||(request.auth.token.auth_time||0)<(profile.validAfter||0))throw new HttpsError('permission-denied','계정 권한이 변경되었습니다. 다시 로그인해 주세요.');
 const validAfter=Date.parse(user.tokensValidAfterTime||'1970-01-01')/1000;
 if(user.disabled||(request.auth.token.auth_time||0)<validAfter)throw new HttpsError('unauthenticated','다시 로그인해 주세요.');
 return request.auth.uid;
}
exports.loginById=callable(async request=>{
 await rateLimit(request,'login',30);
 const id=domain.username(request.data.username),password=request.data.password;
 if(typeof password!=='string'||password.length>128)throw new HttpsError('invalid-argument','비밀번호를 확인해 주세요.');
 const uid=(await db.ref('access/usernames/'+id).get()).val();
 const invalid=()=>new HttpsError('unauthenticated','아이디 또는 비밀번호를 확인해 주세요.');
 if(!uid)throw invalid();
 const user=await auth.getUser(uid);
 const authBase=process.env.FIREBASE_AUTH_EMULATOR_HOST?'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com':'https://identitytoolkit.googleapis.com';
 const response=await fetch(authBase+'/v1/accounts:signInWithPassword?key='+WEB_API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password,returnSecureToken:true}),signal:AbortSignal.timeout(10000)});
 const result=await response.json();
 if(!response.ok||result.localId!==uid)throw invalid();
 const profile=(await db.ref('access/profiles/'+uid).get()).val();
 if(!profile||profile.status!=='active'||user.disabled)throw new HttpsError('permission-denied','사용 중지 또는 탈퇴 처리된 계정입니다.');
 return {token:await auth.createCustomToken(uid)};
});
exports.registerAccount=callable(async request=>{
 await rateLimit(request,'signup',5);
 const data=request.data||{},id=domain.username(data.username);
 if(typeof data.password!=='string'||data.password.length<8||data.password.length>128)throw new HttpsError('invalid-argument','비밀번호는 8~128자로 입력해 주세요.');
 const uid='u_'+randomBytes(16).toString('hex'),ctx=context();
 // Validate the requested club and reserve the ID atomically before creating Auth.
 await transaction(a=>domain.register(a,uid,{...data,username:id},ctx));
 try{
  await auth.createUser({uid,email:id+'@users.badminton.invalid',password:data.password});
 }catch(error){
  await transaction(a=>{a=domain.init(a);delete a.profiles[uid];if(a.usernames[id]===uid)delete a.usernames[id];for(const cid of Object.keys(a.members)){delete a.members[cid][uid];if(a.clubs[cid]&&a.clubs[cid].ownerUid===uid){delete a.codes[a.clubs[cid].code];delete a.clubs[cid];delete a.members[cid];}}return a;});
  throw error;
 }
 return {token:await auth.createCustomToken(uid)};
});
exports.manageClub=callable(async request=>{
 const uid=await requireUser(request),data=request.data||{};
 await rateLimit(request,'manage',120);
 const ctx=context();
 await transaction(a=>domain.mutate(a,uid,data.action,data,ctx));
 if(data.action==='account'&&data.status!=='active')await auth.revokeRefreshTokens(data.uid);
 return {ok:true};
});
exports.changePassword=callable(async request=>{
 const uid=await requireUser(request),p=(await db.ref('access/profiles/'+uid).get()).val();
 if(!p||p.status!=='active')throw new HttpsError('permission-denied','사용할 수 없는 계정입니다.');
 if(Date.now()/1000-request.auth.token.auth_time>300)throw new HttpsError('unauthenticated','비밀번호를 바꾸려면 다시 로그인해 주세요.');
 const password=request.data.password;
 if(typeof password!=='string'||password.length<8||password.length>128)throw new HttpsError('invalid-argument','비밀번호는 8~128자로 입력해 주세요.');
 await auth.updateUser(uid,{password});await auth.revokeRefreshTokens(uid);return {ok:true};
});
// Remove IP-rate-limit buckets after expiry; no raw IP or password is stored.
const {onSchedule}=require('firebase-functions/v2/scheduler');
exports.pruneRateLimits=onSchedule({schedule:'every 24 hours',region:'asia-northeast3'},async()=>{
 const expired=await db.ref('rateLimits').orderByChild('expiresAt').endAt(Date.now()).limitToFirst(10000).get();
 const updates={};expired.forEach(child=>{updates[child.key]=null;});if(Object.keys(updates).length)await db.ref('rateLimits').update(updates);
});

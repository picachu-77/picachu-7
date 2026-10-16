'use strict';
// All changes to access metadata happen in one server-side transaction.
class DomainError extends Error { constructor(code, message) { super(message); this.code=code; } }
const fail=(code,message)=>{throw new DomainError(code,message);};
function text(value, max=60) { if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('invalid-argument','입력 내용을 확인해 주세요.');return value.trim(); }
function username(value){const v=text(value,24).toLowerCase();if(!/^[a-z0-9][a-z0-9_]{3,23}$/.test(v))fail('invalid-argument','아이디는 영문 소문자·숫자·밑줄 4~24자로 입력해 주세요.');return v;}
function key(value){const v=text(value,128);if(/[.#$\[\]/]/.test(v)||['__proto__','constructor','prototype'].includes(v))fail('invalid-argument','잘못된 식별자입니다.');return v;}
function init(a){a=a||{};for(const k of ['profiles','usernames','superadmins','clubs','codes','members','audit'])a[k]=a[k]||{};return a;}
function active(a,uid){return !!(a.profiles[uid]&&a.profiles[uid].status==='active');}
function isSuper(a,uid){return active(a,uid)&&a.superadmins[uid]===true;}
function clubAdmin(a,uid,cid){const m=a.members[cid]&&a.members[cid][uid];return isSuper(a,uid)||(active(a,uid)&&a.clubs[cid]&&a.clubs[cid].status==='approved'&&m&&m.status==='approved'&&m.role==='admin');}
function requireSuper(a,uid){if(!isSuper(a,uid))fail('permission-denied','총관리자 권한이 필요합니다.');}
function requireAdmin(a,uid,cid){if(!clubAdmin(a,uid,cid))fail('permission-denied','이 동호회의 관리자 권한이 필요합니다.');}
function admins(a,cid){return Object.keys(a.members[cid]||{}).filter(uid=>{const m=a.members[cid][uid];return active(a,uid)&&m.status==='approved'&&m.role==='admin';});}
function addClub(a,uid,data,ctx){
 const name=text(data.name,60),id=key(ctx.clubId),code=key(ctx.code);
 const own=Object.values(a.clubs).filter(c=>c.ownerUid===uid&&c.status==='pending');
 if(own.length>=3)fail('resource-exhausted','동호회 승인 대기는 최대 3개까지 가능합니다.');
 if(a.clubs[id]||a.codes[code])fail('already-exists','동호회 코드가 중복되었습니다. 다시 신청해 주세요.');
 a.clubs[id]={name,code,ownerUid:uid,status:'pending',createdAt:ctx.now};a.codes[code]=id;
 a.members[id]={[uid]:{username:a.profiles[uid].username,displayName:a.profiles[uid].displayName,role:'admin',status:'pending',createdAt:ctx.now}};
 a.profiles[uid].clubs=a.profiles[uid].clubs||{};a.profiles[uid].clubs[id]=true;
}
function joinClub(a,uid,data,ctx){
 const code=text(data.code,12).toUpperCase(),cid=a.codes[code],club=cid&&a.clubs[cid];
 if(!club||club.status!=='approved')fail('not-found','가입 가능한 동호회 코드를 확인해 주세요.');
 const old=a.members[cid]&&a.members[cid][uid];
 if(old)fail('already-exists','이미 신청했거나 탈퇴 처리된 동호회입니다. 관리자에게 문의해 주세요.');
 if(Object.keys(a.profiles[uid].clubs||{}).length>=20)fail('resource-exhausted','동호회 신청 한도를 초과했습니다.');
 a.members[cid]=a.members[cid]||{};
 a.members[cid][uid]={username:a.profiles[uid].username,displayName:a.profiles[uid].displayName,role:'member',status:'pending',createdAt:ctx.now};
 a.profiles[uid].clubs=a.profiles[uid].clubs||{};a.profiles[uid].clubs[cid]=true;
}
function register(a,uid,data,ctx){
 a=init(a);key(uid);const id=username(data.username);
 if(a.profiles[uid]||a.usernames[id])fail('already-exists','이미 사용 중인 아이디입니다.');
 a.profiles[uid]={username:id,displayName:text(data.displayName,40),status:'active',createdAt:ctx.now};a.usernames[id]=uid;
 if(data.newClubName)addClub(a,uid,{name:data.newClubName},ctx);else joinClub(a,uid,{code:data.code},ctx);
 return a;
}
function mutate(a,uid,action,data,ctx){
 a=init(a);key(uid);if(!active(a,uid))fail('permission-denied','사용할 수 없는 계정입니다.');
 if(action==='createClub')addClub(a,uid,data,ctx);
 else if(action==='joinClub')joinClub(a,uid,data,ctx);
 else if(action==='reviewClub'){
  requireSuper(a,uid);const cid=key(data.clubId),c=a.clubs[cid];
  if(!c||c.status!=='pending')fail('failed-precondition','승인 대기 중인 동호회가 아닙니다.');
  if(!['approved','rejected'].includes(data.status))fail('invalid-argument','승인 결과를 확인해 주세요.');
  if(!active(a,c.ownerUid))fail('failed-precondition','신청자 계정을 먼저 복구해 주세요.');
  c.status=data.status;c.reviewedAt=ctx.now;
  a.members[cid][c.ownerUid].status=data.status;if(data.status==='approved')a.members[cid][c.ownerUid].role='admin';
 }else if(action==='clubStatus'){
  requireSuper(a,uid);const c=a.clubs[key(data.clubId)];
  if(!c||!['approved','suspended'].includes(c.status)||!['approved','suspended'].includes(data.status))fail('invalid-argument','동호회 상태를 확인해 주세요.');
  c.status=data.status;
 }else if(action==='member'){
  const cid=key(data.clubId),target=key(data.uid);requireAdmin(a,uid,cid);
  if(!a.clubs[cid]||a.clubs[cid].status!=='approved')fail('failed-precondition','동호회 승인 또는 운영 재개 후 회원을 관리해 주세요.');
  const m=a.members[cid]&&a.members[cid][target];if(!m)fail('not-found','회원을 찾을 수 없습니다.');
  const operations={approve:['approved','member'],reject:['rejected','member'],remove:['removed','member'],promote:['approved','admin'],demote:['approved','member']};
  const change=Object.hasOwn(operations,data.operation)?operations[data.operation]:null;if(!change)fail('invalid-argument','처리 종류를 확인해 주세요.');
  if(data.operation==='approve'&&!['pending','rejected','removed'].includes(m.status))fail('failed-precondition','승인할 수 있는 상태가 아닙니다.');
  if(data.operation==='reject'&&m.status!=='pending')fail('failed-precondition','가입 승인 대기 회원이 아닙니다.');
  if(['promote','demote'].includes(data.operation)&&m.status!=='approved')fail('failed-precondition','승인된 회원만 권한을 변경할 수 있습니다.');
  if(['approve','promote'].includes(data.operation)&&!active(a,target))fail('failed-precondition','사용 중지된 계정입니다.');
  // Club admins cannot remove/demote other admins; global admin can, but not the last admin.
  if(!isSuper(a,uid)&&m.role==='admin'&&target!==uid)fail('permission-denied','다른 관리자 권한은 총관리자가 변경할 수 있습니다.');
  if(m.role==='admin'&&m.status==='approved'&&(change[0]!=='approved'||change[1]!=='admin')&&admins(a,cid).filter(id=>id!==target).length===0)fail('failed-precondition','다른 관리자를 지정한 후 변경해 주세요.');
  m.status=change[0];m.role=change[1];m.updatedAt=ctx.now;
 }else if(action==='account'){
  requireSuper(a,uid);const target=key(data.uid),p=a.profiles[target];
  if(!p||!['active','suspended','removed'].includes(data.status))fail('invalid-argument','계정 상태를 확인해 주세요.');
  if(target===uid)fail('failed-precondition','자신의 계정은 중지하거나 변경할 수 없습니다.');
  if(a.superadmins[target])fail('failed-precondition','총관리자 권한을 먼저 회수해 주세요.');
  p.status=data.status;if(data.status!=='active')p.validAfter=Math.floor(ctx.now/1000)+1;
 }else if(action==='superRole'){
  requireSuper(a,uid);const target=key(data.uid);
  if(typeof data.enabled!=='boolean'||!active(a,target))fail('invalid-argument','사용 중인 계정을 선택해 주세요.');
  if(!data.enabled&&a.superadmins[target]&&Object.keys(a.superadmins).filter(x=>a.superadmins[x]&&active(a,x)).length<=1)fail('failed-precondition','마지막 총관리자는 해제할 수 없습니다.');
  if(data.enabled)a.superadmins[target]=true;else delete a.superadmins[target];
 }else fail('invalid-argument','지원하지 않는 요청입니다.');
 a.audit[ctx.auditId]={actor:uid,action,at:ctx.now,clubId:data.clubId||null,target:data.uid||null,operation:data.operation||data.status||null};
 return a;
}
module.exports={DomainError,username,key,init,active,isSuper,clubAdmin,register,mutate};

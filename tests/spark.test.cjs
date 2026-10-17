const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function app(){
 const data={},writes=[];let currentUser={uid:'root',email:'rnftm312@gmail.com'};
 const read=p=>p.split('/').filter(Boolean).reduce((v,k)=>v&&v[k],data)??null;
 function write(p,v){let a=p.split('/').filter(Boolean),o=data;for(const k of a.slice(0,-1))o=o[k]??={};o[a.at(-1)]=v;}
 const database=()=>({ref:(p='')=>({once:async()=>({val:()=>read(p)}),set:async v=>write(p,v),update:async updates=>{writes.push(updates);for(const [k,v]of Object.entries(updates))write(k,v);},transaction:async fn=>{const v=fn(read(p));if(v!==undefined)write(p,v);return {committed:v!==undefined};}})});
 database.ServerValue={TIMESTAMP:1};const auth={setPersistence:async value=>{auth.persistence=value;},get currentUser(){return currentUser;},signInWithEmailAndPassword:async(email,password)=>{auth.last={email,password};},createUserWithEmailAndPassword:async(email)=>{currentUser={uid:'new',email,updateProfile:async()=>{}};return {user:currentUser};}};
 const c={AUTH:{},firebase:{auth:()=>auth,database},crypto:require('node:crypto').webcrypto,Uint8Array};vm.createContext(c);vm.runInContext(fs.readFileSync('spark-access.js','utf8'),c);return {c,data,writes,read,write,auth};
}
test('trusted setup preserves UID and copies legacy only to an empty club',async()=>{
 const a=app();a.write('roster',[{name:'기존 회원'}]);await a.c.setupKkulbae();
 assert.equal(a.read('access/system/ownerUid'),'root');assert.equal(a.read('access/profiles/root/username'),'chease312');assert.equal(a.read('access/clubs/KKULBAE001/status'),'approved');assert.equal(a.read('clubData/KKULBAE001/roster/0/name'),'기존 회원');
 a.write('roster',[{name:'원본 변경'}]);await a.c.setupKkulbae();assert.equal(a.read('clubData/KKULBAE001/roster/0/name'),'기존 회원');assert.equal(a.read('roster/0/name'),'원본 변경');
});
test('signup creates a pending membership and never sends a callable function',async()=>{
 const a=app();a.write('access/clubs/ABCDEF1234',{status:'approved'});
 await a.c.callServer('registerAccount',{username:'NewPlayer',password:'password123',displayName:'새 회원',code:'abcdef1234'});
 assert.equal(a.auth.currentUser.email,'newplayer@users.badminton.invalid');assert.equal(a.read('access/members/ABCDEF1234/new/status'),'pending');assert.equal(a.read('access/members/ABCDEF1234/new/role'),'member');assert.equal(a.read('access/profiles/new/clubs/ABCDEF1234'),true);assert.equal(a.c.AUTH.registering,false);
});
test('new club gets random code and pending owner; review updates both states atomically',async()=>{
 const a=app();await a.c.completeProfile();await a.c.sparkManage({action:'createClub',name:'새 동호회'});const clubs=a.read('access/clubs'),id=Object.keys(clubs)[0];assert.match(id,/^[A-F0-9]{10}$/);assert.equal(clubs[id].status,'pending');assert.equal(a.read('access/members/'+id+'/root/status'),'pending');
 await a.c.sparkManage({action:'reviewClub',clubId:id,status:'approved'});const update=a.writes.at(-1);assert.equal(update['access/clubs/'+id+'/status'],'approved');assert.equal(update['access/members/'+id+'/root/status'],'approved');
});

test('login persistence follows explicit choice and storage failures do not block login',async()=>{
 const a=app();await a.c.callServer('loginById',{username:'tester',password:'password123',autoLogin:true});assert.equal(a.auth.persistence,'local');assert.equal(a.auth.last.email,'tester@users.badminton.invalid');
 await a.c.callServer('loginById',{username:'tester',password:'password123',autoLogin:false});assert.equal(a.auth.persistence,'session');
});
test('failed persistence setup does not proceed with a different login mode',async()=>{
 const a=app();a.auth.setPersistence=async()=>{throw Error('unavailable');};await assert.rejects(a.c.callServer('loginById',{username:'tester',password:'password123',autoLogin:true}));assert.equal(a.auth.last,undefined);
});

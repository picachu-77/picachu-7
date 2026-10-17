const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');const fs=require('fs');const {createMockUserToken}=require('@firebase/util');
const projectId='demo-badminton-clubs',base='http://127.0.0.1:9000';
async function request(path,method='GET',value,token){
 const url=base+'/'+path+'.json?ns='+projectId+(token&&token!=='owner'?'&auth='+encodeURIComponent(token):'');
 const response=await fetch(url,{method,headers:token==='owner'?{Authorization:'Bearer owner'}:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(10000)});
 return {status:response.status,body:await response.text()};
}
const ref=(database,path='')=>({database,path});
const get=r=>request(r.path,'GET',undefined,r.database);
const set=(r,v)=>request(r.path,'PUT',v,r.database);
const assertSucceeds=async promise=>{const r=await promise;assert.equal(r.status,200,r.body);};
const assertFails=async promise=>{const r=await promise;assert.ok(r.status===401||r.status===403,r.body);};
const env={withSecurityRulesDisabled:fn=>fn({database:()=> 'owner'})};
const C='AAA0000001',B='BBB0000002',N='NEW0000003';
function person(uid,status='active'){return {username:uid==='root'?'chease312':'user_'+uid,displayName:uid,status,createdAt:1};}
function member(uid,role='member',status='approved'){return {username:person(uid).username,displayName:uid,role,status,createdAt:1};}
const seed={access:{system:{ownerUid:'root'},profiles:{root:person('root'),a:person('a'),b:person('b'),admin:person('admin'),other:person('other'),pending:person('pending'),removed:person('removed'),suspended:person('suspended','suspended')},superadmins:{root:true},clubs:{[C]:{name:'동호회 A',code:C,ownerUid:'admin',status:'approved',createdAt:1},[B]:{name:'동호회 B',code:B,ownerUid:'b',status:'approved',createdAt:1}},members:{[C]:{admin:member('admin','admin'),a:member('a'),pending:member('pending','member','pending'),removed:member('removed','member','removed'),suspended:member('suspended')},[B]:{b:member('b','admin')}}},clubData:{[C]:{roster:[{name:'홍길동'}]},[B]:{roster:[{name:'김철수'}]}}};
before(async()=>{const r=await request('.settings/rules','PUT',JSON.parse(fs.readFileSync(require('path').join(__dirname,'../database.rules.json'),'utf8')),'owner');assert.equal(r.status,200,r.body);});
beforeEach(async()=>{const r=await set(ref('owner'),seed);assert.equal(r.status,200,r.body);});
const db=(uid,claims={})=>uid?createMockUserToken({sub:uid,user_id:uid,email:uid==='root'?'rnftm312@gmail.com':person(uid).username+'@users.badminton.invalid',...claims},projectId):undefined;
const patch=(uid,values)=>request('','PATCH',values,db(uid));
test('approved members read/write only their own club',async()=>{await assertSucceeds(get(ref(db('a'),'clubData/'+C)));await assertSucceeds(set(ref(db('a'),'clubData/'+C+'/roster'),[{name:'박철수'}]));await assertFails(get(ref(db('a'),'clubData/'+B)));await assertFails(set(ref(db('a'),'clubData/'+B+'/roster'),[]));});
test('anonymous, pending, removed and suspended cannot read club data',async()=>{for(const uid of [null,'pending','removed','suspended'])await assertFails(get(ref(db(uid),'clubData/'+C)));});
test('self profile creation requires matching Firebase Auth email',async()=>{await assertSucceeds(set(ref(db('new'),'access/profiles/new'),person('new')));await assertFails(set(ref(db('fake'),'access/profiles/fake'),{...person('fake'),username:'chease312'}));await assertFails(set(ref(db('intruder'),'access/profiles/other'),person('intruder')));});
test('new profiles cannot grant roles or start suspended',async()=>{await assertFails(set(ref(db('new'),'access/profiles/new'),{...person('new'),superadmin:true}));await assertFails(set(ref(db('new'),'access/profiles/new'),person('new','suspended')));});
test('profile identity and global status cannot be forged by member',async()=>{await assertFails(set(ref(db('a'),'access/profiles/a/username'),'user_root'));await assertFails(set(ref(db('a'),'access/profiles/a/status'),'removed'));await assertFails(set(ref(db('a'),'access/profiles/a'),null));await assertFails(set(ref(db('suspended'),'access/profiles/suspended/status'),'active'));});
test('code join atomically records own pending membership and profile link',async()=>{await assertSucceeds(patch('other',{['access/members/'+C+'/other']:member('other','member','pending'),['access/profiles/other/clubs/'+C]:true}));await assertFails(get(ref(db('other'),'clubData/'+C)));});
test('code alone cannot grant approved membership/admin; cannot apply for someone else',async()=>{await assertFails(set(ref(db('other'),'access/members/'+C+'/other'),member('other')));await assertFails(set(ref(db('other'),'access/members/'+C+'/other'),member('other','admin','pending')));await assertFails(set(ref(db('a'),'access/members/'+C+'/other'),member('other','member','pending')));});
test('removed user cannot recreate or reapprove membership',async()=>{await assertFails(set(ref(db('removed'),'access/members/'+C+'/removed'),null));await assertFails(set(ref(db('removed'),'access/members/'+C+'/removed/status'),'pending'));await assertFails(set(ref(db('removed'),'access/members/'+C+'/removed/status'),'approved'));});
test('club admin approves/removes members but cannot manage a different club',async()=>{await assertSucceeds(patch('admin',{['access/members/'+C+'/pending/status']:'approved'}));await assertSucceeds(patch('admin',{['access/members/'+C+'/pending/status']:'removed'}));await assertFails(patch('admin',{['access/members/'+B+'/b/status']:'removed'}));});
test('ordinary and pending users cannot approve or grant themselves roles',async()=>{for(const uid of ['a','pending']){await assertFails(patch(uid,{['access/members/'+C+'/'+uid+'/role']:'admin'}));await assertFails(patch(uid,{['access/members/'+C+'/pending/status']:'approved'}));}});
test('club creation always pending and owner membership is atomic',async()=>{await assertSucceeds(patch('other',{['access/clubs/'+N]:{name:'새 동호회',code:N,ownerUid:'other',status:'pending',createdAt:2},['access/members/'+N+'/other']:member('other','admin','pending'),['access/profiles/other/clubs/'+N]:true}));await assertFails(get(ref(db('other'),'clubData/'+N)));await assertFails(patch('other',{['access/clubs/'+N+'/status']:'approved',['access/members/'+N+'/other/status']:'approved'}));});
test('superadmin approval must approve the owner in same update',async()=>{await assertSucceeds(patch('other',{['access/clubs/'+N]:{name:'새 동호회',code:N,ownerUid:'other',status:'pending',createdAt:2},['access/members/'+N+'/other']:member('other','admin','pending')}));await assertFails(patch('root',{['access/clubs/'+N+'/status']:'approved'}));await assertSucceeds(patch('root',{['access/clubs/'+N+'/status']:'approved',['access/members/'+N+'/other/status']:'approved'}));await assertSucceeds(get(ref(db('other'),'clubData/'+N)));});
test('unapproved clubs cannot be self-created as approved',async()=>{await assertFails(patch('other',{['access/clubs/'+N]:{name:'탈취',code:N,ownerUid:'other',status:'approved',createdAt:2},['access/members/'+N+'/other']:member('other','admin')}));});
test('club ownership/approval cannot be forged or overwritten',async()=>{await assertFails(patch('a',{['access/clubs/'+C+'/ownerUid']:'a'}));await assertFails(set(ref(db('a'),'access/clubs/'+C),{name:'탈취',code:C,ownerUid:'a',status:'pending',createdAt:2}));});
test('responsible admin cannot be removed until ownership transferred',async()=>{for(const actor of ['admin','root'])await assertFails(patch(actor,{['access/members/'+C+'/admin/status']:'removed'}));await assertSucceeds(patch('root',{['access/members/'+C+'/a/role']:'admin'}));await assertSucceeds(patch('root',{['access/clubs/'+C+'/ownerUid']:'a'}));await assertSucceeds(patch('root',{['access/members/'+C+'/admin/status']:'removed',['access/members/'+C+'/admin/role']:'member'}));});
test('cannot transfer ownership to nonadmin or pending user',async()=>{for(const uid of ['a','pending'])await assertFails(patch('root',{['access/clubs/'+C+'/ownerUid']:uid}));});
test('only superadmin grants global roles; initial superadmin is protected',async()=>{await assertFails(set(ref(db('admin'),'access/superadmins/admin'),true));await assertSucceeds(set(ref(db('root'),'access/superadmins/other'),true));await assertFails(set(ref(db('other'),'access/superadmins/root'),null));await assertFails(set(ref(db('other'),'access/profiles/root/status'),'suspended'));await assertFails(set(ref(db('other'),'access/system/ownerUid'),'other'));});
test('global account suspension blocks all clubs and user cannot restore',async()=>{await assertSucceeds(set(ref(db('root'),'access/profiles/a/status'),'suspended'));await assertFails(get(ref(db('a'),'clubData/'+C)));await assertFails(set(ref(db('a'),'access/profiles/a/status'),'active'));await assertSucceeds(set(ref(db('root'),'access/profiles/a/status'),'active'));});
test('suspended club denies even approved members; only global admin resumes it',async()=>{await assertSucceeds(set(ref(db('root'),'access/clubs/'+C+'/status'),'suspended'));await assertFails(get(ref(db('admin'),'clubData/'+C)));await assertFails(set(ref(db('admin'),'access/clubs/'+C+'/status'),'approved'));await assertSucceeds(set(ref(db('root'),'access/clubs/'+C+'/status'),'approved'));});
test('members cannot list other clubs, private profiles or member lists',async()=>{for(const p of ['access/clubs','access/profiles','access/members/'+B,'access/members/'+C])await assertFails(get(ref(db('a'),p)));await assertSucceeds(get(ref(db('other'),'access/clubs/'+C)));await assertSucceeds(get(ref(db('admin'),'access/members/'+C)));});
test('fake club links do not grant permission and require own membership',async()=>{await assertFails(set(ref(db('other'),'access/profiles/other/clubs/'+C),true));await assertFails(get(ref(db('other'),'clubData/'+C)));});
test('cannot bypass validations by deleting parent collections',async()=>{for(const p of ['access','access/profiles','access/members/'+C,'access/clubs/'+C])await assertFails(set(ref(db('root'),p),null));});
test('legacy shared paths are locked; nested HTML injection is rejected',async()=>{await assertFails(get(ref(db('a'),'roster')));await assertFails(set(ref(db('a'),'clubData/'+C+'/session'),{teams:[{p1:{name:'<img src=x>'}}]}));});
test('only designated existing account can bootstrap the first global owner',async()=>{
 await assertSucceeds(set(ref('owner','access/system'),null));await assertSucceeds(set(ref('owner','access/superadmins'),null));
 await assertFails(patch('other',{'access/system/ownerUid':'other','access/superadmins/other':true}));
 await assertFails(patch('root',{'access/system/ownerUid':'other','access/superadmins/root':true}));
 await assertSucceeds(patch('root',{'access/system/ownerUid':'root','access/superadmins/root':true}));
 await assertFails(patch('root',{'access/system/ownerUid':'other'}));
 await assertSucceeds(get(ref(db('root'),'roster')));
 await assertFails(set(ref(db('root'),'roster'),[{name:'overwrite'}]));
});
test('synthetic reserved username cannot impersonate original owner',async()=>{
 await assertFails(set(ref(db('attacker',{email:'chease312@users.badminton.invalid'}),'access/profiles/attacker'),{username:'chease312',displayName:'fake',status:'active',createdAt:1}));
});
test('scheduled meetings support independent deep match data and isolated cleanup',async()=>{
 const base='clubData/'+C+'/session/events/';
 const meeting={title:'토요 대진',place:'시민체육관',ownerUid:'a',startAt:1,endAt:2,createdAt:1,state:{teams:[{id:1,p1:{name:'홍길동'},p2:{name:'김철수'}}],tBracket:[[{t1:{p1:{name:'홍길동'}}}]]}};
 await assertSucceeds(set(ref(db('a'),base+'one'),meeting));await assertSucceeds(set(ref(db('a'),base+'two'),{...meeting,place:'다른 체육관'}));
 await assertFails(get(ref(db('b'),base+'one')));await assertFails(set(ref(db('pending'),base+'one'),null));
 await assertSucceeds(set(ref(db('a'),base+'one'),null));const other=await get(ref(db('a'),base+'two'));assert.equal(JSON.parse(other.body).place,'다른 체육관');
});

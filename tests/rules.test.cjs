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
const seed={access:{profiles:{root:{status:'active'},a:{status:'active',clubs:{A:true}},b:{status:'active',clubs:{B:true}},pending:{status:'active',clubs:{A:true}},removed:{status:'active',clubs:{A:true}},suspended:{status:'suspended',clubs:{A:true}},admin:{status:'active',clubs:{A:true}},revoked:{status:'active',validAfter:1000,clubs:{A:true}}},superadmins:{root:true},clubs:{A:{name:'A',status:'approved'},B:{name:'B',status:'approved'},C:{status:'pending'}},members:{A:{a:{status:'approved',role:'member'},admin:{status:'approved',role:'admin'},pending:{status:'pending',role:'member'},removed:{status:'removed',role:'member'},suspended:{status:'approved',role:'member'},revoked:{status:'approved',role:'member'}},B:{b:{status:'approved',role:'member'}}}},clubData:{A:{roster:[{name:'Alice'}]},B:{roster:[{name:'Bob'}]}}};
before(async()=>{const r=await request('.settings/rules','PUT',JSON.parse(fs.readFileSync(require('path').join(__dirname,'../database.rules.json'),'utf8')),'owner');assert.equal(r.status,200,r.body);});
beforeEach(async()=>{const r=await set(ref('owner'),seed);assert.equal(r.status,200,r.body);});
const db=(uid,claims={})=>uid?createMockUserToken({sub:uid,user_id:uid,auth_time:2000,...claims},projectId):undefined;
test('approved members read/write only their club',async()=>{await assertSucceeds(get(ref(db('a'),'clubData/A')));await assertSucceeds(set(ref(db('a'),'clubData/A/roster'),[{name:'홍길동'}]));await assertFails(get(ref(db('a'),'clubData/B')));await assertFails(set(ref(db('a'),'clubData/B/roster'),[]));});
test('anonymous, pending, removed and suspended users denied',async()=>{for(const uid of [null,'pending','removed','suspended']){await assertFails(get(ref(db(uid),'clubData/A')));await assertFails(set(ref(db(uid),'clubData/A/roster'),[]));}});
test('old token remains blocked after account restored',async()=>{await assertFails(get(ref(db('revoked',{auth_time:500}),'clubData/A')));await assertSucceeds(get(ref(db('revoked'),'clubData/A')));});
test('members cannot forge profiles, approval or admin status',async()=>{for(const p of ['access/members/A/a/role','access/profiles/a/status','access/superadmins/a','access/clubs/A/status'])await assertFails(set(ref(db('a'),p),'admin'));await assertFails(set(ref(db('root'),'access/superadmins/new'),true));});
test('club admins only read their member list; ordinary members see only themselves',async()=>{await assertSucceeds(get(ref(db('admin'),'access/members/A')));await assertFails(get(ref(db('admin'),'access/members/B')));await assertFails(get(ref(db('a'),'access/members/A')));await assertSucceeds(get(ref(db('pending'),'access/members/A/pending')));});
test('global admin can read metadata and approved clubs, but not pending club data',async()=>{await assertSucceeds(get(ref(db('root'),'access')));await assertSucceeds(get(ref(db('root'),'clubData/B')));await assertFails(get(ref(db('root'),'clubData/C')));});
test('private username index and legacy root data are inaccessible',async()=>{for(const path of ['access/usernames','access/codes','roster','stats','session'])await assertFails(get(ref(db('a'),path)));});
test('suspended club immediately denies an existing member',async()=>{await env.withSecurityRulesDisabled(c=>set(ref(c.database(),'access/clubs/A/status'),'suspended'));await assertFails(get(ref(db('a'),'clubData/A')));});
test('cannot write metadata through clubData or inject HTML into legacy renderer',async()=>{await assertFails(set(ref(db('a'),'clubData/A/permissions'),{admin:true}));await assertFails(set(ref(db('a'),'clubData/A/roster'),[{name:'<img src=x onerror=alert(1)>'}]));await assertFails(set(ref(db('a'),'clubData/A/session'),{teams:[{p1:{name:'bad" onclick="alert(1)'}}]}));});

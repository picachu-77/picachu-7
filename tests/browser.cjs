const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:r.request().url().endsWith('.css')?'text/css':'application/javascript'}));
 let html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 html=html.replace('<script src="club-auth.js"></script>','<script>'+fs.readFileSync(path.join(__dirname,'../club-auth.js'),'utf8')+'</script>');
 html=html.replace('<link rel="stylesheet" href="club-auth.css">','<style>'+fs.readFileSync(path.join(__dirname,'../club-auth.css'),'utf8')+'</style>');
 const mock=`
 window.mock={reads:[],subscriptions:{},callbacks:[],uid:'member',data:{'access/profiles/member':{username:'tester',displayName:'테스터',status:'active',clubs:{A:true,B:true}},'access/superadmins/member':false,'access/clubs/A':{name:'동호회 A',status:'approved',code:'AAAAAAAAAA'},'access/clubs/B':{name:'동호회 B',status:'approved',code:'BBBBBBBBBB'},'access/members/A/member':{status:'pending',role:'member'},'access/members/B/member':{status:'approved',role:'admin'},'clubData/A/roster':[{name:'가나다',gender:'남',level:'C'}],'clubData/B/roster':[{name:'라마바',gender:'여',level:'C'}]}};
 mock.snap=function(p){return {val:()=>mock.data[p]||null}};
 mock.emit=function(p,v){mock.data[p]=v;(mock.subscriptions[p]||[]).slice().forEach(cb=>cb(mock.snap(p)))};
 var authCallback;
 var auth={onAuthStateChanged:function(cb){authCallback=cb;cb(null)},signInWithCustomToken:function(){return Promise.resolve().then(()=>authCallback({uid:mock.uid}))},signOut:function(){authCallback(null);return Promise.resolve()}};
 var database={ref:function(p){return {on:function(event,cb){mock.reads.push(p);mock.subscriptions[p]=mock.subscriptions[p]||[];mock.subscriptions[p].push(cb);mock.callbacks.push({p,cb});cb(mock.snap(p));},off:function(event,cb){mock.subscriptions[p]=cb?(mock.subscriptions[p]||[]).filter(x=>x!==cb):[];},once:function(){mock.reads.push(p);return Promise.resolve(mock.snap(p))},set:function(v){mock.emit(p,v);return Promise.resolve()},remove:function(){mock.emit(p,null);return Promise.resolve()}}}};
 window.firebase={apps:[],initializeApp:function(){this.apps.push({})},auth:()=>auth,database:()=>database,app:()=>({functions:()=>({httpsCallable:name=>data=>Promise.resolve({data:{token:'test-token'}})})})};
 `;
 html=html.replace('<script src="club-auth.js"></script>','');
 html=html.replace('<body>','<body><script>'+mock+'</script>');
 await page.setContent(html);await page.waitForFunction(()=>AUTH.ready);
 assert.equal(await page.locator('input[type=email]').count(),0);
 await page.locator('#username').fill('tester');await page.locator('#password').fill('password123');await page.locator('#portal-login button[type=submit]').click();
 await page.getByRole('heading',{name:'내 동호회'}).waitFor();
 assert.equal(await page.evaluate(()=>mock.reads.some(p=>p.startsWith('clubData/'))),false);
 assert.equal(await page.locator('[data-portal=open][data-club=A]').count(),0);
 await page.evaluate(()=>mock.emit('access/members/A/member',{status:'approved',role:'member'}));
 await page.locator('[data-portal=open][data-club=A]').click();
 assert.equal(await page.evaluate(()=>S.roster[0].name),'가나다');
 await page.locator('[data-portal=clubs]').click();await page.locator('[data-portal=open][data-club=B]').click();
 assert.equal(await page.evaluate(()=>S.roster[0].name),'라마바');
 await page.evaluate(()=>mock.callbacks.find(x=>x.p==='clubData/A/roster').cb({val:()=>[{name:'stale'}]}));
 assert.equal(await page.evaluate(()=>S.roster[0].name),'라마바');
 await page.evaluate(()=>mock.emit('access/members/B/member',{status:'removed',role:'member'}));
 await page.getByRole('heading',{name:'내 동호회'}).waitFor();assert.equal(await page.evaluate(()=>S.roster.length),0);
 await page.evaluate(()=>mock.emit('access/members/A/member',{status:'approved',role:'admin'}));
 await page.locator('[data-portal=club-admin][data-club=A]').click();await page.getByRole('heading',{name:'동호회 A 회원 관리'}).waitFor();
 await page.evaluate(()=>mock.emit('access/members/A/member',{status:'approved',role:'member'}));
 await page.getByRole('heading',{name:'내 동호회'}).waitFor();
 await page.evaluate(()=>mock.emit('access/clubs/A',{name:'<img src=x onerror="window.injected=true">',status:'approved',code:'AAAAAAAAAA'}));
 assert.equal(await page.evaluate(()=>!!window.injected),false);assert.equal(await page.locator('img').count(),0);
 await page.evaluate(()=>mock.emit('access/profiles/member',{username:'tester',displayName:'테스터',status:'suspended',clubs:{A:true,B:true}}));
 await page.getByRole('heading',{name:'사용 중지'}).waitFor();assert.equal(await page.evaluate(()=>db),null);
 await page.locator('[data-portal=logout]').click();await page.locator('#portal-login').waitFor();assert.deepEqual(errors,[]);
 console.log('PASS: ID login, pending gate, club isolation, stale callbacks, removal, admin demotion, XSS escaping, account suspension, logout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

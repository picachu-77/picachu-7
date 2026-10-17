const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/picachu-7/test.html'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ko"><body><script src="pwa.js"></script><script>document.body.insertAdjacentHTML("beforeend",installControl())</script></body></html>');return;}
  const name=pathname.replace(/^\/picachu-7\//,''),file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.webmanifest')?'application/manifest+json':name.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>console.error('page error:',error.message));
  await page.goto(origin+'/picachu-7/test.html');
  const scope=await page.evaluate(async()=>{const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Service worker registration timed out')),15000))]);return registration.scope;});assert.equal(scope,origin+'/picachu-7/');
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  const manifest=await (await context.request.get(origin+'/picachu-7/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');
  for(const icon of manifest.icons){const response=await context.request.get(origin+'/picachu-7/'+icon.src);assert.equal(response.status(),200);const png=await response.body();assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),parseInt(icon.sizes));}
  await page.getByRole('button',{name:'휴대폰에 앱 설치'}).click();await page.getByRole('heading',{name:'홈 화면에 앱 설치'}).waitFor();await page.getByRole('button',{name:'확인',exact:true}).click();
  await page.evaluate(()=>{window.prompted=false;const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{window.prompted=true;};event.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(event);});
  await page.getByRole('button',{name:'휴대폰에 앱 설치'}).click();assert.equal(await page.evaluate(()=>window.prompted),true);
  assert.deepEqual(await page.evaluate(()=>caches.keys()),[]);
  await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'인터넷 연결을 확인해 주세요'}).waitFor();assert.equal(await page.locator('a').getAttribute('href'),'./');
  await context.setOffline(false);await page.goto(origin+'/picachu-7/test.html');await page.getByRole('button',{name:'휴대폰에 앱 설치'}).waitFor();
  const ios=await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'});const iosPage=await ios.newPage();await iosPage.goto(origin+'/picachu-7/test.html');await iosPage.getByRole('button',{name:'휴대폰에 앱 설치'}).click();assert.match(await iosPage.locator('dialog').innerText(),/Safari.*공유 → 홈 화면에 추가/);
  console.log('PASS: scoped worker, manifest and PNG icons, install prompt, iOS instructions, offline fallback, no cached user data');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

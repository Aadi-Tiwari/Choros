import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base=process.env.CHOROS_DASHBOARD || "http://127.0.0.1:4002";
const evidence=`runs/frontend-workspace-${Date.now()}`;
await mkdir(evidence,{recursive:true});
const snapshot=await fetch(base+'/api/state').then(r=>r.json());
assert.ok(snapshot.state?.runId,'Use a completed run for the workspace review');
const control=await fetch(`${base}/runs/${snapshot.state.runId}/live-control-result.json`).then(r=>r.json());
const people=await fetch(base+'/api/users').then(r=>r.json());
const browser=await chromium.launch();
async function openPage(options) {
  const page=await browser.newPage(options);
  page.setDefaultTimeout(10000);
  return page;
}
const results=[];
try {
  const page=await openPage({viewport:{width:1600,height:1100}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const requests=[];
  await page.route('**/api/**',async(route)=>{
    const request=route.request();
    if(request.method()!=='POST') return route.continue();
    requests.push(new URL(request.url()).pathname+new URL(request.url()).search);
    return route.fulfill({status:202,contentType:'application/json',body:'{"ok":true}'});
  });
  await page.goto(base);
  await page.waitForFunction(()=>document.getElementById('healthyControl').textContent.includes('identities verified'));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'workspace','Skip link moves focus past navigation');
  assert.match(await page.locator('#rushTitle').textContent(),new RegExp(`^${control.tickets.sold} sold`));
  await page.locator('#ledgerOriginal').click();
  assert.match(await page.locator('#rushTitle').textContent(),new RegExp(`^${snapshot.state.tickets.sold} sold`));
  assert.equal(await page.locator('.seatTile.conflict').count(),snapshot.state.tickets.duplicates.length);
  await page.screenshot({path:evidence+'/overview-original.png',fullPage:true});
  await page.locator('#ledgerFixed').click();
  assert.equal(await page.locator('.seatTile.conflict').count(),control.tickets.duplicates.length);
  await page.screenshot({path:evidence+'/overview-verified.png',fullPage:true});
  results.push('Original and verified ledgers use their recorded data');

  await page.getByRole('button',{name:'Live crowd',exact:true}).click();
  assert.equal(await page.locator('body').getAttribute('data-view'),'crowd');
  assert.equal(await page.locator('.user').count(),Object.keys(snapshot.state.users).length);
  const person=Object.values(snapshot.state.users)[0];
  await page.locator('#userSearch').fill(person.name);
  assert.ok(await page.locator('.user').count()>0);
  const matches=await page.locator('.uhead b').allTextContents();
  assert.ok(matches.every(name=>name.toLowerCase().includes(person.name.toLowerCase())));
  await page.locator('.user-profile summary').first().click();
  assert.ok(await page.locator('.user-profile[open]').count()>0);
  await page.waitForTimeout(1200);
  assert.ok(await page.locator('.user-profile[open]').count()>0,'Polling preserves an expanded personality');
  await page.locator('#userSearch').fill('no such fictional fan');
  await page.getByText('No users match these filters.',{exact:true}).waitFor();
  await page.locator('#userSearch').fill('');
  const group=person.group;
  await page.locator('#userGroup').selectOption(group);
  assert.equal(await page.locator('.user').count(),Object.values(snapshot.state.users).filter(u=>u.group===group).length);
  await page.locator('#userGroup').selectOption('');
  await page.screenshot({path:evidence+'/crowd.png',fullPage:true});
  results.push('Crowd search, group filter, empty state and personality disclosure work');

  await page.getByRole('button',{name:'Findings',exact:true}).click();
  const lastFinding=snapshot.state.findings.at(-1);
  const findingButton=page.locator('.finding-select').filter({hasText:lastFinding.title});
  await findingButton.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(title=>document.getElementById('detail').textContent.includes(title),lastFinding.title);
  const exported=await page.getByRole('link',{name:'Download developer report'}).getAttribute('href');
  assert.ok(exported.endsWith(`/findings/${snapshot.state.findings.length-1}/export`));
  await page.goBack();
  await page.waitForFunction(()=>document.body.dataset.view==='crowd');
  await page.goForward();
  await page.waitForFunction(()=>document.body.dataset.view==='findings');
  await page.screenshot({path:evidence+'/findings.png',fullPage:true});
  results.push('Keyboard selection changes the evidence panel and report link');

  await page.getByRole('button',{name:'Load tests',exact:true}).click();
  assert.ok(await page.locator('.load-panel').isVisible());
  assert.ok(!await page.locator('main').isVisible());
  await page.locator('#crowdFixed').click();
  assert.ok(requests.includes('/api/crowd?users=300&target=fixed'));
  await page.screenshot({path:evidence+'/load.png',fullPage:true});
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  await page.locator('#configuration > summary').click();
  await page.locator('#audienceCount').selectOption('10');
  await page.locator('#runHeadless').click();
  assert.ok(requests.includes('/api/run?headed=0&users=audience&count=10'));
  await page.locator('#generateAudience').click();
  assert.ok(requests.includes('/api/audience/generate?count=10'));
  results.push('Run, audience generation and load controls retain their API contracts, with mutations intercepted');
  assert.equal(errors.length,0,errors.join('; '));
  await page.close();

  for(const [width,height] of [[390,844],[768,1024],[1366,900]]) {
    const p=await openPage({viewport:{width,height}});const pageErrors=[];p.on('pageerror',e=>pageErrors.push(e.message));
    await p.goto(base);await p.waitForFunction(()=>document.getElementById('metricUsers').textContent!=='0');
    for(const view of ['overview','crowd','findings','load']) {
      await p.locator(`.nav-item[data-view="${view}"]`).click();
      const dimensions=await p.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth}));
      assert.ok(dimensions.content<=dimensions.width,`${width}px ${view} overflows: ${JSON.stringify(dimensions)}`);
    }
    await p.locator('.nav-item[data-view="overview"]').click();
    await p.screenshot({path:`${evidence}/responsive-${width}.png`,fullPage:true});
    assert.equal(pageErrors.length,0,pageErrors.join('; '));
    results.push(`All four views fit ${width}px without horizontal overflow or page errors`);
    await p.close();
  }
  const empty=await openPage({viewport:{width:1366,height:900}});
  const emptyErrors=[];empty.on('pageerror',e=>emptyErrors.push(e.message));
  await empty.route('**/api/state',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...snapshot,busy:false,state:null})}));
  await empty.route('**/api/run?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"The test server is temporarily unavailable"}'}));
  await empty.goto(base);
  await empty.waitForFunction(()=>!document.getElementById('runHeadless').disabled);
  assert.equal(await empty.locator('#phase').textContent(),'idle');
  assert.equal(await empty.locator('#metricUsers').textContent(),'0');
  assert.ok(await empty.locator('#configuration').evaluate(el=>el.open));
  await empty.locator('#runHeadless').click();
  await empty.getByRole('alert').filter({hasText:'The test server is temporarily unavailable'}).waitFor();
  assert.equal(emptyErrors.length,0);
  await empty.screenshot({path:evidence+'/empty-and-error.png',fullPage:true});
  await empty.close();
  results.push('A new workspace opens configuration and surfaces run errors without page exceptions');

  const busy=await openPage();
  await busy.route('**/api/state',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({...snapshot,busy:true,state:{...snapshot.state,phase:'exploring'}})}));
  await busy.goto(base);
  await busy.waitForFunction(()=>document.getElementById('phase').textContent==='exploring');
  assert.ok(await busy.locator('#runHeadless').isDisabled());
  assert.ok(await busy.locator('#generateAudience').isDisabled());
  assert.equal(await busy.locator('#runHeadless').textContent(),'Working...');
  await busy.close();
  results.push('An active run disables conflicting controls and shows its working state');

  const offline=await openPage();const offlineErrors=[];offline.on('pageerror',e=>offlineErrors.push(e.message));
  await offline.route('**/api/state',route=>route.abort('failed'));
  await offline.goto(base);
  await offline.waitForFunction(()=>document.getElementById('phase').textContent==='offline');
  assert.ok(await offline.locator('#runHeadless').isDisabled());
  assert.equal(offlineErrors.length,0);
  await offline.close();
  const after=await fetch(base+'/api/state').then(r=>r.json());
  assert.equal(after.state.runId,snapshot.state.runId,'UI tests do not replace the verified run');
  assert.equal(after.budget.calls,snapshot.budget.calls,'UI tests do not make paid model calls');
  results.push('Unavailable-server state remains usable; verified run and model-call count are unchanged');
  await writeFile(evidence+'/RESULTS.json',JSON.stringify({results,requests,paidRunsStarted:0,referenceUsers:people.audience.length},null,2));
  console.log(results.map(r=>'PASS '+r).join('\n'));
  console.log('Evidence: '+evidence);
} finally {await browser.close();}

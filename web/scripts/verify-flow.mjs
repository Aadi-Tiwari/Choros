import { chromium } from 'playwright';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';

const site = 'http://127.0.0.1:3020';
const saved = [];
const fixture = createServer(async (req, res) => {
  if (req.url === '/api/notes' && req.method === 'POST') {
    let body = ''; for await (const chunk of req) body += chunk;
    saved.push(JSON.parse(body)); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><html lang="en"><title>CHOROS connection check</title><body><h1>Fictional notes</h1><form><label for="title">Title</label><input id="title" required><label for="message">Message</label><textarea id="message" required></textarea><button>Save note</button></form><p role="status"></p><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const note={title:document.querySelector('#title').value,message:document.querySelector('#message').value};const r=await fetch('/api/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(note)});document.querySelector('[role=status]').textContent=r.ok?'Saved note: '+note.title:'Save failed'}</script></body></html>`);
});
await new Promise(ok => fixture.listen(0, '127.0.0.1', ok));
const app = `http://127.0.0.1:${fixture.address().port}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = []; page.on('pageerror', error => failures.push(error.message));
try {
  await page.goto(site);
  await page.waitForFunction(() => {const v=document.querySelector('video');return v&&!v.paused&&v.currentTime>0});
  assert.equal(await page.locator('footer').count(),0);
  const goal = page.getByRole('textbox', { name: 'Describe your app and testing goal' });
  await goal.fill("Test this app with exactly one user. Enter the exact title 'Connection check' and exact message 'Only fictional test content'. Click Save note, verify the Saved note confirmation appears, then stop. Do not create an account; this app does not require one.");
  await page.getByRole('button', { name: 'Add an app URL' }).click();
  await page.getByRole('textbox', { name: 'App URL', exact: true }).fill(app);
  await goal.press('Enter');
  await page.waitForURL(/\/dashboard\?run=/);
  const id = new URL(page.url()).searchParams.get('run');
  assert(id);
  console.log('PASS: landing submission navigated to its real run dashboard. Run ID:', id);
  let run;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    run = await (await page.request.get(`${site}/api/simulations/${id}`)).json();
    if (['completed','failed'].includes(run.status)) break;
    await new Promise(ok => setTimeout(ok, 1000));
  }
  assert.equal(run.status, 'completed', run.error || 'Run did not finish.');
  assert(saved.some(note => note.title==='Connection check' && note.message==='Only fictional test content'), 'The browser user did not save the requested content.');
  assert(run.users.some(user => user.steps > 0 && user.lastShot));
  console.log('PASS: Claude interpreted the request and the real browser saved the exact requested fictional content.');
  const user = run.users.find(user=>user.lastShot);
  const screenshot = await page.request.get(`${site}/api/simulations/${id}/shots/${user.lastShot.split('/').pop()}`);
  assert.equal(screenshot.status(),200);
  assert(screenshot.headers()['content-type'].includes('image/jpeg'));
  await page.getByRole('button', { name: `Inspect ${user.name}`, exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('img', { name: `${user.name}'s browser screenshot` }).waitFor();
  await page.keyboard.press('Escape');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evidence' }).click();
  const stream = await (await downloading).createReadStream(); let report='';for await(const chunk of stream) report+=chunk;
  assert.equal(JSON.parse(report).id,id);
  await page.getByRole('tab', { name: 'Run history', exact: true }).click();
  await page.getByRole('button', { name: `${run.plan.title}, run ${id.slice(0,8)}`, exact: true }).click();
  await page.getByText('Exploration in motion', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: `Inspect ${user.name}`, exact: true }).waitFor();
  console.log('PASS: session screenshots, evidence export, history selection, and dashboard reload all retain the correct run.');
  await page.screenshot({path:'connected-dashboard-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Toggle Sidebar'}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
  await page.screenshot({path:'connected-dashboard-mobile.png',fullPage:true});
  await page.getByRole('link',{name:'New simulation',exact:true}).last().click();
  await page.getByRole('textbox',{name:'Describe your app and testing goal'}).waitFor();
  const remaining=await page.getByRole('textbox',{name:'Describe your app and testing goal'}).inputValue();
  assert.equal(remaining, '', 'New simulation should open a clean composer.');
  console.log('PASS: New simulation opens a clean composer.');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'connected-landing-mobile.png',fullPage:true});
  assert.deepEqual(failures,[]);
  await mkdir('.choros-runs',{recursive:true});await writeFile('.choros-runs/connection-audit.json',JSON.stringify({id,requestedContentSaved:true,actions:run.users.reduce((sum,user)=>sum+user.steps,0),newSimulationClean:!remaining,browserErrors:failures},null,2));
  console.log('PASS: desktop/mobile layout and no browser runtime errors.');
} finally { await browser.close(); await new Promise(ok=>fixture.close(ok)); }

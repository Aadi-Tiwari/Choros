import { chromium } from "playwright";
import { startTarget } from "./target.mjs";
import { ticketSnapshot, ticketFindings } from "./ticket-checks.mjs";

export async function runTicketScale({ target: config, appDir, port, records, users, onProgress }) {
  const journeys = records.filter((r) => r.network.some((n) => n.method === "POST" && /signup/.test(n.path)));
  if (!journeys.length) throw new Error("No authenticated request journeys to replay");
  const app = await startTarget(config, appDir, port);
  const browser = await chromium.launch();
  const began = Date.now(), latencies = [];
  const stats = { status:"running", mode:"recorded HTTP requests in isolated browser sessions", requested:users, started:0, active:0,
    peakSimultaneous:0, completed:0, failed:0, requests:0, serverErrors:0, pageErrors:0, expectedRejections:0, blockedSteps:0,
    errorsByEndpoint:{}, varied:false, peakOverlappingBuys:0 };
  let activeBuys=0;
  const report = () => { const sorted=[...latencies].sort((a,b)=>a-b); const pct=(p)=>Math.round(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]||0); return {...stats,p50ms:pct(.5),p95ms:pct(.95),seconds:Math.round((Date.now()-began)/1000)}; };
  const tick=setInterval(()=>onProgress?.(report()),1000);
  try {
    await Promise.all(Array.from({length:users},async(_,i)=>{
      const source=journeys[i%journeys.length];
      const email=`load${i+1}@example.com`;
      const context=await browser.newContext();
      stats.started++; stats.active++; stats.peakSimultaneous=Math.max(stats.peakSimultaneous,stats.active);
      try {
        const page=await context.newPage();
        const buys=new Set();
        page.on("request",(r)=>{if(r.method()==='POST' && new URL(r.url()).pathname==='/api/buy'){buys.add(r);activeBuys++;stats.peakOverlappingBuys=Math.max(stats.peakOverlappingBuys,activeBuys);}});
        const finished=(r)=>{if(buys.delete(r)) activeBuys--;};
        page.on("requestfailed",finished);
        page.on("requestfinished",(r)=>{finished(r);if(['fetch','xhr'].includes(r.resourceType())){const t=r.timing();if(t.responseEnd>0)latencies.push(t.responseEnd);}});
        page.on("response",(r)=>{if(['fetch','xhr'].includes(r.request().resourceType())){stats.requests++;if(r.status()>=500){stats.serverErrors++;const key=r.request().method()+' '+new URL(r.url()).pathname;stats.errorsByEndpoint[key]=(stats.errorsByEndpoint[key]||0)+1;}}});
        page.on("pageerror",()=>stats.pageErrors++);
        await page.goto(app.url);
        const mutations=source.network.filter((r)=>['POST','PUT','PATCH','DELETE'].includes(r.method)).map((r)=>{
          const url=new URL(r.path,app.url);
          if(url.origin!==new URL(app.url).origin) throw new Error("Replay must stay on the isolated app");
          const data=JSON.parse(r.requestBody||'{}');
          if(/signup|signin|login|register/.test(r.path)) {
            if(data.email) data.email=email;
            if(data.username) data.username=`load${i+1}`;
            if(data.name) data.name=`Load buyer ${i+1}`;
          }
          return {path:url.pathname+url.search,method:r.method,data};
        });
        const result=await page.evaluate(async(rows)=>{
          const statuses=[];
          for(const row of rows){const response=await fetch(row.path,{method:row.method,headers:{'content-type':'application/json'},body:JSON.stringify(row.data)});await response.text();statuses.push({path:row.path,status:response.status});}
          return statuses;
        },mutations);
        stats.expectedRejections+=result.filter((r)=>r.path==='/api/buy' && [400,409].includes(r.status)).length;
        const unexpected=result.filter((r)=>r.status>=400 && !(r.path==='/api/buy' && [400,409].includes(r.status)));
        if(unexpected.length) stats.failed++; else stats.completed++;
      } catch { stats.failed++; stats.blockedSteps++; }
      finally {stats.active--;await context.close();}
    }));
    stats.tickets=await ticketSnapshot(app.dataFile);
    stats.invariantFindings=await ticketFindings(app.dataFile,[]);
    stats.status='done';
    return report();
  } finally {clearInterval(tick);await browser.close();await app.stop();}
}

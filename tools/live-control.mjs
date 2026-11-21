import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";
import { loadTarget, ROOT } from "../lib/config.mjs";
import { runCrowd } from "../lib/crowd.mjs";
const source = resolve(process.argv[2] || "");
const rel = relative(resolve(ROOT,"runs"),source);
if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Choose a Choros run folder");
if(process.argv.includes('--wait')) {
  const dashboard=process.env.CHOROS_DASHBOARD || 'http://127.0.0.1:4002';
  const deadline=Date.now()+8*60000;
  console.log('Waiting for the combined repairs and replay load test to finish');
  while(true) {
    const data=await fetch(dashboard+'/api/state').then(r=>r.json());
    const st=data.state;
    if(!data.busy && st?.latestFixed && st.crowd?.status==='done' && st.recheck?.counts?.fixed===st.findings.filter(f=>f.status==='confirmed').length) break;
    if(Date.now()>deadline) throw new Error('Combined verification was not ready within the control wait limit');
    await new Promise(r=>setTimeout(r,3000));
  }
}
const state = JSON.parse(await readFile(join(source,"state.json"),"utf8"));
if (!state.latestFixed) throw new Error("No verified combined candidate exists");
const target = await loadTarget(state.app.id);
const count = Number(process.argv[3] || 100);
if (!Number.isInteger(count) || count < 1 || count > 100 || !target.fans?.length) throw new Error("Choose 1 to 100 saved users");
const dir = join(source,"live-control-"+Date.now());
await mkdir(dir,{recursive:true});
let finished=0;
const result = await runCrowd({target,appDir:state.latestFixed,port:4401,personas:target.fans.slice(0,count),runDir:dir,headed:false,remember:false,reflect:false,
  log:console.log,onUpdate:(e)=>{if(e.type==='user' && ['finished','failed'].includes(e.user.status)) {finished++; if(finished%10===0) console.log(`${finished}/${count} visits finished`);}}});
const report={appDir:state.latestFixed,target:target.id,runDir:dir,requested:count,finished:result.records.filter(r=>r.status==='finished').length,
  failed:result.records.filter(r=>r.status==='failed').length,confirmed:result.findings.filter(f=>f.status==='confirmed').length,findings:result.findings,tickets:result.tickets,metrics:result.metrics};
await writeFile(join(dir,"RESULT.json"),JSON.stringify(report,null,2));
await writeFile(join(source,"live-control-result.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(report.confirmed || report.failed || report.metrics.signedInBeforeSale!==count || report.metrics.verifiedSessions!==count) process.exitCode=1;

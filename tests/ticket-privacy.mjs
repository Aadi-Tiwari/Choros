import assert from "node:assert/strict";
import { request } from "playwright";
import { loadTarget } from "../lib/config.mjs";
import { startTarget } from "../lib/target.mjs";
import { credentialsOf, ensureSession, findIssues } from "../lib/checks.mjs";

for(const id of ['seatdrop','seatdrop-planted']) {
  const target=await loadTarget(id), app=await startTarget(target,target.appDir,4331), users=[];
  try {
    for(const name of ['alice','bob']) {
      const context=await request.newContext({baseURL:app.url});
      const record={id:name,name,baseUrl:app.url,steps:[],network:[],pageErrors:[],consoleErrors:[],memory:[]};
      const signup={name,email:`${name}@example.com`,password:`${name}-pass-123`};
      const r=await context.post('/api/signup',{data:signup});
      record.network.push({at:Date.now(),method:'POST',path:'/api/signup',status:r.status(),requestBody:JSON.stringify(signup),body:await r.text()});
      assert.equal(credentialsOf(record.steps,record.network).name,signup.email,'Recover the successful auth request when a step has no response association');
      if(name==='alice') await context.post('/api/buy',{data:{seats:['A1']}});
      const state=await context.get('/api/state');
      record.network.push({at:Date.now(),method:'GET',path:'/api/state',status:state.status(),requestBody:'',body:await state.text()});
      users.push({record,context:{request:context}});
      assert.ok((await ensureSession(context,record.steps,target,app.url,name,record.network)).ok);
    }
    const findings=await findIssues(users,{target});
    if(id==='seatdrop') assert.equal(findings.length,0);
    else {assert.equal(findings.filter(f=>f.kind==='data_leak'&&f.status==='confirmed').length,2,JSON.stringify(findings.map(f=>({title:f.title,status:f.status,anonymous:f.anonymous,confirmation:f.confirmation}))));assert.ok(findings.some(f=>f.anonymous));}
    console.log(`PASS ${id}: ${findings.length} privacy findings, including late auth response handling`);
  } finally {await Promise.all(users.map(u=>u.context.request.dispose()));await app.stop();}
}

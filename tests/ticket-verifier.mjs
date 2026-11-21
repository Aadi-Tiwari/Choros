import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadTarget, ROOT } from "../lib/config.mjs";
import { verifyFinding } from "../lib/replay.mjs";

const target = await loadTarget("seatdrop");
const dir = join(ROOT,"runs",`ticket-verifier-${Date.now()}`);
await mkdir(dir,{recursive:true});
const records = ["alice","bob"].map((name)=>({id:name,name,steps:[],network:[
  {method:"POST",path:"/api/signup",requestBody:JSON.stringify({name,email:`${name}@example.com`,password:`${name}-pass-123`})},
  {method:"POST",path:"/api/buy",requestBody:JSON.stringify({seats:["A1"],promo:"EARLYBIRD"})},
]}));
const finding = {signature:"ticket_invariant:double_seat",kind:"ticket_invariant",expected:"Each seat has at most one owner"};
const guard = "if (body.seats.some(s => sold.includes(s))) return json(res, 409, { error: 'A selected seat just sold. Please choose again.' });";
const promoGuard = "if (promo && db.promoUsed) return json(res, 409, { error: 'EARLYBIRD has already been used.' });";
const results=[];
for(const control of ["healthy","duplicate-sales","deny-everyone","pretend-success"]) {
  const appDir=join(dir,control);
  await cp(target.appDir,appDir,{recursive:true});
  const file=join(appDir,"server.js"); let source=await readFile(file,"utf8");
  if(control==='duplicate-sales') {
    assert.ok(source.includes(guard) && source.includes(promoGuard));
    source=source.replace(guard,"").replace(promoGuard,"");
  }
  if(control==='deny-everyone') source=source.replace("if (url.pathname === '/api/buy') {","if (url.pathname === '/api/buy') { return json(res, 403, {error:'Disabled'});");
  if(control==='pretend-success') source=source.replace("if (url.pathname === '/api/buy') {","if (url.pathname === '/api/buy') { return json(res, 201, {order:{seats:body.seats}});");
  if(control!=='healthy') await writeFile(file,source);
  const result=await verifyFinding({target,appDir,port:4311,records,finding});
  assert.equal(result.status,control==='healthy'?'fixed':'failing',JSON.stringify(result));
  results.push({control,...result});
  console.log(`PASS ${control}: ${result.status}`);
}
await writeFile(join(dir,"results.json"),JSON.stringify(results,null,2));
console.log(`Evidence: ${dir}`);

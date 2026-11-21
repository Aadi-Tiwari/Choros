import { readFile, writeFile } from "node:fs/promises";
const originalDir="runs/seatdrop-final/run-2026-11-07T22-38-51-487Z";
const verifiedDir=process.argv[2];
if(!verifiedDir) throw new Error("Choose the verified SeatDrop run folder");
const read=async(path)=>JSON.parse(await readFile(path,"utf8"));
const [original, state, control]=await Promise.all([read(originalDir+"/state.json"),read(verifiedDir+"/state.json"),read(verifiedDir+"/live-control-result.json")]);
if(state.recheck?.counts?.failing || state.recheck?.counts?.blocked || state.recheck?.counts?.fixed!==state.findings.filter(f=>f.status==='confirmed').length) throw new Error("Combined verification is incomplete");
if(control.confirmed || control.failed || control.metrics.signedInBeforeSale!==control.requested || control.metrics.verifiedSessions!==control.requested) throw new Error("Fresh live control did not pass completely");
const summarize=(s)=>({provider:s.model,requested:Object.keys(s.users).length,signedInBeforeSale:s.metrics.signedInBeforeSale,peakBrowserVisits:s.metrics.peakBrowsers,
  peakPendingModelDecisions:s.metrics.peakDecisions,purchaseResponses:s.metrics.buyRequests,purchaseResponseSpreadMs:s.metrics.buySpreadMs,
  peakPurchaseResponsesInOneSecond:s.metrics.peakBuyRequestsInOneSecond,peakOverlappingPurchaseRequests:s.metrics.peakOverlappingBuys,
  committedSeats:s.tickets.sold,duplicateSeats:s.tickets.duplicates.length,promoRedemptions:s.tickets.promoUses,
  confirmedFindings:s.findings.filter(f=>f.status==='confirmed').length,uncertainFindings:s.findings.filter(f=>f.status==='uncertain').length});
const result={original:{...summarize(original),source:originalDir,privacyCoverage:'Initial identity association was incomplete; no claim of complete privacy coverage for this run.'},
  planted:{...summarize(state),source:verifiedDir,disclosure:'Bugs written in on purpose. Detector and verifier control, not independent discovery.'},
  combinedVerification:state.recheck.counts,repairs:Object.entries(state.fixes).map(([signature,f])=>({signature,status:f.status,cached:Boolean(f.cached),seconds:f.seconds,files:f.applied?.map(a=>a.path)||[]})),
  replayLoad:{mode:state.crowd.mode,requested:state.crowd.requested,peakBrowserSessions:state.crowd.peakSimultaneous,completed:state.crowd.completed,failed:state.crowd.failed,
    requests:state.crowd.requests,serverErrors:state.crowd.serverErrors,expectedPurchaseRejections:state.crowd.expectedRejections,p95ms:state.crowd.p95ms,
    committedSeats:state.crowd.tickets?.sold,duplicateSeats:state.crowd.tickets?.duplicates.length,promoRedemptions:state.crowd.tickets?.promoUses,confirmedInvariantFindings:state.crowd.invariantFindings?.length},
  freshLiveControl:{requested:control.requested,finished:control.finished,failed:control.failed,confirmedFindings:control.confirmed,signedInBeforeSale:control.metrics.signedInBeforeSale,
    verifiedSessions:control.metrics.verifiedSessions,committedSeats:control.tickets.sold,duplicateSeats:control.tickets.duplicates.length,promoRedemptions:control.tickets.promoUses,source:control.runDir},
  tokenEstimates:{plantedLiveRunUSD:state.metrics.budget.estimatedUSD,freshControlUSD:control.metrics.budget.estimatedUSD,note:'Configured token-rate estimates, not an invoice. Each process has a $15 cap; other rehearsal processes are separate.'}};
await writeFile("targets/seatdrop/RESULTS.json",JSON.stringify(result,null,2));
let readme=await readFile("README.md","utf8");
const p=result.planted,l=result.replayLoad,c=result.freshLiveControl;
const text=[
  'Measured on November 7 with `claude-opus-5-5` (Anthropic). Full sources and metrics: `targets/seatdrop/RESULTS.json`.', '',
  '| Check | Result |','| --- | --- |',
  `| Unmodified SeatDrop | ${result.original.signedInBeforeSale}/${result.original.requested} signed in; ${result.original.confirmedFindings} confirmed findings; ${result.original.uncertainFindings} unconfirmed signup failure |`,
  `| Disclosed planted control | ${p.signedInBeforeSale}/${p.requested} signed in; ${p.committedSeats} sold of 20; ${p.duplicateSeats} duplicate seats; ${p.promoRedemptions} promo redemptions |`,
  `| Findings on planted control | ${p.confirmedFindings} confirmed: two privacy exposures, overselling, duplicate ownership and promo reuse |`,
  `| Actual purchase overlap | ${p.peakOverlappingPurchaseRequests} requests in flight; peak ${p.peakPurchaseResponsesInOneSecond} completed purchase responses in one second |`,
  `| Combined candidate | ${result.combinedVerification.fixed} findings pass recheck; ${result.combinedVerification.failing} still failing; ${result.combinedVerification.blocked} blocked |`,
  `| Replay load | ${l.completed}/${l.requested} request journeys completed in browser sessions; ${l.serverErrors} server errors; ${l.expectedPurchaseRejections} expected purchase rejections |`,
  `| Independent ledger after load | ${l.committedSeats} sold; ${l.duplicateSeats} duplicate seats; ${l.promoRedemptions} promo redemption; ${l.confirmedInvariantFindings} invariant findings |`,
  `| Fresh live control on candidate | ${c.finished}/${c.requested} visits finished; ${c.failed} failed; ${c.confirmedFindings} confirmed findings; ${c.verifiedSessions} identities verified |`,
  '',
  'The load test replays recorded HTTP requests in browser sessions with unique accounts. Completed means requests received valid responses, including sold-out rejections, not that every buyer obtained tickets. The initial unmodified run had incomplete privacy identity association; that issue was repaired and covered by focused privacy controls and the fresh live control. The planted and fresh live runs use normal goals, without bug hints.'
].join('\n');
readme=readme.replace('Current-run results will be recorded below once verification completes.',text);
await writeFile("README.md",readme);
let submission=await readFile("SUBMISSION-DRAFT.md","utf8");
submission=submission.replace('Current SeatDrop run results are pending final verification and will be inserted from saved run artifacts. No demo outcome is assumed in advance.',`On the disclosed planted copy, ${p.signedInBeforeSale} live fans produced ${p.committedSeats} sold seats, ${p.duplicateSeats} duplicate seats and ${p.promoRedemptions} promo redemptions. Choros confirmed ${p.confirmedFindings} findings. The combined candidate passed all ${result.combinedVerification.fixed} rechecks. Its ${l.requested}-session request replay had ${l.serverErrors} server errors and ${l.confirmedInvariantFindings} inventory or promo findings, with ${l.expectedPurchaseRejections} expected purchase rejections. A fresh ${c.requested}-fan live control finished ${c.finished} visits with ${c.confirmedFindings} confirmed findings. Source: targets/seatdrop/RESULTS.json. These are control results, not independently discovered bugs. The untouched original confirmed no target violations, with an unconfirmed signup failure and incomplete initial privacy identity association.`);
await writeFile("SUBMISSION-DRAFT.md",submission);
console.log(JSON.stringify(result));

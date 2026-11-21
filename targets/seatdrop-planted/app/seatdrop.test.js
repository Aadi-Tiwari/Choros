'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

test('accounts, competing purchases, global promo, cancellation, and persistence', async t => {
  const file = path.join(__dirname, `.test-data-${process.pid}.json`);
  let child;
  async function start(extra = {}) {
    child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: '0', DATA_FILE: file, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
      child.once('error', reject);
      child.stdout.on('data', data => { const match = String(data).match(/port (\d+)/); if (match) { clearTimeout(timeout); resolve('http://127.0.0.1:' + match[1]); } });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error('Server exited ' + code)); });
    });
  }
  async function stop() { if (!child || child.exitCode !== null) return; const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
  t.after(async () => { await stop(); for (const p of [file, file + '.tmp']) if (fs.existsSync(p)) fs.unlinkSync(p); });
  let base = await start();
  async function call(route, body, cookie) {
    const response = await fetch(base + '/api/' + route, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  let state = await call('state'); assert.equal(state.body.seats.length, 20); assert.deepEqual(state.body.seats.slice(-5), ['D1','D2','D3','D4','D5']);
  assert.equal((await call('buy', { seats: ['A1'] })).status, 401);
  const a = await call('signup', { name: 'Alice', email: 'alice@example.test', password: 'password123' });
  const b = await call('signup', { name: 'Bob', email: 'bob@example.test', password: 'password123' });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal((await call('signup', { name: 'Other', email: 'ALICE@example.test', password: 'password123' })).status, 409);
  assert.equal((await call('buy', { seats: ['A1','A2','A3'] }, a.cookie)).status, 400);
  assert.equal((await call('buy', { seats: ['A1','A1'] }, a.cookie)).status, 400);
  assert.equal((await call('buy', { seats: ['Z9'] }, a.cookie)).status, 400);
  assert.equal((await call('buy', { seats: ['A1'], promo: 'BAD' }, a.cookie)).status, 400);
  const race = await Promise.all([call('buy', { seats: ['A1','A2'], promo: 'EARLYBIRD' }, a.cookie), call('buy', { seats: ['A1'], promo: 'EARLYBIRD' }, b.cookie)]);
  assert.deepEqual(race.map(r => r.status).sort(), [201,409]);
  const winner = race[0].status === 201 ? a : b, loser = winner === a ? b : a;
  const order = race.find(r => r.status === 201).body.order;
  assert.equal(order.total, order.seats.length * 6800);
  assert.equal((await call('buy', { seats: ['B1'] }, winner.cookie)).status, 409);
  assert.equal((await call('buy', { seats: ['B1'], promo: 'EARLYBIRD' }, loser.cookie)).status, 409);
  assert.equal((await call('state', undefined, loser.cookie)).body.order, null);
  assert.equal((await call('cancel', {}, loser.cookie)).status, 404);
  assert.equal((await call('cancel', {}, winner.cookie)).status, 200);
  assert.equal((await call('state')).body.sold.length, 0);
  assert.equal((await call('buy', { seats: ['A1'], promo: 'EARLYBIRD' }, loser.cookie)).status, 409);
  assert.equal((await call('buy', { seats: ['A1'] }, loser.cookie)).body.order.total, 8500);
  const disk = JSON.parse(fs.readFileSync(file, 'utf8')); assert.equal(disk.promoUsed, true); assert.equal(disk.users[0].password, undefined); assert.notEqual(disk.users[0].hash, 'password123');
  await stop(); base = await start();
  assert.deepEqual((await call('state')).body.sold, ['A1']);
  assert.equal((await call('signin', { email: 'alice@example.test', password: 'wrongpass' })).status, 401);
  const signedIn = await call('signin', { email: 'alice@example.test', password: 'password123' }); assert.equal(signedIn.status, 200);
  await call('signout', {}, signedIn.cookie); assert.equal((await call('state', undefined, signedIn.cookie)).body.user, null);
  await stop(); base = await start({ SALE_OPENS_AT: '2099-01-01T00:00:00Z' });
  const futureUser = await call('signin', { email: winner === a ? 'alice@example.test' : 'bob@example.test', password: 'password123' });
  assert.equal((await call('buy', { seats: ['C1'] }, futureUser.cookie)).status, 409);
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/my-order')).status, 200);
  assert.equal((await fetch(base + '/server.js')).status, 404);
});

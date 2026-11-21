'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const opensAt = process.env.SALE_OPENS_AT || '2026-01-01T00:00:00Z';
if (!Number.isFinite(Date.parse(opensAt))) throw new Error('Invalid SALE_OPENS_AT');
let db = { users: [], orders: [], promoUsed: false };
if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
function save() {
  fs.mkdirSync(path.dirname(path.resolve(DATA_FILE)), { recursive: true });
  fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
}
const sessions = new Map();
const seats = Array.from({ length: 20 }, (_, i) => String.fromCharCode(65 + Math.floor(i / 5)) + (i % 5 + 1));
const json = (res, status, data, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(data)); };
function publicUser(user) { return user && { name: user.name, email: user.email }; }
function getUser(req) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('session='))?.slice(8);
  const session = sessions.get(token);
  if (!session || session.expires < Date.now()) { sessions.delete(token); return null; }
  return db.users.find(u => u.id === session.id);
}
function login(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { id: user.id, expires: Date.now() + 86400000 });
  json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400` });
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      const files = { '/': ['index.html', 'text/html'], '/my-order': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };
      const file = files[url.pathname];
      if (!file || req.method !== 'GET') return json(res, 404, { error: 'Page not found.' });
      res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, 'public', file[0])));
    }
    const user = getUser(req);
    if (req.method === 'GET' && url.pathname === '/api/state') {
      return json(res, 200, { event: { name: 'Midnighre', date: 'Dec 12', opensAt, price: 8500 }, recentOrder: db.orders.find(o => !o.cancelled) || null, user: publicUser(user), seats, sold: db.orders.filter(o => !o.cancelled).flatMap(o => o.seats), order: user ? db.orders.find(o => o.userId === user.id && !o.cancelled) || null : null });
    }
    if (req.method !== 'POST') return json(res, 404, { error: 'Not found.' });
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return json(res, 403, { error: 'Request origin rejected.' });
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 10000) return json(res, 413, { error: 'Request too large.' }); }
    let body;
    try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'Invalid request.' }); }
    if (url.pathname === '/api/signup') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return json(res, 400, { error: 'Enter your name, a valid email, and a password of 8 to 128 characters.' });
      if (db.users.some(u => u.email === email)) return json(res, 409, { error: 'This email is registered. Please sign in.' });
      const salt = crypto.randomBytes(16).toString('hex');
      const newUser = { id: crypto.randomUUID(), name, email, salt, hash: crypto.scryptSync(body.password, salt, 64).toString('hex') };
      db.users.push(newUser); save(); return login(res, newUser);
    }
    if (url.pathname === '/api/signin') {
      const found = db.users.find(u => u.email === String(body.email || '').trim().toLowerCase());
      if (typeof body.password !== 'string' || body.password.length > 128 || !found || !crypto.timingSafeEqual(Buffer.from(found.hash, 'hex'), crypto.scryptSync(body.password, found.salt, 64))) return json(res, 401, { error: 'Email or password is incorrect.' });
      return login(res, found);
    }
    if (url.pathname === '/api/signout') {
      const token = (req.headers.cookie || '').match(/(?:^|;\s*)session=([^;]+)/)?.[1]; sessions.delete(token);
      return json(res, 200, {}, { 'Set-Cookie': 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }
    if (!user) return json(res, 401, { error: 'Sign in to continue.' });
    if (url.pathname === '/api/buy') {
      if (Date.now() < Date.parse(opensAt)) return json(res, 409, { error: 'The sale has not opened yet.' });
      if (db.orders.some(o => o.userId === user.id && !o.cancelled)) return json(res, 409, { error: 'You already have an order. View My order.' });
      if (!Array.isArray(body.seats) || body.seats.length < 1 || body.seats.length > 2 || new Set(body.seats).size !== body.seats.length || body.seats.some(s => !seats.includes(s))) return json(res, 400, { error: 'Choose 1 or 2 different seats.' });
      const sold = db.orders.filter(o => !o.cancelled).flatMap(o => o.seats);
      
      const promo = String(body.promo || '').trim().toUpperCase();
      if (promo && promo !== 'EARLYBIRD') return json(res, 400, { error: 'That promo code is not valid.' });
      
      const order = { id: crypto.randomUUID(), userId: user.id, name: user.name, email: user.email, seats: body.seats, total: body.seats.length * 8500 * (promo ? 0.8 : 1), promo: promo || null, createdAt: new Date().toISOString(), cancelled: false };
      db.orders.push(order); if (promo) db.promoUsed = true; save();
      return json(res, 201, { order });
    }
    if (url.pathname === '/api/cancel') {
      const order = db.orders.find(o => o.userId === user.id && !o.cancelled);
      if (!order) return json(res, 404, { error: 'No active order to cancel.' });
      order.cancelled = true; save(); return json(res, 200, {});
    }
    return json(res, 404, { error: 'Not found.' });
  } catch (error) { console.error('Request failed:', error.message); if (!res.headersSent) json(res, 500, { error: 'Something went wrong. Please try again.' }); else res.end(); }
});
server.listen(process.env.PORT || 3000, () => console.log(`SeatDrop listening on port ${server.address().port}`));

'use strict';
const $ = id => document.getElementById(id);
let state, selected = [], signup = false, promoApplied = false, busy = false;
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
async function api(url, body) {
  const response = await fetch('/api/' + url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Please try again.'); return data;
}
let noticeTimer;
function notice(message) { $('notice').textContent = message; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('notice').textContent = '', 6000); }
function openAuth() { $('auth-error').textContent = ''; $('auth').showModal(); }
function render() {
  const open = Date.now() >= Date.parse(state.event.opensAt);
  $('sale-status').textContent = open ? 'On sale now' : 'Opens ' + new Date(state.event.opensAt).toLocaleString();
  $('account').textContent = state.user ? 'Sign out' : 'Sign in';
  selected = selected.filter(s => !state.sold.includes(s));
  $('seats').replaceChildren(...state.seats.map(s => {
    const b = document.createElement('button'); b.textContent = s; b.className = 'seat' + (selected.includes(s) ? ' selected' : '');
    b.disabled = state.sold.includes(s); b.setAttribute('aria-label', 'Seat ' + s + (b.disabled ? ', sold' : '')); b.setAttribute('aria-pressed', String(selected.includes(s)));
    b.onclick = () => { if (!open) return notice('The sale has not opened yet.'); if (state.order) return notice('You already have an order. Visit My order.'); if (selected.includes(s)) selected = selected.filter(x => x !== s); else if (selected.length < 2) selected.push(s); else return notice('You can choose up to 2 seats.'); render(); }; return b;
  }));
  $('selection').textContent = selected.length ? `Seats ${selected.join(', ')} · ${selected.length} ${selected.length === 1 ? 'ticket' : 'tickets'}` : 'Choose your seats on the map.';
  $('total').textContent = money(selected.length * state.event.price * (promoApplied ? .8 : 1));
  $('buy').textContent = state.order ? 'View my order' : !open ? 'Sale opening soon' : state.user ? 'Buy tickets' : 'Sign in to book';
  $('buy').disabled = busy || (!open && !state.order) || (Boolean(state.user) && !state.order && !selected.length);
  const orderPage = location.pathname === '/my-order';
  $('booking').hidden = orderPage; $('order-page').hidden = !orderPage;
  const content = $('order-content'); content.replaceChildren();
  if (orderPage) {
    const card = document.createElement('div'); card.className = 'order-card';
    if (!state.user) { card.textContent = 'Sign in to see your tickets.'; const b = document.createElement('button'); b.className = 'primary'; b.textContent = 'Sign in'; b.onclick = openAuth; card.append(b); }
    else if (!state.order) { card.textContent = 'Your next great night is waiting. You have no active order.'; const a = document.createElement('a'); a.href = '/#booking'; a.className = 'primary'; a.textContent = 'Find your seats'; card.append(a); }
    else {
      const title = document.createElement('h3'); title.textContent = 'Confirmed · Midnighre, Dec 12'; card.append(title);
      const dl = document.createElement('dl');
      for (const [label, value] of [['Name',state.user.name],['Email',state.user.email],['Seats',state.order.seats.join(', ')],['Total',money(state.order.total)],['Promo',state.order.promo || 'None']]) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; dl.append(dt,dd); }
      card.append(dl); const cancel = document.createElement('button'); cancel.className = 'small'; cancel.textContent = 'Cancel order';
      cancel.onclick = () => { cancel.hidden = true; const p = document.createElement('p'); p.className = 'cancel-confirm'; p.textContent = 'Cancel this order and release your seats? Promo codes are not restored.'; const yes = document.createElement('button'); yes.className = 'small'; yes.textContent = 'Yes, cancel order'; const no = document.createElement('button'); no.className = 'small'; no.textContent = 'Keep tickets'; no.onclick = render; yes.onclick = async () => { yes.disabled = true; try { await api('cancel', {}); await refresh(); notice('Order cancelled. Your seats are available again.'); } catch(e) { notice(e.message); yes.disabled = false; } }; card.append(p,yes,no); }; card.append(cancel);
    }
    content.append(card);
  }
}
async function refresh() { state = await api('state'); render(); }
$('account').onclick = async () => { if (!state?.user) return openAuth(); try { await api('signout', {}); await refresh(); notice('You are signed out.'); } catch(e) { notice(e.message); } };
$('close-auth').onclick = () => $('auth').close();
$('toggle-auth').onclick = () => { signup = !signup; $('name-label').hidden = !signup; $('name').required = signup; $('password').autocomplete = signup ? 'new-password' : 'current-password'; $('auth-title').textContent = signup ? 'Your night awaits.' : 'Welcome back.'; $('auth-description').textContent = signup ? 'Create an account to book your seats.' : 'Sign in to save your spot.'; $('auth-submit').textContent = signup ? 'Create account' : 'Sign in'; $('toggle-auth').textContent = signup ? 'Already have an account? Sign in' : 'New here? Create an account'; $('auth-error').textContent = ''; };
$('auth-form').onsubmit = async e => { e.preventDefault(); $('auth-submit').disabled = true; try { await api(signup ? 'signup' : 'signin', { name: $('name').value, email: $('email').value, password: $('password').value }); $('password').value = ''; $('auth').close(); await refresh(); notice('You are signed in.'); } catch(e) { $('auth-error').textContent = e.message; } finally { $('auth-submit').disabled = false; } };
$('apply').onclick = () => { promoApplied = $('promo').value.trim().toUpperCase() === 'EARLYBIRD'; $('promo-note').textContent = promoApplied ? '20% preview applied. Availability is checked when you buy.' : 'Enter EARLYBIRD for 20% off, while available.'; render(); };
$('promo').oninput = () => { if (promoApplied) { promoApplied = false; $('promo-note').textContent = 'Apply your code to preview the discount.'; render(); } };
$('buy').onclick = async () => { if (state.order) { location.href = '/my-order'; return; } if (!state.user) return openAuth(); if (!selected.length || busy) return; busy = true; render(); try { await api('buy', { seats: selected, promo: $('promo').value.trim() }); selected = []; location.href = '/my-order'; } catch(e) { notice(e.message); await refresh().catch(() => {}); } finally { busy = false; render(); } };
refresh().catch(e => notice(e.message));
setInterval(() => { if (!busy && !$('auth').open && location.pathname !== '/my-order') refresh().catch(() => {}); }, 5000);

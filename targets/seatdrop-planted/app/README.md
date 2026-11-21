# SeatDrop

Run `npm start` with Node.js 20 or newer. No dependencies or build step.

`PORT` defaults to 3000. `DATA_FILE` defaults to `data.json` in the app directory. Optional `SALE_OPENS_AT` is an ISO timestamp; by default the sale is open. Example in PowerShell:

```powershell
$env:PORT = '3000'
$env:DATA_FILE = 'C:\path\seatdrop-data.json'
$env:SALE_OPENS_AT = '2026-12-01T18:00:00Z'
npm start
```

Exactly 20 seats, A1 through D5. Each account can have one active order of up to two tickets at $85 each. EARLYBIRD gives 20 percent off one order across the entire sale. Cancelling frees seats but never restores the promo redemption. Sold seats refresh every five seconds.

This is a local demo purchase flow with no payment processing. Passwords are salted and hashed. Sessions are held in memory and expire after 24 hours or a server restart. Run one server process per JSON file; there is no multi-process database locking. Use HTTPS and operational hardening before public deployment.

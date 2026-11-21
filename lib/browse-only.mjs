// Browse-only mode for live public websites. Personas may load and read pages, follow links and use
// search, but nothing they do can change anything on the site. This is enforced on the network,
// not left to the model's instructions:
// - only GET, HEAD and OPTIONS requests leave the browser, so sign-ups, log-ins, purchases, posts
//   and other form submissions are blocked even if a persona tries them;
// - top-level navigation stays on the site that was entered (its subdomains included);
// - private and local network addresses are never contacted;
// - websockets are closed.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isPrivateAddress(address) {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (isIP(ip) === 6) {
    if (ip.startsWith("::ffff:")) return isPrivateAddress(ip.slice(7));
    return ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80");
  }
  return false;
}

export function isPrivateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || isPrivateAddress(host);
}

// The site's own host and its subdomains count as the same site; "www." is ignored.
export function sameSite(url, baseUrl) {
  const root = new URL(baseUrl).hostname.replace(/^www\./, "");
  const host = new URL(url).hostname;
  return host === root || host.endsWith(`.${root}`);
}

// Rejects public URLs that resolve to a private or local address before any browser opens.
export async function checkPublicUrl(raw) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an http or https address without a username or password.");
  if (isPrivateHost(url.hostname)) throw new Error("That address is on a local or private network. Use a public website address.");
  const addresses = isIP(url.hostname.replace(/^\[|\]$/g, "")) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error(`Could not find ${url.hostname}. Check the address.`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error("That address points to a local or private network. Use a public website address.");
  return url.href;
}

// Installs the browse-only rules on a browser context. Blocked requests are listed in record.blocked.
export async function installBrowseOnly(context, baseUrl, record, { allowPrivate = false } = {}) {
  record.blocked = [];
  const block = (request, reason) => {
    if (record.blocked.length < 200) record.blocked.push({ method: request.method(), url: request.url().slice(0, 300), reason });
  };
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["data:", "blob:"].includes(url.protocol)) return route.continue();
    if (!["http:", "https:"].includes(url.protocol)) { block(request, "unsupported address"); return route.abort("blockedbyclient"); }
    if (!allowPrivate && isPrivateHost(url.hostname)) { block(request, "private network address"); return route.abort("blockedbyclient"); }
    if (!READ_METHODS.has(request.method())) { block(request, "browse-only: changes are not sent"); return route.abort("blockedbyclient"); }
    const topLevel = request.isNavigationRequest() && !request.frame().parentFrame();
    if (topLevel && !sameSite(url.href, baseUrl)) { block(request, "outside the site being tested"); return route.abort("blockedbyclient"); }
    return route.continue();
  });
  if (typeof context.routeWebSocket === "function") await context.routeWebSocket(/.*/, (ws) => ws.close());
}

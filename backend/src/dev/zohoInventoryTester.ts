import { createServer } from "node:http";
import { config } from "dotenv";

config();

/**
 * Development aid: a throwaway local page for checking that a set of Zoho
 * credentials can read items from Zoho Inventory (instead of Zoho Invoice).
 *
 *   npx tsx src/dev/zohoInventoryTester.ts      → http://localhost:4545
 *
 * Any field left blank falls back to the matching .env value
 * (ZOHO_INVENTORY_* first, then the existing Zoho Invoice ones). Credentials
 * stay on this machine: the page posts them to this local server, which calls
 * Zoho and returns the result. Secrets are never echoed back or logged.
 */

const PORT = Number(process.env.ZOHO_INVENTORY_TESTER_PORT) || 4545;

const DATA_CENTERS = ["com", "eu", "in", "com.au", "jp", "ca", "sa", "com.cn"];

type TestInput = {
    dataCenter?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    redirectUri?: string;
    organizationId?: string;
    accessToken?: string;
    action?: "items" | "organizations";
};

const envDefaults = () => ({
    dataCenter: process.env.ZOHO_INVENTORY_DC || "com",
    clientId: process.env.ZOHO_INVENTORY_CLIENT_ID || process.env.CLIENT_ID || "",
    clientSecret: process.env.ZOHO_INVENTORY_CLIENT_SECRET || process.env.CLIENT_SECRET || "",
    refreshToken: process.env.ZOHO_INVENTORY_REFRESH_TOKEN || process.env.ZOHO_REFRESH_TOKEN || "",
    redirectUri: process.env.ZOHO_INVENTORY_REDIRECT_URI || process.env.REDIRECT_URI || "",
    organizationId: process.env.ZOHO_INVENTORY_ORGANIZATION_ID || process.env.ORGANIZATION_ID || "",
});

async function runTest(input: TestInput) {
    const env = envDefaults();
    const pick = (key: keyof ReturnType<typeof envDefaults>) => (input[key] || "").trim() || env[key];
    const dc = pick("dataCenter");
    if (!DATA_CENTERS.includes(dc)) return { ok: false, step: "input", error: `Unknown data center "${dc}"` };

    const steps: Record<string, unknown>[] = [];
    let accessToken = (input.accessToken || "").trim();

    if (!accessToken) {
        const params = new URLSearchParams({
            client_id: pick("clientId"),
            client_secret: pick("clientSecret"),
            refresh_token: pick("refreshToken"),
            grant_type: "refresh_token",
        });
        const redirectUri = pick("redirectUri");
        if (redirectUri) params.set("redirect_uri", redirectUri);

        const res = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token?${params}`, { method: "POST" });
        const data = await res.json();
        if (data.error || !data.access_token) {
            return { ok: false, step: "token", httpStatus: res.status, zoho: data };
        }
        accessToken = data.access_token;
        steps.push({ step: "token", ok: true, scope: data.scope, api_domain: data.api_domain, expires_in: data.expires_in });
    } else {
        steps.push({ step: "token", ok: true, note: "Used the access token you pasted" });
    }

    const orgId = pick("organizationId");
    const endpoint = input.action === "organizations"
        ? `https://www.zohoapis.${dc}/inventory/v1/organizations`
        : `https://www.zohoapis.${dc}/inventory/v1/items?organization_id=${encodeURIComponent(orgId)}&per_page=200`;

    const res = await fetch(endpoint, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } });
    const data = await res.json();
    const ok = res.ok && data.code === 0;

    if (input.action === "organizations") {
        steps.push({
            step: "organizations", ok, httpStatus: res.status, endpoint,
            ...(ok
                ? { organizations: (data.organizations ?? []).map((o: any) => ({ organization_id: o.organization_id, name: o.name })) }
                : { zoho: data }),
        });
    } else {
        const items = data.items ?? [];
        steps.push({
            step: "items", ok, httpStatus: res.status, endpoint,
            ...(ok
                ? {
                    count: items.length,
                    has_more_page: data.page_context?.has_more_page,
                    sample: items.slice(0, 5).map((i: any) => ({
                        item_id: i.item_id, name: i.name, sku: i.sku, rate: i.rate, unit: i.unit,
                        status: i.status, item_type: i.item_type, stock_on_hand: i.stock_on_hand,
                    })),
                }
                : { zoho: data }),
        });
    }

    return { ok, steps };
}

const field = (name: string, label: string, hint: string, type = "text") => `
  <label>${label}<small>${hint}</small>
    <input name="${name}" type="${type}" autocomplete="off" spellcheck="false" />
  </label>`;

function page() {
    const env = envDefaults();
    const fromEnv = (v: string) => (v ? "blank = use .env value" : "not set in .env");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zoho Inventory Tester</title>
<style>
  :root { --bg:#f7f7f5; --fg:#1d1d1b; --muted:#6b6b66; --card:#fff; --line:#ddd; --ok:#1f7a3a; --bad:#b3261e; }
  @media (prefers-color-scheme: dark) { :root { --bg:#161615; --fg:#ececea; --muted:#9a9a94; --card:#20201f; --line:#3a3a38; --ok:#5cc47c; --bad:#ff8a80; } }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.45 system-ui,sans-serif; }
  main { max-width:720px; margin:0 auto; padding:24px 16px; }
  form { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; display:grid; gap:12px; }
  label { display:grid; gap:4px; font-weight:600; }
  small { font-weight:400; color:var(--muted); }
  input, select { font:inherit; padding:8px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--fg); }
  .row { display:flex; gap:8px; flex-wrap:wrap; }
  button { font:inherit; padding:8px 14px; border-radius:6px; border:1px solid var(--line); background:var(--fg); color:var(--bg); cursor:pointer; }
  button.secondary { background:transparent; color:var(--fg); }
  pre { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; overflow:auto; white-space:pre-wrap; }
  .ok { color:var(--ok); } .bad { color:var(--bad); }
</style></head><body><main>
<h1>Zoho Inventory tester</h1>
<p>Calls <code>GET https://www.zohoapis.&lt;dc&gt;/inventory/v1/items?organization_id=…</code> through this local server. Nothing you type leaves this machine except to Zoho.</p>
<form id="f">
  <label>Data center<small>Domain suffix of your Zoho account</small>
    <select name="dataCenter">${DATA_CENTERS.map(d => `<option ${d === env.dataCenter ? "selected" : ""}>${d}</option>`).join("")}</select>
  </label>
  ${field("clientId", "Client ID", fromEnv(env.clientId), "password")}
  ${field("clientSecret", "Client secret", fromEnv(env.clientSecret), "password")}
  ${field("refreshToken", "Refresh token", fromEnv(env.refreshToken) + " · needs a ZohoInventory.items.READ scope", "password")}
  ${field("redirectUri", "Redirect URI", fromEnv(env.redirectUri) + " · optional for refresh")}
  ${field("organizationId", "Organization ID", fromEnv(env.organizationId))}
  ${field("accessToken", "Access token (optional)", "Paste one to skip the refresh step", "password")}
  <div class="row">
    <button name="action" value="items">Fetch items</button>
    <button name="action" value="organizations" class="secondary">List organizations</button>
  </div>
</form>
<h2 id="status"></h2>
<pre id="out">Results appear here.</pre>
<script>
  const f = document.getElementById("f"), out = document.getElementById("out"), status = document.getElementById("status");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f));
    body.action = e.submitter?.value || "items";
    status.textContent = "Running…"; status.className = ""; out.textContent = "";
    try {
      const res = await fetch("/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      status.textContent = data.ok ? "It works" : "Failed" + (data.step ? " at: " + data.step : "");
      status.className = data.ok ? "ok" : "bad";
      out.textContent = JSON.stringify(data, null, 2);
    } catch (err) { status.textContent = "Request failed"; status.className = "bad"; out.textContent = String(err); }
  });
</script>
</main></body></html>`;
}

createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(page());
    }
    if (req.method === "POST" && req.url === "/test") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        let result;
        try {
            result = await runTest(JSON.parse(raw || "{}"));
        } catch (error) {
            result = { ok: false, step: "request", error: error instanceof Error ? error.message : String(error) };
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(result));
    }
    res.writeHead(404).end();
}).listen(PORT, "127.0.0.1", () => {
    console.log(`Zoho Inventory tester → http://localhost:${PORT}`);
});

// Small helpers shared by the deploy and sandbox scripts.
// No SDK on purpose: the raw HTTP calls are exactly what docs/INTEGRATION.md
// describes, which keeps the scripts easy to read against the docs.

const fs = require("fs");
const path = require("path");

const API = "https://api.sendgrid.com/v3";

// Minimal .env reader (KEY=value lines). Real environment variables win, so
// CI or a secrets manager can override the file.
function loadEnv(file = path.join(__dirname, "..", "..", ".env")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Missing in .env: ${missing.join(", ")}`);
    process.exit(1);
  }
}

async function api(method, route, body, apiKey = process.env.SENDGRID_API_KEY) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, messageId: res.headers.get("x-message-id") };
}

async function findDynamicTemplate(name) {
  const { status, data } = await api("GET", "/templates?generations=dynamic&page_size=200");
  if (status !== 200) throw new Error(`List templates failed: ${status} ${JSON.stringify(data)}`);
  return (data.result || []).find((t) => t.name === name);
}

async function findAsmGroup(name) {
  const { status, data } = await api("GET", "/asm/groups");
  if (status !== 200) throw new Error(`List unsubscribe groups failed: ${status} ${JSON.stringify(data)}`);
  return (data || []).find((g) => g.name === name);
}

module.exports = { loadEnv, requireEnv, api, findDynamicTemplate, findAsmGroup };

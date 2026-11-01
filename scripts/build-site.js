// Builds the live preview site into site-dist/ (what Vercel serves).
// Copies site/ and bundles the built templates, their subjects and the
// fixtures into one data.json, so the site always shows exactly what
// `npm run build` produced for this commit.

const fs = require("fs");
const path = require("path");
const templates = require("../src/templates.config.json");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "site-dist");

// Short labels for the template picker.
const SHORT = { t1_welcome: "Welcome", t2_account_type: "Account type", t3_industry: "Industry" };

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, "site"), OUT, { recursive: true });

const fixtures = {};
for (const f of fs.readdirSync(path.join(ROOT, "fixtures")).filter((x) => x.endsWith(".json")).sort()) {
  fixtures[path.basename(f, ".json")] = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", f), "utf8"));
}

const data = {
  templates: templates.map((t) => ({
    key: t.key,
    name: t.name,
    short: SHORT[t.key] || t.name,
    sequence_step: t.sequence_step,
    send_after_days: t.send_after_days,
    subject: t.subject,
    html: fs.readFileSync(path.join(ROOT, "templates", t.file), "utf8"),
  })),
  fixtures,
};

fs.writeFileSync(path.join(OUT, "data.json"), JSON.stringify(data));
console.log(`built site-dist/ (${data.templates.length} templates, ${Object.keys(fixtures).length} fixtures)`);

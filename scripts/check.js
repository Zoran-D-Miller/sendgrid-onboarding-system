// Automated QA: fails (exit 1) if any template or rendered preview breaks a rule.
// Run with `npm test` (build + render + this script). CI runs the same command.
//
// Each rule here exists because the mistake is easy to make and expensive to
// ship: a missing unsubscribe link, a Handlebars tag that never rendered, a
// segment that shows two blocks, an email Gmail will clip.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (dir) =>
  fs.readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith(".html"))
    .map((f) => ({ name: f, html: fs.readFileSync(path.join(ROOT, dir, f), "utf8") }));

// Gmail clips messages over ~102KB and hides the rest, footer and unsubscribe included.
const GMAIL_CLIP_BYTES = 102 * 1024;

// What each fixture must produce. If a branch or fallback breaks, this fails.
const EXPECT = {
  "enterprise-finance": { greeting: "Hi Dana,", t2: "For enterprise teams", t3: "Financial services" },
  "startup-retail": { greeting: "Hi Sam,", t2: "For startups", t3: "Retail and ecommerce" },
  "edge-missing-and-unsafe": { greeting: "Hi there,", t2: "Your next steps</p>", t3: "Customer stories</p>" },
};

let failures = 0;
function check(label, ok, detail = "") {
  if (ok) {
    console.log(`PASS  ${label}`);
  } else {
    failures++;
    console.log(`FAIL  ${label}${detail ? `  (${detail})` : ""}`);
  }
}

// ---------- Source templates (what gets pasted into SendGrid) ----------
for (const { name, html } of read("templates")) {
  check(`${name}: group unsubscribe link`, html.includes('href="<%asm_group_unsubscribe_raw_url%>"'));
  check(`${name}: preferences link`, html.includes('href="<%asm_preferences_raw_url%>"'));
  check(`${name}: <html lang>`, /<html[^>]+lang="en"/.test(html));
  check(`${name}: preheader present`, html.includes("PREHEADER"));
  check(`${name}: no unresolved partials`, !/\{\{>/.test(html));

  // SendGrid parses Handlebars inside HTML comments too; a stray tag there breaks the render.
  const commentsWithTags = (html.match(/<!--[\s\S]*?-->/g) || []).filter((c) => c.includes("{{"));
  check(`${name}: no Handlebars inside HTML comments`, commentsWithTags.length === 0, `${commentsWithTags.length} found`);

  const tables = html.match(/<table\b[^>]*>/g) || [];
  const layoutTablesMissingRole = tables.filter((t) => !t.includes('role="presentation"'));
  check(`${name}: every table has role="presentation"`, layoutTablesMissingRole.length === 0, `${layoutTablesMissingRole.length} missing`);

  const imgs = html.match(/<img\b[^>]*>/g) || [];
  check(`${name}: every image has alt text`, imgs.every((i) => /alt="[^"]+"/.test(i)));

  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !h.startsWith("<%"));
  // The <link> to Google Fonts is a stylesheet, not a tracked link.
  const links = hrefs.filter((h) => !h.includes("fonts.googleapis.com"));
  check(`${name}: all links use https`, links.every((h) => h.startsWith("https://")));

  const ownLinks = links.filter((h) => /impact\.com/.test(h) && !/linkedin|x\.com|youtube/.test(h));
  const untagged = ownLinks.filter((h) => !h.includes("utm_source=sendgrid"));
  check(`${name}: impact.com links carry UTM tags`, untagged.length === 0, untagged.join(", "));
}

// ---------- Rendered previews (template x fixture) ----------
for (const { name, html } of read("previews")) {
  const [template, fixture] = name.replace(".html", "").split("--");
  const expect = EXPECT[fixture];

  check(`${name}: no unrendered Handlebars`, !/\{\{|\}\}/.test(html));
  check(`${name}: under Gmail clip size`, Buffer.byteLength(html) < GMAIL_CLIP_BYTES, `${Buffer.byteLength(html)} bytes`);

  if (!expect) {
    check(`${name}: fixture has expectations in check.js`, false, "add it to EXPECT");
    continue;
  }
  check(`${name}: greeting "${expect.greeting}"`, html.includes(expect.greeting));

  if (template.startsWith("t2")) {
    check(`${name}: shows the right account_type block`, html.includes(expect.t2));
    check(`${name}: exactly one segment block`, (html.match(/---------- SEGMENT:/g) || []).length === 1);
  }
  if (template.startsWith("t3")) {
    check(`${name}: shows the right industry block`, html.includes(expect.t3));
    check(`${name}: exactly one industry block`, (html.match(/---------- INDUSTRY:/g) || []).length === 1);
  }
  if (fixture === "edge-missing-and-unsafe") {
    check(`${name}: company_name is HTML-escaped`, html.includes("Smith &amp; Sons &lt;b&gt;Ltd&lt;/b&gt;") && !html.includes("<b>Ltd</b>"));
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);

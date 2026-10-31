// Checks the payload-to-SendGrid mapping and the subject lines.
// Run by `npm test` and CI. Exit 1 on any failure.

const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const Handlebars = require("./lib/handlebars");
const { buildMailSendBody, idempotencyKey, ValidationError } = require("../src/service/build-mail");

const ROOT = path.join(__dirname, "..");
const templates = require("../src/templates.config.json");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", `${name}.json`), "utf8"));
const byKey = Object.fromEntries(templates.map((t) => [t.key, t]));
const settings = { templateId: "d-test", asmGroupId: "123", fromEmail: "sender@example.com", sandbox: true };

// What SendGrid actually receives: undefined keys are dropped by JSON.
const build = (signup, key) => JSON.parse(JSON.stringify(buildMailSendBody(signup, byKey[key], settings)));

let failures = 0;
function test(label, fn) {
  try {
    fn();
    console.log(`PASS  ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${label}  (${err.message.split("\n")[0]})`);
  }
}

const base = fixture("enterprise-finance");

// ---------- Mapping ----------
test("every config entry points at a built template", () => {
  for (const t of templates) assert.ok(fs.existsSync(path.join(ROOT, "templates", t.file)), t.file);
});

test('account_type " Enterprise " is normalised to "enterprise"', () => {
  const body = build({ ...base, account_type: " Enterprise " }, "t2_account_type");
  assert.equal(body.personalizations[0].dynamic_template_data.account_type, "enterprise");
  assert.equal(body.personalizations[0].custom_args.account_type, "enterprise");
});

test('industry "RETAIL" is normalised to "retail"', () => {
  const body = build({ ...base, industry: "RETAIL" }, "t3_industry");
  assert.equal(body.personalizations[0].dynamic_template_data.industry, "retail");
});

test("blank first_name is dropped so the template falls back to 'there'", () => {
  const p = build({ ...base, first_name: "   " }, "t1_welcome").personalizations[0];
  assert.ok(!("first_name" in p.dynamic_template_data));
  assert.ok(!("name" in p.to[0]));
});

test('missing account_type/industry tracked as "unknown"', () => {
  const { account_type, industry, ...rest } = base;
  const args = build(rest, "t2_account_type").personalizations[0].custom_args;
  assert.equal(args.account_type, "unknown");
  assert.equal(args.industry, "unknown");
});

for (const [label, change] of [
  ["missing email", { email: undefined }],
  ["invalid email", { email: "not-an-email" }],
  ["missing user_id", { user_id: "" }],
  ["bad signup_date", { signup_date: "yesterday" }],
]) {
  test(`rejects ${label} before calling SendGrid`, () => {
    assert.throws(() => build({ ...base, ...change }, "t1_welcome"), ValidationError);
  });
}

test("asm.group_id is top level, not inside personalizations", () => {
  const body = build(base, "t1_welcome");
  assert.equal(body.asm.group_id, 123);
  assert.ok(!("asm" in body.personalizations[0]));
});

test("custom_args are strings and contain no personal data", () => {
  const args = build(base, "t2_account_type").personalizations[0].custom_args;
  for (const v of Object.values(args)) assert.equal(typeof v, "string");
  const json = JSON.stringify(args);
  for (const pii of [base.email, base.first_name, base.company_name]) assert.ok(!json.includes(pii), `contains ${pii}`);
});

test("custom_args under 10,000 bytes; categories within SendGrid limits", () => {
  const body = build(base, "t3_industry");
  assert.ok(Buffer.byteLength(JSON.stringify(body.personalizations[0].custom_args)) < 10000);
  assert.ok(body.categories.length <= 10);
  for (const c of body.categories) assert.ok(c.length <= 255);
});

test("dynamic_template_data holds no email or user_id", () => {
  const data = build(base, "t1_welcome").personalizations[0].dynamic_template_data;
  assert.ok(!("email" in data) && !("user_id" in data));
});

test("idempotency key is user_id:template_key", () => {
  assert.equal(idempotencyKey(base, byKey.t2_account_type), "usr_10482:t2_account_type");
});

// ---------- Subject lines ----------
const SUBJECTS = {
  "enterprise-finance": {
    t1_welcome: "Welcome to impact.com, Zoran",
    t2_account_type: "Set up impact.com for your whole team",
    t3_industry: "How a digital bank grew with compliant partners",
  },
  "startup-retail": {
    t1_welcome: "Welcome to impact.com, Sam",
    t2_account_type: "Launch your partner program this week",
    t3_industry: "Pay partners more for new customers",
  },
  "edge-missing-and-unsafe": {
    t1_welcome: "Welcome to impact.com",
    t2_account_type: "Your next steps on impact.com",
    t3_industry: "How brands like yours grow with partners",
  },
};

for (const [name, expected] of Object.entries(SUBJECTS)) {
  for (const t of templates) {
    test(`subject ${t.key} x ${name}`, () => {
      const data = build(fixture(name), t.key).personalizations[0].dynamic_template_data;
      assert.equal(Handlebars.compile(t.subject)(data), expected[t.key]);
    });
  }
}

console.log(failures ? `\n${failures} mapping check(s) failed` : "\nAll mapping checks passed");
process.exit(failures ? 1 : 0);

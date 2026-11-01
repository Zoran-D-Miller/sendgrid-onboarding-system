// Live preview: renders the built templates (templates/*.html, copied into
// data.json by scripts/build-site.js) with handlebars.js in the browser.
//
// Two pieces mirror code elsewhere in the repo and must stay in step with it:
//  - the equals/notEquals helpers  -> scripts/lib/handlebars.js
//  - clean/normalise + custom_args -> src/service/build-mail.js

Handlebars.registerHelper("equals", function (a, b, options) {
  // eslint-disable-next-line eqeqeq
  return a == b ? options.fn(this) : options.inverse(this);
});
Handlebars.registerHelper("notEquals", function (a, b, options) {
  // eslint-disable-next-line eqeqeq
  return a != b ? options.fn(this) : options.inverse(this);
});

const clean = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
const normalise = (v) => clean(v) && clean(v).toLowerCase();

const PRESET_LABELS = {
  "enterprise-finance": "Enterprise, finance",
  "startup-retail": "Startup, retail",
  "edge-missing-and-unsafe": "Edge case",
};
const FIELDS = ["template", "account_type", "industry", "first_name", "company_name", "width", "theme"];

const form = document.getElementById("controls");
const frame = document.getElementById("email");
let data;
let shownTemplate;
let keepScroll = 0;
const compiled = {};

function readState() {
  const f = new FormData(form);
  return Object.fromEntries(FIELDS.map((k) => [k, f.get(k) ?? ""]));
}

// form.elements includes controls outside the <form> that use form="controls"
// (the width toggle). Radios are checked one by one because setting .value on
// a radio group doesn't select the Missing radio, whose value is "".
function writeState(state) {
  for (const [k, v] of Object.entries(state)) {
    const el = form.elements.namedItem(k);
    if (el instanceof RadioNodeList) {
      for (const radio of el) radio.checked = radio.value === v;
    } else if (el) {
      el.value = v;
    }
  }
}

function presetState(name) {
  const p = data.fixtures[name];
  return { account_type: p.account_type ?? "", industry: p.industry ?? "", first_name: p.first_name ?? "", company_name: p.company_name ?? "" };
}

function segmentLabel(field, value, known) {
  if (known.includes(value)) return `Showing the ${value} block`;
  // Same email either way, but custom_args differ: a value with no block yet
  // is a segment to consider, a missing value is a gap in the webhook data.
  return value ? `Default block: no ${value} version yet, reported as "${value}"` : `Default block: ${field} is missing, reported as "unknown"`;
}

function branchLabel(key, d) {
  if (key === "t2_account_type") return segmentLabel("account type", d.account_type, ["enterprise", "startup"]);
  if (key === "t3_industry") return segmentLabel("industry", d.industry, ["finance", "retail"]);
  return "Same email for every segment";
}

// The email's dark styles sit behind prefers-color-scheme, which follows the
// viewer's OS and can't be set from JavaScript. For this preview only, switch
// that media query on or off so both versions can be seen on any machine.
// The template itself is untouched: real emails follow the reader's setting.
function withTheme(html, theme) {
  return html
    .replace("@media (prefers-color-scheme: dark)", theme === "dark" ? "@media all" : "@media not all")
    .replaceAll('content="light dark"', `content="${theme}"`);
}

function render() {
  const state = readState();
  const t = data.templates.find((x) => x.key === state.template);
  const d = {
    first_name: clean(state.first_name),
    company_name: clean(state.company_name),
    account_type: normalise(state.account_type),
    industry: normalise(state.industry),
  };

  const html = compiled[t.key].html(d);
  document.getElementById("subject").textContent = compiled[t.key].subject(d);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const pre = doc.querySelector("body > div");
  document.getElementById("preheader").textContent = pre ? pre.textContent.replace(/[‌ ]/g, " ").replace(/\s+/g, " ").trim() : "";
  document.getElementById("branch").textContent = branchLabel(t.key, d);

  document.getElementById("json").textContent = JSON.stringify(
    {
      template_id: `<${t.name}>`,
      dynamic_template_data: d,
      custom_args: {
        user_id: "usr_10482",
        template_key: t.key,
        sequence_step: String(t.sequence_step),
        account_type: d.account_type || "unknown",
        industry: d.industry || "unknown",
      },
      asm: { group_id: "<Onboarding group>" },
    },
    null,
    2
  );

  // Keep the reader's place while they change data; a new email starts at the top.
  keepScroll = t.key === shownTemplate ? frame.contentWindow.scrollY : 0;
  shownTemplate = t.key;

  frame.style.width = `${state.width}px`;
  frame.srcdoc = withTheme(html, state.theme);

  // Blanks stay in the URL, otherwise a reload swaps Missing for the sample signup.
  history.replaceState(null, "", `?${new URLSearchParams(state)}`);
}

// Side-by-side layout: the email scrolls inside the frame (height set in CSS).
// Stacked layout: size the frame to the email so the page does the scrolling.
frame.addEventListener("load", () => {
  const stacked = matchMedia("(max-width: 960px)").matches;
  frame.style.height = stacked ? `${frame.contentDocument.documentElement.scrollHeight}px` : "";
  frame.contentWindow.scrollTo(0, keepScroll);
});

async function init() {
  data = await (await fetch("data.json")).json();
  for (const t of data.templates) compiled[t.key] = { html: Handlebars.compile(t.html), subject: Handlebars.compile(t.subject) };

  document.getElementById("template-pills").innerHTML = data.templates
    .map((t) => `<label><input type="radio" name="template" value="${t.key}"><span>${t.sequence_step}. ${t.short} <small>day ${t.send_after_days}</small></span></label>`)
    .join("");

  const presets = document.getElementById("presets");
  presets.innerHTML = Object.keys(data.fixtures)
    .map((name) => `<button type="button" data-preset="${name}">${PRESET_LABELS[name] || name}</button>`)
    .join("");
  presets.addEventListener("click", (e) => {
    const name = e.target.closest("[data-preset]")?.dataset.preset;
    if (name) {
      writeState(presetState(name));
      render();
    }
  });

  const fromUrl = Object.fromEntries(new URLSearchParams(location.search));
  writeState({ template: "t2_account_type", width: "640", theme: "light", ...presetState("enterprise-finance"), ...fromUrl });
  // Listen on the document: the width toggle sits outside the <form> element.
  document.addEventListener("input", (e) => {
    if (e.target.form === form) render();
  });
  render();
  requestAnimationFrame(() => document.body.classList.add("ready"));
}

init().catch((err) => {
  document.getElementById("subject").textContent = "The preview could not load.";
  console.error(err);
});

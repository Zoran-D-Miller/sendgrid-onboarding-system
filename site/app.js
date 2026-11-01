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
const FIELDS = ["template", "account_type", "industry", "first_name", "company_name", "width"];

const form = document.getElementById("controls");
const frame = document.getElementById("email");
let data;
const compiled = {};

function readState() {
  const f = new FormData(form);
  return Object.fromEntries(FIELDS.map((k) => [k, f.get(k) ?? ""]));
}

// form.elements includes controls outside the <form> that use form="controls"
// (the width toggle). Setting .value on a radio group checks the matching radio.
function writeState(state) {
  for (const [k, v] of Object.entries(state)) {
    const el = form.elements.namedItem(k);
    if (el) el.value = v;
  }
}

function presetState(name) {
  const p = data.fixtures[name];
  return { account_type: p.account_type ?? "", industry: p.industry ?? "", first_name: p.first_name ?? "", company_name: p.company_name ?? "" };
}

function branchLabel(key, d) {
  if (key === "t2_account_type") return ["enterprise", "startup"].includes(d.account_type) ? `Showing the ${d.account_type} block` : "Showing the default block (account type not recognised)";
  if (key === "t3_industry") return ["finance", "retail"].includes(d.industry) ? `Showing the ${d.industry} block` : "Showing the default block (industry not recognised)";
  return "Same email for every segment";
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

  frame.style.width = `${state.width}px`;
  frame.srcdoc = html;

  const params = new URLSearchParams(Object.entries(state).filter(([, v]) => v !== ""));
  history.replaceState(null, "", `?${params}`);
}

// Size the frame to the email so the page scrolls, not the frame.
frame.addEventListener("load", () => {
  const doc = frame.contentDocument;
  if (doc) frame.style.height = `${doc.documentElement.scrollHeight}px`;
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
  writeState({ template: "t2_account_type", width: "600", ...presetState("enterprise-finance"), ...fromUrl });
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

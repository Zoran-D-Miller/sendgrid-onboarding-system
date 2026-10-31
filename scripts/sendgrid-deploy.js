// Publishes the built templates from git to SendGrid.
//
// For each entry in src/templates.config.json: find or create the dynamic
// template by name, then add a new ACTIVE version whose name is the git
// commit it came from. SendGrid's version history then maps one-to-one to
// git history, and nobody edits templates by hand in the SendGrid UI.
// Also makes sure the "Onboarding" unsubscribe group exists.
//
// Usage: npm run deploy   (builds first)

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { loadEnv, requireEnv, api, findDynamicTemplate, findAsmGroup } = require("./lib/sendgrid");
const templates = require("../src/templates.config.json");

const ROOT = path.join(__dirname, "..");
const ASM_GROUP_NAME = "Onboarding";

function gitVersionName() {
  const sha = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  const dirty = execSync("git status --porcelain -- src templates", { cwd: ROOT }).toString().trim();
  // A "-dirty" version means it was deployed from uncommitted changes:
  // visible in SendGrid, so it can't be mistaken for a reviewed release.
  return `git-${sha}${dirty ? "-dirty" : ""}`;
}

async function ensureAsmGroup() {
  const existing = await findAsmGroup(ASM_GROUP_NAME);
  if (existing) return existing.id;
  const { status, data } = await api("POST", "/asm/groups", {
    name: ASM_GROUP_NAME,
    description: "Account setup emails sent in the first week after signup",
    is_default: false,
  });
  if (status !== 201) throw new Error(`Create unsubscribe group failed: ${status} ${JSON.stringify(data)}`);
  return data.id;
}

async function ensureTemplate(name) {
  const existing = await findDynamicTemplate(name);
  if (existing) return existing.id;
  const { status, data } = await api("POST", "/templates", { name, generation: "dynamic" });
  if (status !== 201) throw new Error(`Create template "${name}" failed: ${status} ${JSON.stringify(data)}`);
  return data.id;
}

async function main() {
  loadEnv();
  requireEnv("SENDGRID_API_KEY");
  const versionName = gitVersionName();

  const groupId = await ensureAsmGroup();
  console.log(`Unsubscribe group "${ASM_GROUP_NAME}": ${groupId}`);

  for (const t of templates) {
    const html = fs.readFileSync(path.join(ROOT, "templates", t.file), "utf8");
    const templateId = await ensureTemplate(t.name);
    const { status, data } = await api("POST", `/templates/${templateId}/versions`, {
      name: versionName,
      subject: t.subject,
      html_content: html,
      generate_plain_content: true, // SendGrid builds the text/plain part from the HTML
      editor: "code",
      active: 1,
    });
    if (status !== 201) throw new Error(`Create version for ${t.key} failed: ${status} ${JSON.stringify(data)}`);
    console.log(`${t.key}: template ${templateId}, active version ${data.id} (${versionName})`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

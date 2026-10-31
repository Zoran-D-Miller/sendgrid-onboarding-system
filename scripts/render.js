// Local preview: render every built template against every fixture.
//
// SendGrid renders templates server-side, so without a verified sending
// domain we cannot see real output. This script uses handlebars.js to
// produce the same HTML locally: templates/*.html x fixtures/*.json ->
// previews/<template>--<fixture>.html.
//
// SendGrid's equals/notEquals helpers are shimmed in scripts/lib/handlebars.js.

const fs = require("fs");
const path = require("path");
const Handlebars = require("./lib/handlebars");

const ROOT = path.join(__dirname, "..");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const FIXTURES_DIR = path.join(ROOT, "fixtures");
const OUT_DIR = path.join(ROOT, "previews");

const list = (dir, ext) => fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort();

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const templateFile of list(TEMPLATES_DIR, ".html")) {
  const source = fs.readFileSync(path.join(TEMPLATES_DIR, templateFile), "utf8");
  // Compiling here also catches syntax errors (unclosed blocks, empty tags)
  // before the template ever reaches SendGrid.
  const template = Handlebars.compile(source);

  for (const fixtureFile of list(FIXTURES_DIR, ".json")) {
    const data = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, fixtureFile), "utf8"));
    const outName = `${path.basename(templateFile, ".html")}--${path.basename(fixtureFile, ".json")}.html`;
    fs.writeFileSync(path.join(OUT_DIR, outName), template(data));
    console.log(`rendered previews/${outName}`);
  }
}

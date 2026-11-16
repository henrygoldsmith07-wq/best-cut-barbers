// Zero-dependency static checks for the Best Cut Barbers site.
// Run with: node verify.mjs
// No packages, no network, no browser. Exits non-zero on any failure.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const failures = [];
let checks = 0;

function check(name, ok, detail = "") {
  checks++;
  if (!ok) failures.push(`${name}${detail ? " — " + detail : ""}`);
}
const read = (f) => readFileSync(join(root, f), "utf8");
const files = readdirSync(root);

const html = read("index.html");

// One h1, unique IDs.
const h1 = (html.match(/<h1\b/gi) || []).length;
check("single h1", h1 === 1, `found ${h1}`);
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
check("unique IDs", dupes.length === 0, dupes.join(", "));

// In-page fragment links point at an existing element. A bare "#" is the top of the page.
const fragments = [...html.matchAll(/href="#([^"]*)"/g)]
  .map((m) => m[1])
  .filter(Boolean);
const brokenFragments = [...new Set(fragments.filter((f) => !ids.includes(f)))];
check("in-page anchors resolve", brokenFragments.length === 0, brokenFragments.join(", "));

// The skip link's target must be able to receive focus.
const skipTarget = html.match(/class="skip"[^>]*href="#([^"]+)"/)?.[1];
const skipFocusable = skipTarget
  ? new RegExp(`<[^>]*\\sid="${skipTarget}"[^>]*\\stabindex="-1"|<[^>]*\\stabindex="-1"[^>]*\\sid="${skipTarget}"`).test(html)
  : false;
check("skip link target is focusable", skipFocusable, skipTarget || "no skip link found");

// Local src/href references resolve.
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(?:https?:|#|tel:|mailto:|data:)/i.test(u));
const missingRefs = [...new Set(refs.filter((u) => !existsSync(join(root, u))))];
check("local HTML references exist", missingRefs.length === 0, missingRefs.join(", "));

// Stylesheets referenced by the page.
const sheetRefs = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]);
check("stylesheets referenced", sheetRefs.length > 0);
const loadedCss = sheetRefs.filter((f) => existsSync(join(root, f))).map((f) => read(f)).join("\n");

// Every CSS asset URL resolves, and braces are balanced in every stylesheet.
const cssFiles = files.filter((f) => f.endsWith(".css"));
const missingUrls = [];
const unbalanced = [];
for (const f of cssFiles) {
  const css = read(f);
  for (const m of css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
    const u = m[2];
    if (/^(?:data:|https?:)/i.test(u)) continue;
    if (!existsSync(join(root, u))) missingUrls.push(`${f} -> ${u}`);
  }
  const open = (css.match(/{/g) || []).length;
  const close = (css.match(/}/g) || []).length;
  if (open !== close) unbalanced.push(`${f} (${open}/${close})`);
}
check("CSS asset URLs exist", missingUrls.length === 0, missingUrls.join(", "));
check("CSS braces balanced", unbalanced.length === 0, unbalanced.join(", "));

// Classes used in the markup have a rule in a loaded stylesheet.
const classes = [...new Set([...html.matchAll(/class="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/)).filter(Boolean))];
const unstyled = classes.filter((c) => {
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !new RegExp(`\\.${esc}(?![\\w-])`).test(loadedCss);
});
check("HTML classes are styled", unstyled.length === 0, unstyled.join(", "));

// Structured data parses.
const blocks = [...html.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
check("structured data present", blocks.length > 0);
const badJson = [];
blocks.forEach((b, i) => {
  try { JSON.parse(b); } catch (e) { badJson.push(`block ${i + 1}: ${e.message}`); }
});
check("JSON-LD parses", badJson.length === 0, badJson.join("; "));

// Strict script policy.
check("strict script policy", /script-src 'self'/.test(html) && /form-action 'none'/.test(html));

// External security hygiene: new tabs must not expose window.opener, and no insecure URLs.
const blankLinks = [...html.matchAll(/<a\b[^>]*\btarget="_blank"[^>]*>/gi)].map((m) => m[0]);
const unsafeBlank = blankLinks.filter((tag) => !/\brel="[^"]*\bnoopener\b[^"]*"/i.test(tag));
check("new-tab links use rel=noopener", unsafeBlank.length === 0, `${unsafeBlank.length} of ${blankLinks.length}`);
const insecure = [...html.matchAll(/(?:href|src)="(http:\/\/[^"]*)"/gi)].map((m) => m[1]);
check("no insecure URLs", insecure.length === 0, insecure.join(", "));

// JavaScript syntax.
const jsFiles = files.filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));
const badJs = [];
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ["--check", join(root, f)], { encoding: "utf8" });
  if (r.status !== 0) badJs.push(`${f}: ${(r.stderr || "").trim().split("\n")[0]}`);
}
check("JavaScript syntax", badJs.length === 0, badJs.join("; "));

if (failures.length) {
  console.error(`FAILED ${failures.length} of ${checks} checks:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(`OK — ${checks} static checks passed.`);
}

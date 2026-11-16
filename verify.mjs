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

// GitHub Pages serves on a case-sensitive filesystem. A path that resolves on
// Windows but differs in case would 404 once published, so compare each segment.
function existsExact(rel) {
  let dir = root;
  for (const seg of rel.replace(/\\/g, "/").split("/")) {
    if (!seg || seg === ".") continue;
    let names;
    try { names = readdirSync(dir); } catch { return false; }
    if (!names.includes(seg)) return false;
    dir = join(dir, seg);
  }
  return true;
}

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

// ARIA ID references must point at real elements.
const badAria = [];
for (const attr of ["aria-labelledby", "aria-controls", "aria-describedby", "aria-owns"]) {
  for (const m of html.matchAll(new RegExp(`${attr}="([^"]+)"`, "g"))) {
    for (const id of m[1].split(/\s+/).filter(Boolean)) {
      if (!ids.includes(id)) badAria.push(`${attr} -> ${id}`);
    }
  }
}
check("ARIA ID references resolve", badAria.length === 0, badAria.join(", "));

// Static label targets must point at an element on the page.
const brokenLabels = [];
for (const m of html.matchAll(/\bfor="([^"]+)"/gi)) {
  for (const token of m[1].split(/\s+/)) {
    if (token && !ids.includes(token)) brokenLabels.push(`for="${token}"`);
  }
}
check("label targets resolve", brokenLabels.length === 0, brokenLabels.join(", "));

// Every visible form control needs a label or an accessible name.
const labelled = new Set([...html.matchAll(/<label\s+for="([^"]+)"/g)].map((m) => m[1]));
const unlabelled = [];
for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
  const attrs = m[2];
  if (/\btype="hidden"/i.test(attrs)) continue;
  const id = attrs.match(/\sid="([^"]+)"/)?.[1];
  if (!(id && labelled.has(id)) && !/\baria-label=|\baria-labelledby=/.test(attrs)) {
    unlabelled.push(m[1] + (id ? `#${id}` : ""));
  }
}
check("form controls are labelled", unlabelled.length === 0, unlabelled.join(", "));

// Local src/href references resolve.
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(?:https?:|#|tel:|mailto:|data:)/i.test(u));
const missingRefs = [...new Set(refs.filter((u) => !existsSync(join(root, u))))];
check("local HTML references exist", missingRefs.length === 0, missingRefs.join(", "));
const caseMismatch = [...new Set(refs.filter((u) => existsSync(join(root, u)) && !existsExact(u)))];
check("asset paths match exact case", caseMismatch.length === 0, caseMismatch.join(", "));

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

// Web app manifest parses and its local icons exist.
let manifest = null;
try { manifest = JSON.parse(read("site.webmanifest")); } catch { /* reported below */ }
check("webmanifest parses", !!manifest);
const mfIcons = (manifest?.icons || []).map((i) => i.src).filter((u) => u && !/^(?:https?:|data:)/i.test(u));
const mfMissing = mfIcons.filter((u) => !existsSync(join(root, u)));
check("webmanifest icons exist", mfMissing.length === 0, mfMissing.join(", "));

// Click-to-call numbers must agree with the telephone in structured data.
const digits = (s) => (s.match(/\d/g) || []).join("");
const ldPhones = new Set(blocks.flatMap((b) => {
  try { const j = JSON.parse(b); return j.telephone ? [digits(j.telephone)] : []; }
  catch { return []; }
}));
const telLinks = [...new Set([...html.matchAll(/href="tel:([^"]+)"/g)].map((m) => m[1]))];
const phoneMismatch = telLinks.filter((t) => ldPhones.size && !ldPhones.has(digits(t)));
check("tel links match structured data", phoneMismatch.length === 0, phoneMismatch.join(", "));

// Strict script policy, and the meta CSP must appear before anything it governs.
check("strict script policy", /script-src 'self'/.test(html) && /form-action 'none'/.test(html));
const cspAt = html.search(/<meta\s+http-equiv="Content-Security-Policy"/i);
const firstScriptAt = html.search(/<script\b/i);
check("CSP meta precedes scripts", cspAt !== -1 && firstScriptAt !== -1 && cspAt < firstScriptAt);
check("hardened CSP", /default-src 'self'/.test(html) && /base-uri 'none'/.test(html) && /object-src 'none'/.test(html));

// No DOM XSS or code-execution sinks in the shipped runtime files.
const sinkPattern = /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML\s*\(|document\.write(?:ln)?\s*\(|\beval\s*\(|new Function\s*\(|javascript:|postMessage\s*\(|localStorage|sessionStorage|\blocation\.(?:href|assign|replace)\s*=|\son(?:click|load|error|mouseover)\s*=/i;
const sinkHits = [];
for (const f of files.filter((name) => name.endsWith(".js"))) {
  if (sinkPattern.test(read(f))) sinkHits.push(f);
}
if (/<script\b[^>]+src="https?:\/\//i.test(html)) sinkHits.push("index.html:remote script");
if (/\son(?:click|load|error|mouseover)\s*=/i.test(html)) sinkHits.push("index.html:inline handler");
check("no dangerous DOM sinks", sinkHits.length === 0, sinkHits.join(", "));

// External security hygiene: new tabs must not expose window.opener or a referrer, and no insecure URLs.
const blankLinks = [...html.matchAll(/<a\b[^>]*\btarget="_blank"[^>]*>/gi)].map((m) => m[0]);
const unsafeBlank = blankLinks.filter((tag) => !/\bnoopener\b/i.test(tag) || !/\bnoreferrer\b/i.test(tag));
check("new-tab links use rel=noopener noreferrer", unsafeBlank.length === 0, `${unsafeBlank.length} of ${blankLinks.length}`);
const insecure = [...html.matchAll(/(?:href|src)="(http:\/\/[^"]*)"/gi)].map((m) => m[1]);
check("no insecure URLs", insecure.length === 0, insecure.join(", "));

// JavaScript syntax, including the test harness.
const testDir = join(root, "tests");
const testFiles = existsSync(testDir) ? readdirSync(testDir).filter((f) => f.endsWith(".mjs")) : [];
const jsFiles = [...files.filter((f) => f.endsWith(".js") || f.endsWith(".mjs")), ...testFiles.map((f) => join("tests", f))];
const badJs = [];
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ["--check", join(root, f)], { encoding: "utf8" });
  if (r.status !== 0) badJs.push(`${f}: ${(r.stderr || "").trim().split("\n")[0]}`);
}
check("JavaScript syntax", badJs.length === 0, badJs.join("; "));

// Behaviour of the core journeys, exercised in Node with small DOM stand-ins.
const behaviourTests = testFiles.filter((f) => f.endsWith(".test.mjs"));
if (behaviourTests.length) {
  const r = spawnSync(process.execPath, ["--test", ...behaviourTests.map((f) => join(root, "tests", f))], { encoding: "utf8" });
  const detail = r.status === 0 ? "" : ((r.stderr || r.stdout || "").split("\n").filter((l) => /✖|not ok|Error/.test(l)).slice(0, 2).join(" | "));
  check("behaviour tests pass", r.status === 0, detail);
}

if (failures.length) {
  console.error(`FAILED ${failures.length} of ${checks} checks:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(`OK — ${checks} static checks passed.`);
}

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
const notFound = read("404.html");

// The error page should still be branded, safe to load and able to lead the visitor home.
check("404 page has language, CSP and recovery links",
  /<html lang="en-GB"/.test(notFound) && /http-equiv="Content-Security-Policy"/i.test(notFound) && /href="\.\/"/.test(notFound) && /href="tel:/.test(notFound));
const notFoundRefs = [...notFound.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(?:https?:|#|tel:|mailto:|data:)/i.test(u));
const notFoundMissing = [...new Set(notFoundRefs.filter((u) => !existsSync(join(root, u))))];
check("404 page assets exist", notFoundMissing.length === 0, notFoundMissing.join(", "));
const mainSheets = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]);
const errorSheets = [...notFound.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]);
check("404 page uses the main stylesheet cascade", mainSheets.every((f) => errorSheets.includes(f)), errorSheets.join(", "));

// Labelled sections should carry a real heading, not just styling.
const faq = html.match(/<section class="section" aria-label="([^"]+)">\s*<h2[^>]*>([^<]+)<\/h2>/);
check("FAQ section has a matching heading", !!faq && faq[1] === faq[2], faq ? `${faq[1]} vs ${faq[2]}` : "missing");

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

// Mobile visual order must match DOM/tab order; theme colour must come from the cascade.
const toggleAt = html.indexOf('class="nav-toggle"');
check("menu button precedes nav in DOM", toggleAt !== -1 && toggleAt < html.indexOf('id="main-nav"'));
const themeColor = html.match(/name="theme-color" content="#([0-9a-f]{6})"/i)?.[1];
// Later stylesheets win, so the last --base is the colour the browser computes for the page.
const computedBase = [...loadedCss.matchAll(/--base:\s*#([0-9a-f]{6})/gi)].at(-1)?.[1]?.toLowerCase();
check("theme colour matches the computed page base", !!themeColor && themeColor.toLowerCase() === computedBase, `${themeColor || "missing"} vs ${computedBase || "missing"}`);
const errorFields = ["name", "date", "preferred-time"];
const undescribed = errorFields.filter((id) => !new RegExp(`id="${id}"[^>]*aria-describedby="visit-error"`).test(html));
check("validated fields describe the error region", undescribed.length === 0, undescribed.join(", "));

// Structured data parses.
const blocks = [...html.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
check("structured data present", blocks.length > 0);
const badJson = [];
blocks.forEach((b, i) => {
  try { JSON.parse(b); } catch (e) { badJson.push(`block ${i + 1}: ${e.message}`); }
});
check("JSON-LD parses", badJson.length === 0, badJson.join("; "));

// One addressed business entity, with any referenced nodes actually present.
// A second HairSalon node for the offer catalogue is intentional.
const ldNodes = blocks.flatMap((b) => {
  try { const j = JSON.parse(b); return Array.isArray(j) ? j : [j]; } catch { return []; }
});
const salonNodes = ldNodes.filter((j) => j["@type"] === "HairSalon");
const addressedSalons = salonNodes.filter((j) => j.address?.streetAddress);
check("one addressed business entity in structured data", addressedSalons.length === 1, `found ${addressedSalons.length}`);
const nodeIds = new Set(ldNodes.map((j) => j["@id"]).filter(Boolean));
const danglingRefs = [];
for (const j of salonNodes) {
  for (const prop of ["contactPoint", "hasOfferCatalog"]) {
    const ref = j[prop]?.["@id"];
    if (ref && !nodeIds.has(ref)) danglingRefs.push(`${prop} -> ${ref}`);
  }
}
check("structured data references resolve", danglingRefs.length === 0, danglingRefs.join(", "));

// Documented metadata must stay present in the shipped page.
check("main page language set", /<html lang="en-GB"/.test(html));
check("manifest linked from main page", /<link[^>]+rel="manifest"[^>]+href="site\.webmanifest"/.test(html));
check("Open Graph locale present", /property="og:locale" content="en_GB"/.test(html));
const ldIds = ldNodes.map((j) => j["@id"]).filter(Boolean);
check("structured data IDs unique", new Set(ldIds).size === ldIds.length, ldIds.join(", "));

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
check("tel links match structured data", ldPhones.size > 0 && phoneMismatch.length === 0, phoneMismatch.join(", "));
// Multiple JSON-LD nodes carry the telephone; they must agree on one number.
check("structured telephone is singular", ldPhones.size === 1, [...ldPhones].join(", "));

// The number is also printed as text and embedded in generated links, not only in tel: hrefs.
const phonePattern = /(?:\+?44|0)7\d{3}[\s -]?\d{6}/g;
const ukNumber = (value) => {
  const d = digits(value);
  return d.startsWith("44") ? d.slice(2) : d.startsWith("0") ? d.slice(1) : d;
};
const ukPhones = new Set([...ldPhones].map(ukNumber));
const phoneSources = [["index.html", html], ["404.html", read("404.html")],
  ...files.filter((f) => f.endsWith(".js")).map((f) => [f, read(f)])];
const phoneDrift = [];
for (const [name, text] of phoneSources) {
  for (const m of text.matchAll(phonePattern)) {
    if (!ukPhones.has(ukNumber(m[0]))) phoneDrift.push(`${name}: ${m[0]}`);
  }
}
check("all displayed phone numbers match structured data", phoneDrift.length === 0, phoneDrift.slice(0, 3).join(", "));

// Opening hours are repeated in structured data, the live status and form validation.
const dayNumbers = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const toMinutes = (value) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
let listedHours = null;
for (const b of blocks) {
  try {
    const j = JSON.parse(b);
    if (!Array.isArray(j.openingHoursSpecification)) continue;
    const map = {};
    for (const spec of j.openingHoursSpecification) {
      const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];
      const range = [toMinutes(spec.opens), toMinutes(spec.closes)];
      if (range.some((v) => v === null)) continue;
      for (const day of days) if (dayNumbers[day] !== undefined) map[dayNumbers[day]] = range;
    }
    if (Object.keys(map).length) listedHours = map;
  } catch { /* already reported by the JSON-LD check */ }
}
check("structured opening hours present", !!listedHours);
const hoursMatch = (actual) => !!listedHours && Object.keys(listedHours).length === Object.keys(actual).length &&
  Object.entries(listedHours).every(([day, range]) => actual[day] && range[0] === actual[day][0] && range[1] === actual[day][1]);

const statusSource = read("experience.js").match(/hours=best\?\{([^}]*)\}/)?.[1];
const statusHours = {};
if (statusSource) {
  for (const m of statusSource.matchAll(/(\d):\[(\d+),(\d+)\]/g)) statusHours[Number(m[1])] = [Number(m[2]), Number(m[3])];
}
check("status hours match structured data", hoursMatch(statusHours));

const validation = read("app.js").match(/chosen\.getDay\(\)===0\?\[(\d+),(\d+)\]:\[(\d+),(\d+)\]/);
const validationHours = {};
if (validation) {
  validationHours[0] = [Number(validation[1]), Number(validation[2])];
  for (let day = 1; day <= 6; day++) validationHours[day] = [Number(validation[3]), Number(validation[4])];
}
check("form hours match structured data", hoursMatch(validationHours));

const clockText = (value) => String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0");
const listedRanges = [...new Set(Object.values(listedHours || {}).map(([open, close]) => `${clockText(open)}–${clockText(close)}`))];
check("listed hours text matches structured data", !!listedHours && listedRanges.every((range) => html.includes(range)));

// The two services are repeated in the hero, the service list, the form and structured data.
const sameSet = (a, b) => a.size === b.size && [...a].every((item) => b.has(item));
const setDifference = (a, b) => [...a].filter((item) => !b.has(item)).join(", ");
const serviceMarkup = html.match(/<select\s+id="service"[^>]*>([\s\S]*?)<\/select>/i)?.[1] || "";
const serviceOptions = new Set([...serviceMarkup.matchAll(/<option[^>]*>([^<]+)<\/option>/gi)].map((m) => m[1].trim()));
const heroServices = new Set([...html.matchAll(/data-hero-service="([^"]+)"/g)].map((m) => m[1]));
const linkServices = new Set([...html.matchAll(/data-service="([^"]+)"/g)].map((m) => m[1]));
check("service options match hero buttons", sameSet(serviceOptions, heroServices), setDifference(serviceOptions, heroServices) || setDifference(heroServices, serviceOptions));
check("service options match service links", sameSet(serviceOptions, linkServices), setDifference(serviceOptions, linkServices) || setDifference(linkServices, serviceOptions));
const pressed = [...html.matchAll(/data-hero-service="([^"]+)"[^>]*aria-pressed="true"/g)].map((m) => m[1]);
check("one hero service is pressed and offered", pressed.length === 1 && serviceOptions.has(pressed[0]), pressed.join(", "));
const catalogNames = new Set(blocks.flatMap((b) => {
  try { const j = JSON.parse(b); return (j.hasOfferCatalog?.itemListElement || []).map((item) => item.itemOffered?.name).filter(Boolean); }
  catch { return []; }
}));
check("service options match structured data", sameSet(serviceOptions, catalogNames), setDifference(serviceOptions, catalogNames) || setDifference(catalogNames, serviceOptions));

// Contact identity repeats in structured data, visible text, metadata and the manifest.
const salon = blocks.map((b) => { try { return JSON.parse(b); } catch { return {}; } }).find((j) => j["@type"] === "HairSalon" && j.address);
const address = salon?.address || {};
// Exclude JSON-LD itself, otherwise the structured copy trivially satisfies the check.
const visibleHtml = html.replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, "");
const addressOk = !!address.streetAddress && !!address.postalCode && visibleHtml.includes(address.streetAddress) && visibleHtml.includes(address.postalCode);
check("structured address matches page text", addressOk, `${address.streetAddress || "?"} / ${address.postalCode || "?"}`);
const mapsLinks = [...new Set([...html.matchAll(/https:\/\/maps\.google\.com\/[^"' ]+/g)].map((m) => m[0]))];
const addressParts = [address.streetAddress, address.postalCode].filter(Boolean);
const mapsDrift = mapsLinks.filter((url) => {
  const decoded = decodeURIComponent(url.replace(/\+/g, " "));
  return !addressParts.every((part) => decoded.includes(part));
});
check("maps links carry the structured address", mapsLinks.length > 0 && mapsDrift.length === 0, mapsDrift.slice(0, 2).join(", "));
const name = salon?.name || "";
const nameOk = !!name && html.includes(`<title>${name}`) && html.includes(`property="og:title" content="${name}"`) && manifest?.name === name;
check("business name matches title and manifest", nameOk, name || "no structured name");

// The 404 page's contact details and script policy must match the main page.
const nfPhones = [...new Set([...notFound.matchAll(/href="tel:([^"]+)"/g)].map((m) => digits(m[1])))];
check("404 phone matches structured data", nfPhones.length > 0 && nfPhones.every((p) => ldPhones.has(p)), nfPhones.join(", "));
check("404 has strict script policy and noindex", /script-src 'self'/.test(notFound) && /noindex/.test(notFound));

// The sitemap must point at the same canonical URL as the main page.
const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
const sitemapLocs = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check("sitemap matches canonical URL", !!canonical && sitemapLocs.length > 0 && sitemapLocs.every((u) => u === canonical), sitemapLocs.join(", "));

// Until owner launch, indexing is deliberately blocked in both places.
check("main page blocks indexing", /name="robots" content="[^"]*noindex/i.test(html));
check("robots.txt disallows crawling", /Disallow:\s*\/\s*$/m.test(read("robots.txt")));

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

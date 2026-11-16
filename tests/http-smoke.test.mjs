import test, { after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json", ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};
const ext = (p) => p.slice(p.lastIndexOf("."));

const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(root, path === "/" ? "index.html" : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[ext(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => new Promise((resolve) => server.close(resolve)));

async function get(path) {
  const res = await fetch(base + path);
  return { status: res.status, type: res.headers.get("content-type") || "", text: await res.text() };
}
function localRefs(html) {
  return [...new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .filter((u) => !/^(?:https?:|#|tel:|mailto:|data:)/i.test(u)))];
}

test("the main page is served as HTML", async () => {
  const r = await get("/");
  assert.equal(r.status, 200);
  assert.match(r.type, /text\/html/);
  assert.match(r.text, /<h1/);
});

test("every local asset referenced by the main page is served", async () => {
  const page = await get("/");
  const refs = localRefs(page.text);
  assert.ok(refs.length > 0);
  for (const ref of refs) {
    const r = await get("/" + ref);
    assert.equal(r.status, 200, `${ref} returned ${r.status}`);
  }
});

test("every local asset referenced by the 404 page is served", async () => {
  const page = await get("/404.html");
  assert.equal(page.status, 200);
  for (const ref of localRefs(page.text)) {
    const r = await get("/" + ref);
    assert.equal(r.status, 200, `${ref} returned ${r.status}`);
  }
});

test("stylesheets, scripts and fonts get the right content types", async () => {
  for (const [path, expected] of [
    ["/site.css", /text\/css/], ["/app.js", /javascript/],
    ["/assets/dm-sans.woff2", /font\/woff2/], ["/site.webmanifest", /manifest/],
  ]) {
    const r = await get(path);
    assert.equal(r.status, 200, path);
    assert.match(r.type, expected, path);
  }
});

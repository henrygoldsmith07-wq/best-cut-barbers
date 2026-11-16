import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { StubElement } from "./dom-stub.mjs";

function loadCopy({ clipboard, execCommand = () => false }) {
  const appended = [];
  const body = new StubElement("body");
  body.append = (...elements) => appended.push(...elements);
  const document = {
    body,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => new StubElement(tag),
    execCommand,
  };
  const context = {
    document, window: null, navigator: { clipboard },
    Date, Math, Number, String, Set, console, execCommand,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setInterval: () => 0,
  };
  context.window = context;
  vm.runInNewContext(readFileSync(new URL("../experience.js", import.meta.url), "utf8"), context, { filename: "experience.js" });
  return { SiteUX: context.SiteUX, appended };
}

test("uses the clipboard API when it is available", async () => {
  const written = [];
  const h = loadCopy({ clipboard: { writeText: async (text) => written.push(text) } });
  assert.equal(await h.SiteUX.copy("visit note"), true);
  assert.deepEqual(written, ["visit note"]);
  assert.equal(h.appended.length, 0);
});

test("falls back to a hidden textarea when the clipboard API fails", async () => {
  const h = loadCopy({
    clipboard: { writeText: async () => { throw new Error("blocked"); } },
    execCommand: () => true,
  });
  assert.equal(await h.SiteUX.copy("visit note"), true);
  assert.equal(h.appended.length, 1);
  assert.equal(h.appended[0].tagName, "TEXTAREA");
  assert.equal(h.appended[0].value, "visit note");
  assert.equal(h.appended[0].selected, true);
  assert.equal(h.appended[0].removed, true);
});

test("reports failure and cleans up when both copy paths fail", async () => {
  const h = loadCopy({
    clipboard: { writeText: async () => { throw new Error("blocked"); } },
    execCommand: () => false,
  });
  assert.equal(await h.SiteUX.copy("visit note"), false);
  assert.equal(h.appended.length, 1);
  assert.equal(h.appended[0].removed, true);
});

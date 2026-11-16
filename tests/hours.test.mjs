import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Load experience.js with a fixed London clock and only the elements its status block uses.
function loadHours(fixedUTC) {
  let fixed = fixedUTC;
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
  }
  const status = {
    _text: "See the listed hours below",
    writes: 0,
    get textContent() { return this._text; },
    set textContent(value) { this.writes++; this._text = value; },
  };
  const body = { classList: { contains: (name) => name === "studio" } };
  let timer = null;
  const context = {
    Date: FakeDate, Math, Number, String, console,
    window: null,
    navigator: {},
    document: {
      body,
      querySelector(selector) { return selector === "#visit-status" ? status : null; },
      querySelectorAll() { return []; },
      createElement() { throw new Error("unexpected createElement"); },
    },
    matchMedia() { return { matches: false, addEventListener() {} }; },
    setInterval(fn) { timer = fn; return 1; },
  };
  context.window = context;
  const source = readFileSync(new URL("../experience.js", import.meta.url), "utf8");
  vm.runInNewContext(source, context, { filename: "experience.js" });
  return { status, tick: () => timer(), setTime: (value) => { fixed = value; } };
}

test("reports the listed closing time during opening hours", () => {
  const { status } = loadHours("2026-11-16T10:30:00Z"); // Monday, 10:30 London
  assert.equal(status.textContent, "Listed open until 6pm");
});

test("reports the listed opening time before opening", () => {
  const { status } = loadHours("2026-11-16T08:00:00Z"); // Monday, 08:00 London
  assert.equal(status.textContent, "Listed opening today: 9am");
});

test("reports the next opening after Sunday closing", () => {
  const { status } = loadHours("2026-11-15T17:00:00Z"); // Sunday, 17:00 London
  assert.equal(status.textContent, "Next listed opening: tomorrow at 9am");
});

test("the periodic refresh writes only when the message changes", () => {
  const h = loadHours("2026-11-16T10:30:00Z");
  assert.equal(h.status.writes, 1);
  h.tick();
  h.tick();
  assert.equal(h.status.writes, 1, "unchanged status must not be rewritten");
  h.setTime("2026-11-16T18:30:00Z"); // Monday after closing
  h.tick();
  assert.equal(h.status.writes, 2);
  assert.equal(h.status.textContent, "Next listed opening: tomorrow at 9am");
});

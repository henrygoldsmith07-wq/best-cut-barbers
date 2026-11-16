import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { StubElement } from "./dom-stub.mjs";

function loadNavigation() {
  const nav = new StubElement("nav");
  const toggle = new StubElement("button");
  toggle.setAttribute("aria-expanded", "false");
  const link = new StubElement("a");
  link.closest = (selector) => (selector === "a" ? link : null);
  const outside = new StubElement("div");

  nav.contains = (el) => el === link || el === nav;
  toggle.contains = (el) => el === toggle;

  const docListeners = {};
  const document = {
    activeElement: null,
    querySelector(selector) {
      if (selector === "#main-nav") return nav;
      if (selector === ".nav-toggle") return toggle;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
  };
  const mediaCallbacks = [];
  const context = {
    document, window: null, Date, Math, Number, String, Set, console,
    matchMedia: () => ({ matches: false, addEventListener: (_type, fn) => mediaCallbacks.push(fn) }),
  };
  context.window = context;
  vm.runInNewContext(readFileSync(new URL("../direction.js", import.meta.url), "utf8"), context, { filename: "direction.js" });

  return {
    document, nav, toggle, link, outside,
    open: () => toggle.dispatch("click"),
    key: (key) => { for (const fn of docListeners.keydown || []) fn({ key }); },
    outsideClick: () => { for (const fn of docListeners.click || []) fn({ target: outside }); },
    breakpoint: () => { for (const fn of mediaCallbacks) fn(); },
  };
}

function assertState(h, open) {
  assert.equal(h.toggle.getAttribute("aria-expanded"), String(open), "aria-expanded");
  assert.equal(h.nav.classList.contains("nav-open"), open, "nav-open class");
}

test("the menu button opens and closes the navigation", () => {
  const h = loadNavigation();
  h.open();
  assertState(h, true);
  h.open();
  assertState(h, false);
});

test("clicking a navigation link closes the menu", () => {
  const h = loadNavigation();
  h.open();
  h.nav.dispatch("click", { target: h.link });
  assertState(h, false);
});

test("Escape closes the menu and restores focus to the button", () => {
  const h = loadNavigation();
  h.open();
  h.document.activeElement = h.link;
  h.key("Escape");
  assertState(h, false);
  assert.equal(h.toggle.focused, true);
});

test("clicking outside the menu closes it", () => {
  const h = loadNavigation();
  h.open();
  h.outsideClick();
  assertState(h, false);
});

test("the desktop breakpoint closes the menu", () => {
  const h = loadNavigation();
  h.open();
  h.breakpoint();
  assertState(h, false);
});

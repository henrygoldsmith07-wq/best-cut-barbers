import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { StubElement } from "./dom-stub.mjs";

function loadExperience() {
  const service = new StubElement("select");
  service.value = "Haircut consultation";
  const copy = new StubElement("p");

  const haircutButton = new StubElement("button");
  haircutButton.dataset.heroService = "Haircut consultation";
  const beardButton = new StubElement("button");
  beardButton.dataset.heroService = "Beard grooming enquiry";

  const haircutLink = new StubElement("a");
  haircutLink.dataset.service = "Haircut consultation";
  const beardLink = new StubElement("a");
  beardLink.dataset.service = "Beard grooming enquiry";
  const haircutItem = new StubElement("li");
  haircutItem.querySelector = () => haircutLink;
  const beardItem = new StubElement("li");
  beardItem.querySelector = () => beardLink;

  const document = {
    querySelector(selector) {
      if (selector === "#service") return service;
      if (selector === "#service-copy") return copy;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-hero-service]") return [haircutButton, beardButton];
      if (selector === "[data-service]") return [haircutLink, beardLink];
      if (selector === ".services li") return [haircutItem, beardItem];
      return [];
    },
  };
  const context = {
    document, window: null, navigator: {}, Date, Math, Number, String, Set, console,
    Event: class Event { constructor(type, opts = {}) { this.type = type; Object.assign(this, opts); } },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setInterval: () => 0,
  };
  context.window = context;
  vm.runInNewContext(readFileSync(new URL("../experience.js", import.meta.url), "utf8"), context, { filename: "experience.js" });
  return { service, copy, haircutButton, beardButton, haircutLink, beardLink, haircutItem, beardItem };
}

test("a hero service button updates the form and its pressed state", () => {
  const h = loadExperience();
  h.beardButton.dispatch("click");
  assert.equal(h.service.value, "Beard grooming enquiry");
  assert.equal(h.beardButton.getAttribute("aria-pressed"), "true");
  assert.equal(h.haircutButton.getAttribute("aria-pressed"), "false");
  assert.match(h.copy.textContent, /Beard grooming enquiry selected/);
});

test("a service-list link updates the hero buttons", () => {
  const h = loadExperience();
  h.beardButton.dispatch("click");
  h.haircutLink.dispatch("click");
  assert.equal(h.service.value, "Haircut consultation");
  assert.equal(h.haircutButton.getAttribute("aria-pressed"), "true");
  assert.equal(h.beardButton.getAttribute("aria-pressed"), "false");
  assert.equal(h.haircutItem.classList.contains("service-selected"), true);
  assert.equal(h.beardItem.classList.contains("service-selected"), false);
});

test("changing the select keeps the hero buttons in sync", () => {
  const h = loadExperience();
  h.service.value = "Beard grooming enquiry";
  h.service.dispatch("change");
  assert.equal(h.beardButton.getAttribute("aria-pressed"), "true");
  assert.equal(h.haircutButton.getAttribute("aria-pressed"), "false");
  assert.match(h.copy.textContent, /Beard grooming enquiry selected/);
});

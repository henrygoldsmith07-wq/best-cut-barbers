// Minimal DOM stand-in so app.js can be exercised in Node without a browser or packages.
// It implements only the surface app.js actually uses; it is not a general DOM.
import { readFileSync } from "node:fs";
import vm from "node:vm";

export class StubElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.listeners = new Map();
    this.value = "";
    this.hidden = false;
    this.dataset = {};
    this.textContent = "";
    this.focused = false;
  }

  get classList() {
    const classes = (this.classes ||= []);
    return {
      contains: (name) => classes.includes(name),
      add: (name) => { if (!classes.includes(name)) classes.push(name); },
      remove: (name) => { this.classes = classes.filter((c) => c !== name); },
      toggle: (name, force) => {
        const on = force === undefined ? !classes.includes(name) : force;
        if (on) { if (!classes.includes(name)) classes.push(name); }
        else { this.classes = classes.filter((c) => c !== name); }
        return on;
      },
    };
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  dispatch(type, extra = {}) {
    const event = { type, target: this, preventDefault() {}, ...extra };
    for (const fn of this.listeners.get(type) || []) fn(event);
  }

  dispatchEvent(event) {
    for (const fn of this.listeners.get(event.type) || []) fn(event);
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  setCustomValidity(value) { this.customValidity = value; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  remove() { this.removed = true; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }

  querySelectorAll(selector) {
    if (selector === "[aria-invalid]") return this.descendants().filter((e) => e.hasAttribute("aria-invalid"));
    return [];
  }

  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

export function allText(el) {
  return el.textContent + el.children.map(allText).join("");
}

export function loadApp({ reportValidity = () => true, copy = async () => true } = {}) {
  const registry = new Map();
  const body = new StubElement("body");
  body.classes = ["studio"];

  const document = {
    body,
    querySelector(selector) {
      if (!registry.has(selector)) registry.set(selector, new StubElement());
      return registry.get(selector);
    },
    createElement(tag) { return new StubElement(tag); },
  };

  const el = (selector) => document.querySelector(selector);
  el("#result").hidden = true;
  el("#visit-error").hidden = true;
  const form = el("#visit-form");
  form.reportValidity = reportValidity;

  const context = {
    document,
    Date, Math, Number, String, Set, console,
    navigator: {},
    SiteUX: { copy },
    Event: class Event { constructor(type, opts = {}) { this.type = type; Object.assign(this, opts); } },
  };
  const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  vm.runInNewContext(source, context, { filename: "app.js" });

  return { form, el, document };
}

// Mirror app.js's London "wall clock" helpers so test dates match the form's bounds.
export function londonNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
}
export function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function dayOffset(days) {
  const d = londonNow();
  d.setDate(d.getDate() + days);
  return iso(d);
}

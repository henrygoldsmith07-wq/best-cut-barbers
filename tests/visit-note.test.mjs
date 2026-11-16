import test from "node:test";
import assert from "node:assert/strict";
import { allText, dayOffset, iso, loadApp, londonNow } from "./dom-stub.mjs";

function fill(app, overrides = {}) {
  const values = {
    name: "Alex",
    service: "Haircut consultation",
    date: dayOffset(1),
    time: "",
    notes: "",
    website: "",
    ...overrides,
  };
  app.el("#name").value = values.name;
  app.el("#service").value = values.service;
  app.el("#date").value = values.date;
  app.el("#preferred-time").value = values.time;
  app.el("#notes").value = values.notes;
  app.el("#website").value = values.website;
  return app;
}

function submit(app) { app.form.dispatch("submit"); }

test("sets London date bounds when the form loads", () => {
  const app = loadApp();
  assert.equal(app.el("#date").min, iso(londonNow()));
  assert.equal(app.el("#date").max, dayOffset(120));
});

test("prepares a note for a valid visit without sending anything", () => {
  const app = fill(loadApp(), { notes: "Short back and sides" });
  submit(app);
  const result = app.el("#result");
  const text = allText(result);
  assert.equal(result.hidden, false);
  assert.equal(app.el("#visit-error").hidden, true);
  assert.match(text, /Name: Alex/);
  assert.match(text, /Enquiry: Haircut consultation/);
  assert.match(text, /Questions: Short back and sides/);
  assert.match(text, /Nothing has been sent/);
  assert.match(text, /No appointment has been reserved/);
});

test("rejects a one-character name", () => {
  const app = fill(loadApp(), { name: "A" });
  submit(app);
  assert.match(app.el("#visit-error").textContent, /Enter the name/);
  assert.equal(app.el("#result").hidden, true);
  assert.equal(app.el("#name").getAttribute("aria-invalid"), "true");
});

test("rejects a date outside the next 120 days", () => {
  const app = fill(loadApp(), { date: dayOffset(-1) });
  submit(app);
  assert.match(app.el("#visit-error").textContent, /within the next 120 days/);
  assert.equal(app.el("#result").hidden, true);
});

test("rejects a preferred time outside listed opening hours", () => {
  const app = fill(loadApp(), { time: "20:00" });
  submit(app);
  assert.match(app.el("#visit-error").textContent, /within the listed opening hours/);
  assert.equal(app.el("#result").hidden, true);
});

test("accepts a time inside listed opening hours", () => {
  const app = fill(loadApp(), { date: dayOffset(2), time: "10:30" });
  submit(app);
  assert.equal(app.el("#result").hidden, false);
  assert.match(allText(app.el("#result")), /Preferred time: 10:30/);
});

test("a filled honeypot produces no note and no error", () => {
  const app = fill(loadApp(), { website: "spam" });
  submit(app);
  assert.equal(app.el("#result").hidden, true);
  assert.equal(app.el("#visit-error").hidden, true);
});

test("editing a field clears a stale note", () => {
  const app = fill(loadApp());
  submit(app);
  assert.equal(app.el("#result").hidden, false);
  app.form.dispatch("input", { target: app.el("#name") });
  assert.equal(app.el("#result").hidden, true);
  assert.equal(app.el("#result").children.length, 0);
  assert.equal(app.el("#visit-error").hidden, true);
});

test("note content is inserted as text, never markup", () => {
  const injected = '<img src=x onerror="alert(1)">';
  const app = fill(loadApp(), { name: injected });
  submit(app);
  const pre = app.el("#result").children[3];
  assert.equal(pre.tagName, "PRE");
  assert.equal(pre.textContent.includes(injected), true);
  assert.equal(pre.children.length, 0);
});

test("copy button reports the copy outcome", async () => {
  const app = fill(loadApp({ copy: async () => true }));
  submit(app);
  const copy = app.el("#result").children[2].children[1];
  copy.dispatch("click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(copy.textContent, "Note copied");
});

test("copy button gives a manual fallback when copying fails", async () => {
  const app = fill(loadApp({ copy: async () => false }));
  submit(app);
  const copy = app.el("#result").children[2].children[1];
  copy.dispatch("click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(copy.textContent, "Select the note below to copy");
});

test("native validation failure blocks the note", () => {
  const app = fill(loadApp({ reportValidity: () => false }));
  submit(app);
  assert.equal(app.el("#result").hidden, true);
  assert.equal(app.el("#visit-error").hidden, true);
});

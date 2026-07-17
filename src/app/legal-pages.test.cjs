/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const appDir = __dirname;
const read = (...parts) => fs.readFileSync(path.join(appDir, ...parts), "utf8");

test("privacy route includes metadata and required disclosures", () => {
  const src = read("(public)", "privacy", "page.tsx");
  assert.match(src, /Privacy Policy \| MyInsightAcademy/);
  assert.match(src, /https:\/\/myinsightacademy\.com\/privacy/);

  for (const phrase of [
    "July 16, 2026",
    "WhatsApp",
    "Kitty",
    "OpenAI",
    "Anthropic",
    "Supabase",
    "Vercel",
    "Resend",
    "local storage",
    "hello@myinsightacademy.com",
  ]) {
    assert.ok(src.includes(phrase), `privacy page missing ${phrase}`);
  }
  assert.doesNotMatch(src, /Hermes/);
});

test("terms route includes metadata and required provisions", () => {
  const src = read("(public)", "terms", "page.tsx");
  assert.match(src, /Terms of Service \| MyInsightAcademy/);
  assert.match(src, /https:\/\/myinsightacademy\.com\/terms/);

  for (const phrase of [
    "July 16, 2026",
    "12 years old",
    "monthly",
    "reschedul",
    "WhatsApp",
    "AI",
    "Vietnam",
    "hello@myinsightacademy.com",
  ]) {
    assert.ok(
      src.toLowerCase().includes(phrase.toLowerCase()),
      `terms page missing ${phrase}`,
    );
  }
  assert.match(src, /Kitty/);
  assert.doesNotMatch(src, /Hermes/);
});

test("public footer links to both legal routes", () => {
  const src = read("(public)", "page.tsx");
  assert.match(src, /href="\/privacy"/);
  assert.match(src, /href="\/terms"/);
});

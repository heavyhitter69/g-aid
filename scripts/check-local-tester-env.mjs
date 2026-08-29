#!/usr/bin/env node
/**
 * Report whether local tester env files look usable. Never prints values.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function usable(url, key) {
  const trimmedUrl = (url ?? "").trim();
  const trimmedKey = (key ?? "").trim();
  if (!trimmedUrl || !trimmedKey) return false;
  if (trimmedUrl.toLowerCase().includes("placeholder") || trimmedKey.toLowerCase().includes("placeholder")) {
    return false;
  }
  return /^https:\/\//i.test(trimmedUrl);
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, vars: {} };
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const vars = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = rawLine.indexOf("=");
    if (eq === -1) continue;
    const name = rawLine.slice(0, eq).trim().replace(/^export\s+/, "");
    const rawValue = rawLine.slice(eq + 1);
    const leadingSpace = rawValue.startsWith(" ") || rawValue.startsWith("\t");
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[name] = {
      length: value.length,
      leadingSpace,
      quoted: rawValue.trim().startsWith('"') || rawValue.trim().startsWith("'"),
      https: /^https:\/\//i.test(value.trim()),
      dollar: rawValue.includes("$"),
      placeholder: value.toLowerCase().includes("placeholder"),
    };
  }
  return { exists: true, bytes: fs.statSync(filePath).size, vars };
}

function describeKey(name, info) {
  if (!info) return `${name}: missing`;
  const bits = [`${info.length} chars`];
  if (name.includes("URL")) bits.push(info.https ? "https" : "not-https");
  if (info.leadingSpace) bits.push("leading-space-after-equals");
  if (info.dollar) bits.push("contains-$ (quote the value or escape as \\$)");
  if (info.placeholder) bits.push("contains-placeholder");
  return `${name}: ${bits.join(", ")}`;
}

function reportFile(label, rel) {
  const parsed = parseEnvFile(path.join(repo, rel));
  if (!parsed.exists) {
    console.log(`${label} (${rel}): missing`);
    return parsed;
  }
  console.log(`${label} (${rel}): present, ${parsed.bytes} bytes`);
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "GAID_DESKTOP_AUTH_STORE",
  ]) {
    if (name === "GAID_DESKTOP_AUTH_STORE" && rel.startsWith("software")) continue;
    console.log(`  ${describeKey(name, parsed.vars[name])}`);
  }
  if (parsed.vars.NEXT_PUBLIC_SUPABASE_ANON_KEY && parsed.vars.NEXT_PUBLIC_SUPABASE_ANON_KEY.length < 80) {
    console.log("  note: anon/publishable keys from the dashboard are usually much longer than 80 characters");
  }
  return parsed;
}

console.log("G-AID local tester env check (no secrets printed)\n");
console.log("The website process reads website/.env.local only. Repo-root and software/.env.local are not used for this login form.\n");

const website = reportFile("website", "website/.env.local");
console.log("");
const software = reportFile("software", "software/.env.local");
console.log("");
const rootEnv = reportFile("repo root", ".env.local");

const websiteUrl = website.vars?.NEXT_PUBLIC_SUPABASE_URL;
const websiteKey = website.vars?.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const fileLooksUsable =
  website.exists &&
  websiteUrl &&
  websiteKey &&
  websiteUrl.https &&
  websiteKey.length > 0 &&
  !websiteUrl.placeholder &&
  !websiteKey.placeholder;

console.log("");
if (rootEnv.exists && rootEnv.vars.NEXT_PUBLIC_SUPABASE_ANON_KEY && !fileLooksUsable) {
  console.log("warning: repo-root .env.local is not loaded by npm run dev:website. Put the values in website/.env.local.");
}
if (software.exists && software.vars.NEXT_PUBLIC_SUPABASE_ANON_KEY && !website.exists) {
  console.log("warning: software/.env.local is not the website login file.");
}

const loaded = loadEnvConfig(path.join(repo, "website"), true, { info() {}, error() {} }).combinedEnv || process.env;
const nextUsable = usable(loaded.NEXT_PUBLIC_SUPABASE_URL, loaded.NEXT_PUBLIC_SUPABASE_ANON_KEY);
console.log(`Next would load website/.env.local as: ${nextUsable ? "usable" : "not usable"}`);
if (!nextUsable) {
  console.log("Fill website/.env.local, then Ctrl+C and restart npm run dev:website.");
  process.exit(1);
}
console.log("Restart the website if it was started before this file was saved, then:");
console.log("  curl -s http://127.0.0.1:3000/api/auth/status");
console.log("Expect {\"configured\":true}. Then reload the login page.");

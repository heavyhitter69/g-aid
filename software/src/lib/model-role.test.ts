import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  classifyDirectQuestion,
  extractModelfileSystem,
  identityAnswer,
  listedNameMatches,
  MODEL_ROLES,
  ORCHESTRA_ALIAS,
  ORCHESTRA_BASE,
  ORCHESTRA_FAST_ALIAS,
  ORCHESTRA_FAST_BASE,
  ORCHESTRA_FAST_SYSTEM,
  ORCHESTRA_SYSTEM,
  processedDataAnswer,
  PRODUCT_ORCHESTRA,
  PRODUCT_ORCHESTRA_FAST,
  resolveRoleFromListed,
  roleForSpeed,
  unavailableMessage,
} from "./model-role.ts";

let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok  ${name}`);
    console.error(err);
  }
}

const root = path.join(process.cwd());
const softwareRoot = fs.existsSync(path.join(root, "ollama", "Modelfile"))
  ? root
  : path.join(root, "software");

test("aliases stay g-aid-orchestra and g-aid-orchestra-fast", () => {
  assert.equal(ORCHESTRA_ALIAS, "g-aid-orchestra");
  assert.equal(ORCHESTRA_FAST_ALIAS, "g-aid-orchestra-fast");
  assert.equal(MODEL_ROLES.orchestra.alias, "g-aid-orchestra");
  assert.equal(MODEL_ROLES["orchestra-fast"].alias, "g-aid-orchestra-fast");
  assert.equal(roleForSpeed("thinking").alias, "g-aid-orchestra");
  assert.equal(roleForSpeed("fast").alias, "g-aid-orchestra-fast");
});

test("Fast binds qwen2.5:3b only and Thinking binds deepseek-r1:8b only", () => {
  assert.equal(roleForSpeed("fast").base, ORCHESTRA_FAST_BASE);
  assert.equal(roleForSpeed("thinking").base, ORCHESTRA_BASE);
  assert.equal(ORCHESTRA_FAST_BASE, "qwen2.5:3b");
  assert.equal(ORCHESTRA_BASE, "deepseek-r1:8b");
});

test("existing Fast alias is used unchanged without create", () => {
  const resolved = resolveRoleFromListed(["g-aid-orchestra-fast:latest", "llama3.2:3b"], "fast");
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.model, "g-aid-orchestra-fast");
    assert.equal(resolved.needsCreate, false);
    assert.equal(resolved.usedExistingAlias, true);
  }
});

test("existing Thinking alias is used unchanged without create", () => {
  const resolved = resolveRoleFromListed(["g-aid-orchestra", "qwen2.5:3b"], "thinking");
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.model, "g-aid-orchestra");
    assert.equal(resolved.needsCreate, false);
    assert.equal(resolved.usedExistingAlias, true);
  }
});

test("Fast does not resolve llama, phi, gemma, smaller Qwen, or DeepSeek", () => {
  for (const names of [
    ["llama3.2:3b"],
    ["llama3.2:1b"],
    ["phi3:mini"],
    ["gemma2:2b"],
    ["qwen2.5:1.5b"],
    ["deepseek-r1:8b"],
    ["g-aid-orchestra"],
  ]) {
    const resolved = resolveRoleFromListed(names, "fast");
    assert.equal(resolved.ok, false, names.join(","));
  }
});

test("Thinking does not resolve Qwen or the Fast alias", () => {
  const resolved = resolveRoleFromListed(["g-aid-orchestra-fast", "qwen2.5:3b"], "thinking");
  assert.equal(resolved.ok, false);
});

test("Fast missing alias with exact Qwen base needs create of the Fast alias", () => {
  const resolved = resolveRoleFromListed(["qwen2.5:3b"], "fast");
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.model, "g-aid-orchestra-fast");
    assert.equal(resolved.needsCreate, true);
    assert.equal(resolved.role.base, "qwen2.5:3b");
  }
});

test("missing aliases fail clearly without fallback names", () => {
  const fast = resolveRoleFromListed([], "fast");
  const think = resolveRoleFromListed(["phi3:mini"], "thinking");
  assert.equal(fast.ok, false);
  assert.equal(think.ok, false);
  if (!fast.ok) {
    assert.match(fast.error, /g-aid-orchestra-fast/);
    assert.match(fast.error, /qwen2\.5:3b/);
    assert.match(fast.error, /will not substitute/);
    assert.doesNotMatch(fast.error, /\bllama3|phi3:mini|gemma2:2b|deepseek-r1:8b/);
  }
  if (!think.ok) {
    assert.match(think.error, /g-aid-orchestra(?!-fast)/);
    assert.match(think.error, /deepseek-r1:8b/);
  }
});

test("g-aid-orchestra does not match g-aid-orchestra-fast", () => {
  assert.equal(listedNameMatches(["g-aid-orchestra-fast"], "g-aid-orchestra"), false);
  assert.equal(listedNameMatches(["g-aid-orchestra"], "g-aid-orchestra-fast"), false);
  assert.equal(listedNameMatches(["g-aid-orchestra:latest"], "g-aid-orchestra"), true);
});

test("direct identity questions answer from the resolved role", () => {
  const fast = resolveRoleFromListed(["g-aid-orchestra-fast"], "fast");
  const think = resolveRoleFromListed(["g-aid-orchestra"], "thinking");
  assert.equal(classifyDirectQuestion("Are you DeepSeek?"), "who");
  assert.equal(classifyDirectQuestion("What model are you using?"), "which-model");
  assert.equal(classifyDirectQuestion("Did you actually process my data?"), "processed");
  assert.match(identityAnswer("who", think), /I'm G-AID\. This request used G-AID Orchestra, powered locally by DeepSeek\./);
  assert.match(identityAnswer("who", fast), /G-AID Orchestra Fast, powered locally by Qwen/);
  assert.match(identityAnswer("which-model", think), /g-aid-orchestra/);
  assert.match(identityAnswer("which-model", think), /deepseek-r1:8b/);
  assert.doesNotMatch(identityAnswer("who", think), /I am not DeepSeek/);
});

test("processed-data answers never claim chat completed a run", () => {
  const none = processedDataAnswer([]);
  assert.match(none, /No\./);
  assert.match(none, /Proceed/);
  assert.doesNotMatch(none, /I (ran|processed|finished) the (rtp|survey)/i);
  const cited = processedDataAnswer([{ runId: "r2026", productsRel: "G-AID Output/runs/r2026", status: "complete" }]);
  assert.match(cited, /Chat did not process/);
  assert.match(cited, /r2026/);
  assert.match(cited, /G-AID Output\/runs\/r2026/);
});

test("role prompts disclose models when asked and never deny being a model", () => {
  for (const prompt of [ORCHESTRA_SYSTEM, ORCHESTRA_FAST_SYSTEM]) {
    assert.match(prompt, /answer honestly/);
    assert.doesNotMatch(prompt, /Never call yourself Orchestra, a language model/);
    assert.doesNotMatch(prompt, /never say you are/i);
    assert.doesNotMatch(prompt, /I completed the processing/);
    assert.match(prompt, /Proceed/);
  }
  assert.match(ORCHESTRA_SYSTEM, /DeepSeek/);
  assert.match(ORCHESTRA_FAST_SYSTEM, /Qwen/);
});

test("packaged and unpackaged Modelfiles share the canonical role policy", () => {
  const ollama = fs.readFileSync(path.join(softwareRoot, "ollama", "Modelfile"), "utf8");
  const ollamaFast = fs.readFileSync(path.join(softwareRoot, "ollama", "Modelfile.fast"), "utf8");
  const res = fs.readFileSync(path.join(softwareRoot, "resources", "ai", "Modelfile"), "utf8");
  const resFast = fs.readFileSync(path.join(softwareRoot, "resources", "ai", "Modelfile.fast"), "utf8");
  assert.match(ollama, /FROM deepseek-r1:8b/);
  assert.match(ollamaFast, /FROM qwen2\.5:3b/);
  assert.equal(extractModelfileSystem(ollama), ORCHESTRA_SYSTEM);
  assert.equal(extractModelfileSystem(ollamaFast), ORCHESTRA_FAST_SYSTEM);
  assert.equal(extractModelfileSystem(res), ORCHESTRA_SYSTEM);
  assert.equal(extractModelfileSystem(resFast), ORCHESTRA_FAST_SYSTEM);
  assert.doesNotMatch(ollama, /Never call yourself Orchestra, a language model/);
  assert.doesNotMatch(ollamaFast, /You are Qwen, created by Alibaba/);
});

test("live routing, UI, and fallback sources keep alias names and drop silent substitutes", () => {
  const js = fs.readFileSync(path.join(softwareRoot, "src/lib/ollama-orchestra.ts"), "utf8");
  const plan = fs.readFileSync(path.join(softwareRoot, "src/app/api/agent/orchestrate/agent-plan.ts"), "utf8");
  const route = fs.readFileSync(path.join(softwareRoot, "src/app/api/agent/orchestrate/route.ts"), "utf8");
  const title = fs.readFileSync(path.join(softwareRoot, "src/app/api/agent/title/route.ts"), "utf8");
  const main = fs.readFileSync(path.join(softwareRoot, "electron/main.js"), "utf8");
  const ui = fs.readFileSync(path.join(softwareRoot, "src/lib/orchestra-mode.ts"), "utf8");
  const panel = fs.readFileSync(path.join(softwareRoot, "src/components/workspace/ai-panel.tsx"), "utf8");
  const activity = fs.readFileSync(path.join(softwareRoot, "src/components/workspace/agent-activity.tsx"), "utf8");
  const exec = fs.readFileSync(path.join(softwareRoot, "src/app/api/agent/execute-plan.ts"), "utf8");
  const py = fs.readFileSync(path.join(softwareRoot, "python/graph.py"), "utf8");

  assert.match(plan, /You are G-AID/);
  assert.doesNotMatch(plan, /Never call yourself Orchestra, a model/);
  assert.doesNotMatch(plan, /Never call yourself Orchestra, a language model/);

  assert.match(js, /ORCHESTRA_FAST_ALIAS/);
  assert.match(js, /ORCHESTRA_ALIAS/);
  assert.doesNotMatch(js, /FAST_BASES/);
  assert.doesNotMatch(js, /phi3:mini|llama3\.2:3b|gemma2:2b/);
  assert.doesNotMatch(js, /pushOrchestraSystemOnce/);
  assert.doesNotMatch(js, /hypothesesCreated/);
  assert.doesNotMatch(js, /computedByKernel: "g-aid-orchestra"/);
  assert.doesNotMatch(js, /if \(thinking\) send\(thinking\)/);

  assert.doesNotMatch(route, /proxyPython/);
  assert.match(title, /ORCHESTRA_FAST_ALIAS/);
  assert.doesNotMatch(title, /deepseek-r1:8b/);
  assert.doesNotMatch(title, /ORCHESTRA_ALIAS[^_]/);

  assert.match(main, /create", "g-aid-orchestra"/);
  assert.match(main, /create", "g-aid-orchestra-fast"/);
  assert.match(main, /alias already present/);

  assert.match(ui, new RegExp(PRODUCT_ORCHESTRA_FAST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(ui, new RegExp(`label: "${PRODUCT_ORCHESTRA}"`));
  assert.doesNotMatch(ui, /DeepSeek R1 for survey work/);

  assert.doesNotMatch(panel, /Thought for /);
  assert.doesNotMatch(panel, /epilogue\.thought/);
  assert.match(panel, /Reasoning summary/);
  assert.match(panel, /G-AID is reviewing the workspace/);
  assert.doesNotMatch(activity, /dispatching agents/);
  assert.match(activity, /G-AID is reviewing the workspace/);

  assert.doesNotMatch(exec, /agentId: "magnetic-agent"/);
  assert.doesNotMatch(py, /langgraph_routing/);
  assert.doesNotMatch(py, /confidence": 0\.95/);
  assert.match(py, /does not serve G-AID Orchestra chat/);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");

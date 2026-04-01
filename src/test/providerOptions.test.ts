import * as assert from "node:assert/strict";
import test from "node:test";
import { buildProviderArgs, customModelOptionValue, getProviderCapabilities, isCustomModelSelection } from "../core/providerOptions";

test("codex args include model and effort config", () => {
  const args = buildProviderArgs("codex", "Reply with OK.", true, {
    model: "gpt-5.4",
    effort: "high"
  });

  assert.deepEqual(args, [
    "exec",
    "--skip-git-repo-check",
    "--json",
    "-m",
    "gpt-5.4",
    "-c",
    "model_reasoning_effort=\"high\"",
    "Reply with OK."
  ]);
});

test("claude args include model and effort flags", () => {
  const args = buildProviderArgs("claude", "Reply with OK.", false, {
    model: "sonnet",
    effort: "max"
  });

  assert.deepEqual(args, [
    "--model",
    "sonnet",
    "--effort",
    "max",
    "-p",
    "Reply with OK."
  ]);
});

test("gemini args include model only", () => {
  const args = buildProviderArgs("gemini", "Reply with OK.", false, {
    model: "gemini-2.5-pro",
    effort: "high"
  });

  assert.deepEqual(args, [
    "-m",
    "gemini-2.5-pro",
    "-p",
    "Reply with OK.",
    "--output-format",
    "json"
  ]);
});

test("provider capabilities expose custom model option and gemini has no effort support", () => {
  const codex = getProviderCapabilities("codex");
  const gemini = getProviderCapabilities("gemini");

  assert.ok(codex.modelOptions.some((option) => option.value === customModelOptionValue));
  assert.equal(gemini.supportsEffort, false);
  assert.deepEqual(gemini.effortOptions, []);
});

test("custom model detection distinguishes curated options from typed ones", () => {
  assert.equal(isCustomModelSelection("claude", "sonnet"), false);
  assert.equal(isCustomModelSelection("claude", "claude-sonnet-4-6"), true);
});

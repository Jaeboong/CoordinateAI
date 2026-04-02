import * as assert from "node:assert/strict";
import test from "node:test";
import { ContextCompiler } from "../core/contextCompiler";
import { cleanupTempWorkspace, createStorage, createTempWorkspace } from "./helpers";

test("context compiler includes pinned and selected documents only", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject(
    "Shinhan Bank",
    "Backend",
    "검색 색인(Indexing) 및 데이터 처리 파이프라인 개발",
    "문제 해결 과정에서 원인을 논리적으로 분석하고 개선해 본 경험"
  );
  const compiler = new ContextCompiler(storage);

  const pinnedProfile = await storage.saveProfileTextDocument("Profile pinned", "Always include me", true);
  await storage.saveProfileTextDocument("Profile hidden", "Do not include me");
  const selectedProfile = await storage.saveProfileTextDocument("Profile selected", "Select me");

  const pinnedProject = await storage.saveProjectTextDocument(project.slug, "Project pinned", "Project default", true);
  await storage.saveProjectTextDocument(project.slug, "Project hidden", "Do not include me");
  const selectedProject = await storage.saveProjectTextDocument(project.slug, "Project selected", "Select me too");

  const compiled = await compiler.compile({
    project: await storage.getProject(project.slug),
    profileDocuments: await storage.listProfileDocuments(),
    projectDocuments: await storage.listProjectDocuments(project.slug),
    selectedDocumentIds: [selectedProfile.id, selectedProject.id],
    question: "Why this company?",
    draft: "Because I am interested."
  });

  assert.match(compiled.markdown, /Always include me/);
  assert.match(compiled.markdown, /Project default/);
  assert.match(compiled.markdown, /Select me/);
  assert.match(compiled.markdown, /## Main Responsibilities/);
  assert.match(compiled.markdown, /검색 색인\(Indexing\) 및 데이터 처리 파이프라인 개발/);
  assert.match(compiled.markdown, /## Qualifications/);
  assert.match(compiled.markdown, /문제 해결 과정에서 원인을 논리적으로 분석하고 개선해 본 경험/);
  assert.doesNotMatch(compiled.markdown, /Do not include me/);
  assert.ok(compiled.includedDocuments.some((document) => document.id === pinnedProfile.id));
  assert.ok(compiled.includedDocuments.some((document) => document.id === pinnedProject.id));
});

test("context compiler applies full, compact, and minimal prompt profiles", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Kurly", "Backend");
  const compiler = new ContextCompiler(storage);

  const documentBody = `핵심 요약 문장. ${"세부 근거 ".repeat(220)} COMPACT_TAIL_SHOULD_DISAPPEAR`;
  const draft = `도입 문장. ${"지원 동기와 경험 ".repeat(260)} DRAFT_TAIL_SHOULD_DISAPPEAR`;
  const profileDocument = await storage.saveProfileTextDocument("Profile digest", documentBody, true);

  const baseRequest = {
    project: await storage.getProject(project.slug),
    profileDocuments: await storage.listProfileDocuments(),
    projectDocuments: await storage.listProjectDocuments(project.slug),
    selectedDocumentIds: [profileDocument.id],
    question: "Why Kurly?",
    draft
  };

  const full = await compiler.compile({
    ...baseRequest,
    profile: "full"
  });
  const compact = await compiler.compile({
    ...baseRequest,
    profile: "compact"
  });
  const minimal = await compiler.compile({
    ...baseRequest,
    profile: "minimal"
  });

  assert.match(full.markdown, /COMPACT_TAIL_SHOULD_DISAPPEAR/);
  assert.match(full.markdown, /DRAFT_TAIL_SHOULD_DISAPPEAR/);

  assert.match(compact.markdown, /Prompt digest/);
  assert.doesNotMatch(compact.markdown, /COMPACT_TAIL_SHOULD_DISAPPEAR/);
  assert.match(compact.markdown, /## Current Draft/);

  assert.match(minimal.markdown, /## Current Draft Excerpt/);
  assert.match(minimal.markdown, /Document bodies omitted in minimal profile/);
  assert.doesNotMatch(minimal.markdown, /COMPACT_TAIL_SHOULD_DISAPPEAR/);
  assert.doesNotMatch(minimal.markdown, /DRAFT_TAIL_SHOULD_DISAPPEAR/);
});

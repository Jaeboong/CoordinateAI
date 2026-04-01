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

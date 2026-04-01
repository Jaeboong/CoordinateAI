import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import test from "node:test";
import { cleanupTempWorkspace, createStorage, createTempWorkspace, writeMinimalPdf, writeMinimalPptx, writePngPlaceholder, writeTextFile } from "./helpers";

test("storage imports text, pdf, pptx, and image documents", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);

  const textFile = await writeTextFile(workspaceRoot, "profile.txt", "Career summary");
  const pdfFile = await writeMinimalPdf(workspaceRoot, "resume.pdf", "Numbers and impact");
  const pptxFile = await writeMinimalPptx(workspaceRoot, "portfolio.pptx", ["Slide one", "Slide two"]);
  const imageFile = await writePngPlaceholder(workspaceRoot);

  const textDoc = await storage.importProfileFile(textFile, true);
  const pdfDoc = await storage.importProfileFile(pdfFile);
  const pptxDoc = await storage.importProfileFile(pptxFile);
  const imageDoc = await storage.importProfileFile(imageFile, false, "Screenshot of awards");

  assert.equal(textDoc.extractionStatus, "normalized");
  assert.ok(textDoc.normalizedPath);
  assert.equal(pdfDoc.extractionStatus, "normalized");
  assert.ok(pdfDoc.normalizedPath);
  assert.equal(pptxDoc.extractionStatus, "normalized");
  assert.ok(pptxDoc.normalizedPath);
  assert.equal(imageDoc.extractionStatus, "rawOnly");
  assert.equal(imageDoc.normalizedPath, null);
  assert.equal(imageDoc.note, "Screenshot of awards");
});

test("storage imports uploaded buffers for profile and project documents", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("CJ OliveNetworks");
  const textFile = await writeTextFile(workspaceRoot, "career.md", "# Career\nBuilt internal platforms.");
  const imageFile = await writePngPlaceholder(workspaceRoot);

  const textBytes = await fs.readFile(textFile);
  const imageBytes = await fs.readFile(imageFile);

  const profileDoc = await storage.importProfileUpload("career.md", textBytes, true);
  const projectDoc = await storage.importProjectUpload(project.slug, "awards.png", imageBytes, false, "Imported from picker");

  assert.equal(profileDoc.extractionStatus, "normalized");
  assert.ok(profileDoc.normalizedPath);
  assert.equal(projectDoc.extractionStatus, "rawOnly");
  assert.equal(projectDoc.note, "Imported from picker");
});

test("storage updates and deletes projects", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject(
    "CJ OliveNetworks",
    "Backend",
    "검색 시스템 아키텍처 설계 및 성능 개선 지원",
    "Linux 환경에 대한 기본 이해"
  );

  assert.equal(project.roleName, "Backend");
  assert.equal(project.mainResponsibilities, "검색 시스템 아키텍처 설계 및 성능 개선 지원");
  assert.equal(project.qualifications, "Linux 환경에 대한 기본 이해");

  const updated = await storage.updateProjectInfo(
    project.slug,
    "CJ OliveNetworks DX",
    "AI Engineer",
    "검색 품질 향상을 위한 데이터 분석 및 개선 과제 수행",
    "문제 해결 과정에서 원인을 논리적으로 분석하고 개선해 본 경험"
  );
  assert.equal(updated.slug, project.slug);
  assert.equal(updated.companyName, "CJ OliveNetworks DX");
  assert.equal(updated.roleName, "AI Engineer");
  assert.equal(updated.mainResponsibilities, "검색 품질 향상을 위한 데이터 분석 및 개선 과제 수행");
  assert.equal(updated.qualifications, "문제 해결 과정에서 원인을 논리적으로 분석하고 개선해 본 경험");

  await storage.deleteProject(project.slug);
  await assert.rejects(() => storage.getProject(project.slug));
});

test("storage updates and deletes project documents", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Line");
  const document = await storage.saveProjectTextDocument(project.slug, "Company Notes", "initial body", true, "draft note");

  const updated = await storage.updateProjectDocument(project.slug, document.id, {
    title: "Updated Company Notes",
    note: "refined note",
    pinnedByDefault: false,
    content: "refined body"
  });

  assert.equal(updated.title, "Updated Company Notes");
  assert.equal(updated.note, "refined note");
  assert.equal(updated.pinnedByDefault, false);
  assert.equal(await storage.readDocumentRawContent(updated), "refined body");

  const refreshedProject = await storage.getProject(project.slug);
  assert.equal(refreshedProject.pinnedDocumentIds.includes(document.id), false);

  await storage.deleteProjectDocument(project.slug, document.id);
  await assert.rejects(() => storage.getProjectDocument(project.slug, document.id));
});

test("storage persists the last selected review mode preference", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  await storage.setLastReviewMode("realtime");

  const preferences = await storage.getPreferences();
  assert.equal(preferences.lastReviewMode, "realtime");
});

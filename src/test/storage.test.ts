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
  const project = await storage.createProject({
    companyName: "CJ OliveNetworks",
    roleName: "Backend",
    mainResponsibilities: "검색 시스템 아키텍처 설계 및 성능 개선 지원",
    qualifications: "Linux 환경에 대한 기본 이해",
    preferredQualifications: "Spring 기반 서비스 운영 경험",
    keywords: ["Java", "Spring Boot"],
    jobPostingUrl: "https://example.com/jobs/olive",
    essayQuestions: ["왜 지원했는지 작성해주세요."]
  });

  assert.equal(project.roleName, "Backend");
  assert.equal(project.mainResponsibilities, "검색 시스템 아키텍처 설계 및 성능 개선 지원");
  assert.equal(project.qualifications, "Linux 환경에 대한 기본 이해");
  assert.equal(project.preferredQualifications, "Spring 기반 서비스 운영 경험");
  assert.deepEqual(project.keywords, ["Java", "Spring Boot"]);
  assert.equal(project.jobPostingUrl, "https://example.com/jobs/olive");
  assert.deepEqual(project.essayQuestions, ["왜 지원했는지 작성해주세요."]);

  const updated = await storage.updateProjectInfo(project.slug, {
    companyName: "CJ OliveNetworks DX",
    roleName: "AI Engineer",
    mainResponsibilities: "검색 품질 향상을 위한 데이터 분석 및 개선 과제 수행",
    qualifications: "문제 해결 과정에서 원인을 논리적으로 분석하고 개선해 본 경험",
    preferredQualifications: "대규모 데이터 파이프라인 경험",
    keywords: ["Python", "Airflow"],
    jobPostingText: "주요 업무\n데이터 분석 및 개선",
    essayQuestions: ["어떤 문제를 해결했는지 작성해주세요."]
  });
  assert.equal(updated.slug, project.slug);
  assert.equal(updated.companyName, "CJ OliveNetworks DX");
  assert.equal(updated.roleName, "AI Engineer");
  assert.equal(updated.mainResponsibilities, "검색 품질 향상을 위한 데이터 분석 및 개선 과제 수행");
  assert.equal(updated.qualifications, "문제 해결 과정에서 원인을 논리적으로 분석하고 개선해 본 경험");
  assert.equal(updated.preferredQualifications, "대규모 데이터 파이프라인 경험");
  assert.deepEqual(updated.keywords, ["Python", "Airflow"]);
  assert.equal(updated.jobPostingText, "주요 업무\n데이터 분석 및 개선");
  assert.deepEqual(updated.essayQuestions, ["어떤 문제를 해결했는지 작성해주세요."]);

  await storage.deleteProject(project.slug);
  await assert.rejects(() => storage.getProject(project.slug));
});

test("storage can create a project from job posting inputs before company extraction", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject({
    companyName: "",
    jobPostingUrl: "https://careers.example.com/jobs/java-backend",
    essayQuestions: ["지원 동기를 작성해주세요."]
  });

  assert.equal(project.companyName, "careers");
  assert.equal(project.jobPostingUrl, "https://careers.example.com/jobs/java-backend");
  assert.deepEqual(project.essayQuestions, ["지원 동기를 작성해주세요."]);

  const updated = await storage.updateProjectInfo(project.slug, {
    companyName: "에코마케팅",
    roleName: "Java Backend",
    qualifications: "Java, Spring Boot"
  });

  assert.equal(updated.companyName, "에코마케팅");
  assert.equal(updated.roleName, "Java Backend");
  assert.equal(updated.qualifications, "Java, Spring Boot");
});

test("storage upserts generated insight documents and insight json artifacts", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Eco Marketing");

  const first = await storage.saveOrUpdateProjectGeneratedDocument(
    project.slug,
    "company-insight.md",
    "# Company Insight\nVersion 1",
    "generated",
    true
  );
  const second = await storage.saveOrUpdateProjectGeneratedDocument(
    project.slug,
    "company-insight.md",
    "# Company Insight\nVersion 2",
    "generated again",
    true
  );

  assert.equal(first.id, second.id);
  assert.match((await storage.readDocumentRawContent(second)) || "", /Version 2/);

  const documents = await storage.listProjectDocuments(project.slug);
  assert.equal(documents.filter((document) => document.title === "company-insight.md").length, 1);
  const refreshedProject = await storage.getProject(project.slug);
  assert.ok(refreshedProject.pinnedDocumentIds.includes(first.id));

  const jsonPath = await storage.saveProjectInsightJson(project.slug, "job-extraction.json", {
    companyName: "Eco Marketing",
    keywords: ["Java"]
  });
  const savedJson = await storage.readProjectInsightJson(project.slug, "job-extraction.json");

  assert.match(jsonPath, /job-extraction\.json$/);
  assert.deepEqual(savedJson, {
    companyName: "Eco Marketing",
    keywords: ["Java"]
  });
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

test("storage saves completed essay answers as pinned project documents and updates them in place", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject({
    companyName: "Line",
    essayQuestions: ["지원 동기를 작성해주세요.", "협업 경험을 작성해주세요."]
  });

  const firstSave = await storage.saveCompletedEssayAnswer(
    project.slug,
    0,
    "지원 동기를 작성해주세요.",
    "첫 번째 답안",
    "run-1"
  );
  const updatedSave = await storage.saveCompletedEssayAnswer(
    project.slug,
    0,
    "지원 동기를 작성해주세요.",
    "수정된 답안",
    "run-2"
  );

  assert.equal(firstSave.document.title, "essay-answer-q1.md");
  assert.match(firstSave.document.note || "", /지원 동기를 작성해주세요/);
  assert.equal(firstSave.document.id, updatedSave.document.id);
  assert.equal(await storage.readDocumentRawContent(updatedSave.document), "수정된 답안");

  const refreshedProject = await storage.getProject(project.slug);
  assert.equal(refreshedProject.essayAnswerStates?.length, 1);
  assert.deepEqual(refreshedProject.essayAnswerStates?.[0], {
    questionIndex: 0,
    status: "completed",
    documentId: updatedSave.document.id,
    completedAt: refreshedProject.essayAnswerStates?.[0]?.completedAt,
    lastRunId: "run-2"
  });
  assert.ok(refreshedProject.pinnedDocumentIds.includes(updatedSave.document.id));
});

test("storage reconciles completed answer metadata when project questions change", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject({
    companyName: "Kurly",
    essayQuestions: ["지원 동기를 작성해주세요.", "협업 경험을 작성해주세요."]
  });

  const firstAnswer = await storage.saveCompletedEssayAnswer(
    project.slug,
    0,
    "지원 동기를 작성해주세요.",
    "첫 번째 답안"
  );
  const secondAnswer = await storage.saveCompletedEssayAnswer(
    project.slug,
    1,
    "협업 경험을 작성해주세요.",
    "두 번째 답안"
  );

  const updatedProject = await storage.updateProjectInfo(project.slug, {
    companyName: "Kurly",
    essayQuestions: ["협업 경험을 작성해주세요."]
  });
  const documents = await storage.listProjectDocuments(project.slug);

  assert.deepEqual(updatedProject.essayQuestions, ["협업 경험을 작성해주세요."]);
  assert.equal(updatedProject.essayAnswerStates?.length, 1);
  assert.equal(updatedProject.essayAnswerStates?.[0]?.questionIndex, 0);
  assert.equal(updatedProject.essayAnswerStates?.[0]?.documentId, secondAnswer.document.id);
  assert.equal(updatedProject.pinnedDocumentIds.includes(firstAnswer.document.id), false);
  assert.equal(
    documents.find((document) => document.id === firstAnswer.document.id)?.pinnedByDefault,
    false
  );
});

test("storage persists the last selected review mode preference", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  await storage.setLastReviewMode("realtime");

  const preferences = await storage.getPreferences();
  assert.equal(preferences.lastReviewMode, "realtime");
});

test("storage loads profile document preview from normalized content before raw fallback", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const textDocument = await storage.saveProfileTextDocument("Career Summary", "raw summary", true, "핵심");
  const refreshedTextDocument = await storage.getProfileDocument(textDocument.id);
  const normalizedPreview = await storage.readDocumentPreviewContent(refreshedTextDocument);

  assert.equal(normalizedPreview.previewSource, "normalized");
  assert.equal(normalizedPreview.content, "raw summary");

  const imageFile = await writePngPlaceholder(workspaceRoot);
  const imageDocument = await storage.importProfileFile(imageFile, false, "screenshot");
  const refreshedImageDocument = await storage.getProfileDocument(imageDocument.id);
  const missingPreview = await storage.readDocumentPreviewContent(refreshedImageDocument);

  assert.equal(missingPreview.previewSource, "none");
  assert.equal(missingPreview.content, "");
});

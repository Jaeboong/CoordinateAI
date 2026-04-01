import * as assert from "node:assert/strict";
import test from "node:test";
import { ExtensionToWebviewMessageSchema, WebviewToExtensionMessageSchema } from "../core/webviewProtocol";

test("webview message schema rejects invalid payloads", () => {
  assert.throws(
    () => WebviewToExtensionMessageSchema.parse({
      type: "runReview",
      projectSlug: "alpha",
      question: "question",
      draft: "draft",
      reviewMode: "deepFeedback",
      coordinatorProvider: "unknown",
      reviewerProviders: ["claude"],
      rounds: 1,
      selectedDocumentIds: []
    }),
    /Invalid enum value/
  );

  assert.throws(
    () => WebviewToExtensionMessageSchema.parse({
      type: "uploadProjectFiles",
      files: [{ fileName: "resume.txt", contentBase64: "ZGF0YQ==" }]
    }),
    /projectSlug/
  );
});

test("webview message schema accepts review mode on run and continuation payloads", () => {
  const runMessage = WebviewToExtensionMessageSchema.parse({
    type: "runReview",
    projectSlug: "alpha",
    question: "question",
    draft: "draft",
    reviewMode: "realtime",
    coordinatorProvider: "claude",
    reviewerProviders: ["codex", "codex"],
    rounds: 1,
    selectedDocumentIds: []
  });

  assert.equal(runMessage.type, "runReview");
  assert.equal(runMessage.reviewMode, "realtime");
  assert.deepEqual(runMessage.reviewerProviders, ["codex", "codex"]);

  const continuationMessage = ExtensionToWebviewMessageSchema.parse({
    type: "continuationPreset",
    payload: {
      projectSlug: "alpha",
      runId: "run-1",
      question: "question",
      draft: "draft",
      reviewMode: "deepFeedback",
      notionRequest: "",
      coordinatorProvider: "claude",
      reviewerProviders: ["codex", "gemini"],
      selectedDocumentIds: []
    }
  });

  assert.equal(continuationMessage.type, "continuationPreset");
  assert.equal(continuationMessage.payload.reviewMode, "deepFeedback");

  const continueMessage = WebviewToExtensionMessageSchema.parse({
    type: "continueRunDiscussion",
    projectSlug: "alpha",
    runId: "run-1",
    message: "이 final draft에서 협업 문단만 더 날카롭게 다듬어줘"
  });

  assert.equal(continueMessage.type, "continueRunDiscussion");
  assert.equal(continueMessage.runId, "run-1");
});

test("webview message schema accepts structured project fields", () => {
  const createProjectMessage = WebviewToExtensionMessageSchema.parse({
    type: "createProject",
    companyName: "g마켓",
    roleName: "검색 엔진 및 Backend 개발 및 운영",
    mainResponsibilities: "검색 색인(Indexing) 및 데이터 처리 파이프라인 개발",
    qualifications: "자료구조, 운영체제, 네트워크 등 CS 기초 지식에 대한 이해도 보유"
  });

  assert.equal(createProjectMessage.type, "createProject");
  assert.equal(createProjectMessage.roleName, "검색 엔진 및 Backend 개발 및 운영");
  assert.equal(createProjectMessage.mainResponsibilities, "검색 색인(Indexing) 및 데이터 처리 파이프라인 개발");
  assert.equal(createProjectMessage.qualifications, "자료구조, 운영체제, 네트워크 등 CS 기초 지식에 대한 이해도 보유");

  const updateProjectMessage = WebviewToExtensionMessageSchema.parse({
    type: "updateProjectInfo",
    projectSlug: "gmarket-search",
    companyName: "g마켓",
    roleName: "검색 엔진 및 Backend 개발 및 운영",
    mainResponsibilities: "검색 품질 향상을 위한 데이터 분석 및 개선 과제 수행",
    qualifications: "문제 해결 과정에서 원인을 논리적으로 분석하고 개선해 본 경험"
  });

  assert.equal(updateProjectMessage.type, "updateProjectInfo");
  assert.equal(updateProjectMessage.projectSlug, "gmarket-search");
  assert.equal(updateProjectMessage.mainResponsibilities, "검색 품질 향상을 위한 데이터 분석 및 개선 과제 수행");
  assert.equal(updateProjectMessage.qualifications, "문제 해결 과정에서 원인을 논리적으로 분석하고 개선해 본 경험");
});

test("extension message schema requires typed sidebar state payload", () => {
  assert.throws(
    () => ExtensionToWebviewMessageSchema.parse({
      type: "state",
      payload: {
        workspaceOpened: true,
        providers: [],
        profileDocuments: [],
        projects: [],
        preferences: {},
        defaultRubric: "- fit"
      }
    }),
    /runState/
  );
});

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

test("extension message schema accepts discussion ledger events and artifact flags", () => {
  const ledgerEvent = ExtensionToWebviewMessageSchema.parse({
    type: "runEvent",
    payload: {
      timestamp: "2026-04-02T00:00:00.000Z",
      type: "discussion-ledger-updated",
      providerId: "claude",
      participantId: "coordinator",
      participantLabel: "Claude coordinator",
      round: 2,
      speakerRole: "coordinator",
      message: "성과 문장을 먼저 수습합니다.",
      discussionLedger: {
        currentFocus: "성과 문장을 먼저 수습합니다.",
        miniDraft: "결제 안정화 경험을 문장 앞에 배치합니다.",
        acceptedDecisions: ["성과 수치를 앞단에 둔다"],
        openChallenges: ["회사 적합도 근거가 아직 약하다"],
        deferredChallenges: ["마지막 포부 문단을 더 구체화한다"],
        targetSection: "지원 동기 1문단",
        updatedAtRound: 2
      }
    }
  });

  assert.equal(ledgerEvent.type, "runEvent");
  assert.equal(ledgerEvent.payload.type, "discussion-ledger-updated");
  assert.equal(ledgerEvent.payload.discussionLedger?.targetSection, "지원 동기 1문단");

  const stateMessage = ExtensionToWebviewMessageSchema.parse({
    type: "state",
    payload: {
      workspaceOpened: true,
      providers: [],
      profileDocuments: [],
      projects: [
        {
          record: {
            projectSlug: "alpha",
            slug: "alpha",
            companyName: "Alpha",
            rubric: "- fit",
            pinnedDocumentIds: [],
            createdAt: "2026-04-02T00:00:00.000Z",
            updatedAt: "2026-04-02T00:00:00.000Z"
          },
          documents: [],
          runs: [
            {
              record: {
                id: "run-1",
                projectSlug: "alpha",
                question: "question",
                draft: "draft",
                reviewMode: "realtime",
                coordinatorProvider: "claude",
                reviewerProviders: ["codex"],
                rounds: 2,
                selectedDocumentIds: [],
                status: "completed",
                startedAt: "2026-04-02T00:00:00.000Z"
              },
              artifacts: {
                summary: false,
                improvementPlan: false,
                revisedDraft: true,
                discussionLedger: true,
                promptMetrics: false,
                notionBrief: false,
                chatMessages: false,
                events: true
              }
            }
          ]
        }
      ],
      preferences: {},
      runState: { status: "idle" },
      defaultRubric: "- fit"
    }
  });

  assert.equal(stateMessage.type, "state");
  assert.equal(stateMessage.payload.projects[0]?.runs[0]?.artifacts.discussionLedger, true);
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

  const previewRequest = WebviewToExtensionMessageSchema.parse({
    type: "openProfileDocumentPreview",
    documentId: "doc-1"
  });
  assert.equal(previewRequest.type, "openProfileDocumentPreview");

  const previewMessage = ExtensionToWebviewMessageSchema.parse({
    type: "profileDocumentPreview",
    payload: {
      documentId: "doc-1",
      title: "경력 요약",
      note: "핵심 버전",
      sourceType: "md",
      extractionStatus: "normalized",
      rawPath: ".forjob/profile/raw/career.txt",
      normalizedPath: ".forjob/profile/normalized/career.md",
      previewSource: "normalized",
      content: "# Career"
    }
  });
  assert.equal(previewMessage.type, "profileDocumentPreview");
  assert.equal(previewMessage.payload.previewSource, "normalized");
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

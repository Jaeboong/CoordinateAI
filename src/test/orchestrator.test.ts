import * as assert from "node:assert/strict";
import test from "node:test";
import { ContextCompiler } from "../core/contextCompiler";
import { OrchestratorGateway, ReviewOrchestrator } from "../core/orchestrator";
import { getProviderCapabilities } from "../core/providerOptions";
import { ProviderRuntimeState, RunEvent } from "../core/types";
import { cleanupTempWorkspace, createStorage, createTempWorkspace } from "./helpers";

class FakeGateway implements OrchestratorGateway {
  public readonly calls: Array<{
    providerId: ProviderRuntimeState["providerId"];
    prompt: string;
    round?: number;
    messageScope?: string;
    participantId?: string;
    participantLabel?: string;
  }> = [];

  constructor(
    private readonly states: ProviderRuntimeState[],
    private readonly responder: (
      providerId: ProviderRuntimeState["providerId"],
      prompt: string,
      round?: number,
      options?: {
        round?: number;
        speakerRole?: "reviewer" | "coordinator";
        messageScope?: string;
        participantId?: string;
        participantLabel?: string;
        onEvent?: (event: RunEvent) => Promise<void> | void;
      }
    ) => string | Error,
    private readonly streamer?: (
      providerId: ProviderRuntimeState["providerId"],
      prompt: string,
      options: {
        round?: number;
        speakerRole?: "reviewer" | "coordinator";
        messageScope?: string;
        participantId?: string;
        participantLabel?: string;
        onEvent?: (event: RunEvent) => Promise<void> | void;
      }
    ) => Promise<void> | void
  ) {}

  async listRuntimeStates(): Promise<ProviderRuntimeState[]> {
    return this.states;
  }

  async getApiKey(): Promise<string | undefined> {
    return undefined;
  }

  async execute(
    providerId: ProviderRuntimeState["providerId"],
    prompt: string,
    options: {
      round?: number;
      speakerRole?: "reviewer" | "coordinator";
      messageScope?: string;
      participantId?: string;
      participantLabel?: string;
      onEvent?: (event: RunEvent) => Promise<void> | void;
    }
  ): Promise<{ text: string; stdout: string; stderr: string; exitCode: number }> {
    this.calls.push({
      providerId,
      prompt,
      round: options.round,
      messageScope: options.messageScope,
      participantId: options.participantId,
      participantLabel: options.participantLabel
    });
    if (this.streamer) {
      await this.streamer(providerId, prompt, options);
    }
    const response = this.responder(providerId, prompt, options.round, options);
    if (response instanceof Error) {
      throw response;
    }

    return {
      text: response,
      stdout: response,
      stderr: "",
      exitCode: 0
    };
  }
}

function healthyStates(): ProviderRuntimeState[] {
  return [
    { providerId: "codex", command: "codex", installed: true, authMode: "cli", authStatus: "healthy", hasApiKey: false, capabilities: getProviderCapabilities("codex") },
    { providerId: "claude", command: "claude", installed: true, authMode: "cli", authStatus: "healthy", hasApiKey: false, capabilities: getProviderCapabilities("claude") },
    { providerId: "gemini", command: "gemini", installed: true, authMode: "cli", authStatus: "healthy", hasApiKey: false, capabilities: getProviderCapabilities("gemini") }
  ];
}

function buildRealtimeLedgerResponse(options: {
  currentFocus: string;
  targetSection?: string;
  miniDraft: string;
  acceptedDecisions?: string[];
  openChallenges?: string[];
}): string {
  return [
    "## Current Focus",
    options.currentFocus,
    "",
    "## Target Section",
    options.targetSection || "핵심 문단",
    "",
    "## Mini Draft",
    options.miniDraft,
    "",
    "## Accepted Decisions",
    ...(options.acceptedDecisions && options.acceptedDecisions.length > 0 ? options.acceptedDecisions.map((item) => `- ${item}`) : ["- 없음"]),
    "",
    "## Open Challenges",
    ...(options.openChallenges && options.openChallenges.length > 0 ? options.openChallenges.map((item) => `- ${item}`) : ["- 없음"])
  ].join("\n");
}

test("orchestrator completes a run, writes artifacts, and remembers the coordinator", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Shinhan Bank");
  await storage.saveProfileTextDocument("Career", "Five years of fintech work", true);
  await storage.saveProjectTextDocument(project.slug, "Posting", "Risk platform ownership", true);

  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId) => {
    if (providerId === "claude") {
      return ["## Summary", "Strong draft with room for sharper evidence.", "## Improvement Plan", "- Add quantified outcomes.", "## Revised Draft", "Rewritten essay"].join("\n");
    }

    return ["## Overall Verdict", "Solid base", "## Strengths", "- Clear motivation", "## Problems", "- Missing metrics", "## Suggestions", "- Add numbers", "## Direct Responses To Other Reviewers", "- None"].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  const events: RunEvent[] = [];
  const result = await orchestrator.run(
    {
      projectSlug: project.slug,
      question: "Why Shinhan Bank?",
      draft: "I want to join because I like finance.",
      reviewMode: "deepFeedback",
      coordinatorProvider: "claude",
      reviewerProviders: ["codex", "gemini"],
      rounds: 2,
      selectedDocumentIds: []
    },
    async (event) => {
      events.push(event);
    }
  );

  assert.equal(result.run.status, "completed");
  assert.equal(result.artifacts.revisedDraft, "Rewritten essay");
  const summary = await storage.readOptionalRunArtifact(project.slug, result.run.id, "summary.md");
  const improvementPlan = await storage.readOptionalRunArtifact(project.slug, result.run.id, "improvement-plan.md");
  const revisedDraft = await storage.readOptionalRunArtifact(project.slug, result.run.id, "revised-draft.md");
  assert.ok(summary);
  assert.ok(improvementPlan);
  assert.ok(revisedDraft);
  assert.match(summary, /Strong draft/);
  assert.match(improvementPlan, /quantified outcomes/);
  assert.match(revisedDraft, /Rewritten essay/);
  assert.equal((await storage.getPreferences()).lastCoordinatorProvider, "claude");
  assert.equal((await storage.getPreferences()).lastReviewMode, "deepFeedback");
  assert.ok(events.some((event) => event.type === "run-completed"));
});

test("orchestrator continues after one reviewer fails while another remains", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Kakao");
  await storage.saveProfileTextDocument("Career", "Built internal tools", true);

  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId, _prompt, round) => {
    if (providerId === "gemini" && round === 1) {
      return new Error("Gemini failed in round 1");
    }
    if (providerId === "claude") {
      return ["## Summary", "Coordinator summary", "## Improvement Plan", "- Tighten opening", "## Revised Draft", "Updated draft"].join("\n");
    }
    return ["## Overall Verdict", "Useful", "## Strengths", "- Specific", "## Problems", "- Long intro", "## Suggestions", "- Trim intro", "## Direct Responses To Other Reviewers", "- Agree"].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  const result = await orchestrator.run({
    projectSlug: project.slug,
    question: "Why Kakao?",
    draft: "I enjoy platform engineering.",
    reviewMode: "deepFeedback",
    coordinatorProvider: "claude",
    reviewerProviders: ["codex", "gemini"],
    rounds: 1,
    selectedDocumentIds: []
  });

  assert.equal(result.run.status, "completed");
  assert.ok(result.turns.some((turn) => turn.providerId === "gemini" && turn.status === "failed"));
  assert.ok(result.turns.some((turn) => turn.providerId === "codex" && turn.status === "completed"));
});

test("orchestrator rejects runs with unhealthy selected participants", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Naver");
  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(
    [
      { providerId: "codex", command: "codex", installed: true, authMode: "cli", authStatus: "healthy", hasApiKey: false, capabilities: getProviderCapabilities("codex") },
      { providerId: "claude", command: "claude", installed: true, authMode: "cli", authStatus: "untested", hasApiKey: false, capabilities: getProviderCapabilities("claude") }
    ],
    () => "unused"
  );

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  await assert.rejects(() =>
    orchestrator.run({
      projectSlug: project.slug,
      question: "Why Naver?",
      draft: "Draft",
      reviewMode: "deepFeedback",
      coordinatorProvider: "codex",
      reviewerProviders: ["claude"],
      rounds: 1,
      selectedDocumentIds: []
    })
  );
});

test("orchestrator runs a coordinator notion pre-pass and shares the notion brief with reviewers", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("CJ OliveNetworks");
  await storage.saveProfileTextDocument("Career", "Built commerce and platform products", true);

  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId, _prompt, round) => {
    if (providerId === "claude" && round === 0) {
      return [
        "## Resolution",
        "Confident match with the CJ OliveNetworks hiring notes page.",
        "## Notion Brief",
        "CJ OliveNetworks focuses on commerce, DX, and platform delivery. Emphasize measurable collaboration and implementation ownership.",
        "## Sources Considered",
        "- CJ OliveNetworks hiring notes",
        "- CJ OliveNetworks interview notes"
      ].join("\n");
    }

    if (providerId === "claude") {
      return ["## Summary", "Use the brief well.", "## Improvement Plan", "- Reflect the platform and DX angle.", "## Revised Draft", "Updated final essay"].join("\n");
    }

    return ["## Overall Verdict", "Useful", "## Strengths", "- Concrete motivation", "## Problems", "- Needs more company alignment", "## Suggestions", "- Mention DX and platform ownership", "## Direct Responses To Other Reviewers", "- Agree"].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  const result = await orchestrator.run({
    projectSlug: project.slug,
    question: "Why CJ OliveNetworks?",
    draft: "I want to join because I like building services.",
    reviewMode: "deepFeedback",
    notionRequest: "CJ 올리브네트웍스 페이지 가져와서 파악해",
    coordinatorProvider: "claude",
    reviewerProviders: ["codex", "gemini"],
    rounds: 1,
    selectedDocumentIds: []
  });

  const notionArtifact = await storage.readOptionalRunArtifact(project.slug, result.run.id, "notion-brief.md");
  assert.ok(notionArtifact);
  assert.match(notionArtifact, /## Notion Brief/);
  assert.match(result.run.notionRequest ?? "", /CJ 올리브네트웍스/);
  assert.match(result.run.notionBrief ?? "", /commerce, DX, and platform delivery/i);

  const notionCall = gateway.calls.find((call) => call.providerId === "claude" && call.round === 0);
  assert.ok(notionCall);
  assert.match(notionCall.prompt, /use your configured Notion MCP tools/i);

  const reviewerCalls = gateway.calls.filter(
    (call) => call.round === 1 && call.providerId !== "claude"
  );
  assert.equal(reviewerCalls.length, 2);
  assert.ok(reviewerCalls.every((call) => /## Notion Brief/.test(call.prompt)));
  assert.ok(reviewerCalls.every((call) => /Do not search Notion/.test(call.prompt)));
});

test("orchestrator skips notion pre-pass for punctuation-only notion requests without fixed pages", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Naver");
  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId, _prompt, round) => {
    if (providerId === "claude" && round === 0) {
      return [
        "## Resolution",
        "노션 확인",
        "## Notion Brief",
        "노션 브리프",
        "## Sources Considered",
        "- 페이지"
      ].join("\n");
    }

    if (providerId === "claude") {
      return ["## Summary", "Coordinator summary", "## Improvement Plan", "- Tighten examples", "## Revised Draft", "Updated draft"].join("\n");
    }

    return ["## Overall Verdict", "Useful", "## Strengths", "- Clear", "## Problems", "- Needs evidence", "## Suggestions", "- Add numbers", "## Direct Responses To Other Reviewers", "- Agree"].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);

  await orchestrator.run({
    projectSlug: project.slug,
    question: "Why Naver?",
    draft: "검색과 플랫폼 문제를 풀고 싶습니다.",
    reviewMode: "deepFeedback",
    notionRequest: ".",
    coordinatorProvider: "claude",
    reviewerProviders: ["codex"],
    rounds: 1,
    selectedDocumentIds: []
  });

  assert.equal(
    gateway.calls.some((call) => call.providerId === "claude" && call.round === 0),
    false
  );

  await orchestrator.run({
    projectSlug: project.slug,
    question: "Why Naver?",
    draft: "검색과 플랫폼 문제를 풀고 싶습니다.",
    reviewMode: "deepFeedback",
    notionRequest: "네이버 관련 노션 페이지를 찾아줘",
    coordinatorProvider: "claude",
    reviewerProviders: ["codex"],
    rounds: 1,
    selectedDocumentIds: []
  });

  assert.equal(
    gateway.calls.some((call) => call.providerId === "claude" && call.round === 0 && /## User Notion Request/.test(call.prompt)),
    true
  );
});

test("orchestrator carries previous run context into a continuation run", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Bucketplace");
  await storage.saveProfileTextDocument("Career", "Built user-facing platform features", true);

  await storage.createRun({
    id: "prior-run",
    projectSlug: project.slug,
    question: "Why Bucketplace?",
    draft: "기존 초안",
    reviewMode: "deepFeedback",
    notionRequest: "버킷플레이스 자료 찾아줘",
    coordinatorProvider: "claude",
    reviewerProviders: ["codex", "gemini"],
    rounds: 1,
    selectedDocumentIds: [],
    status: "completed",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString()
  });
  await storage.saveRunTextArtifact(project.slug, "prior-run", "summary.md", "이전 요약");
  await storage.saveRunTextArtifact(project.slug, "prior-run", "improvement-plan.md", "- 협업을 더 강조");
  await storage.saveRunTextArtifact(project.slug, "prior-run", "revised-draft.md", "이전 수정 초안");
  await storage.saveRunTextArtifact(project.slug, "prior-run", "notion-brief.md", "이전 노션 브리프");
  await storage.saveRunChatMessages(project.slug, "prior-run", [
    {
      id: "chat-1",
      providerId: "claude",
      speaker: "Claude",
      speakerRole: "coordinator",
      recipient: "You",
      round: 2,
      content: "협업과 사용자 관점을 더 드러내면 좋겠습니다.",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "completed"
    }
  ]);

  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId) => {
    if (providerId === "claude") {
      return ["## Summary", "Coordinator summary", "## Improvement Plan", "- Keep the collaboration angle", "## Revised Draft", "Updated draft"].join("\n");
    }
    return ["## Overall Verdict", "Useful", "## Strengths", "- Good continuation", "## Problems", "- Need sharper closing", "## Suggestions", "- Keep collaboration central", "## Direct Responses To Other Reviewers", "- Agree"].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  const events: RunEvent[] = [];
  const result = await orchestrator.run({
    projectSlug: project.slug,
    question: "Why Bucketplace now?",
    draft: "새 초안",
    reviewMode: "deepFeedback",
    continuationFromRunId: "prior-run",
    continuationNote: "이전 논의를 이어서 협업 강조 방향으로 더 다듬어줘",
    coordinatorProvider: "claude",
    reviewerProviders: ["codex", "gemini"],
    rounds: 1,
    selectedDocumentIds: []
  }, async (event) => {
    events.push(event);
  });

  assert.equal(result.run.continuationFromRunId, "prior-run");
  assert.match(result.run.continuationNote ?? "", /협업 강조/);

  const reviewerPrompt = gateway.calls.find((call) => call.providerId === "codex" && call.round === 1);
  assert.ok(reviewerPrompt);
  assert.match(reviewerPrompt.prompt, /## Previous Run Context/);
  assert.match(reviewerPrompt.prompt, /## User Guidance/);
  assert.match(reviewerPrompt.prompt, /Before Start/);
  assert.match(reviewerPrompt.prompt, /이전 요약/);
  assert.match(reviewerPrompt.prompt, /이전 수정 초안/);
  assert.match(reviewerPrompt.prompt, /협업과 사용자 관점을 더 드러내면 좋겠습니다/);
  assert.match(reviewerPrompt.prompt, /이전 논의를 이어서 협업 강조 방향으로 더 다듬어줘/);
  assert.equal(reviewerPrompt.participantId, "reviewer-1");
  assert.match(reviewerPrompt.messageScope ?? "", new RegExp(`run-${result.run.id}-deep-cycle-1-reviewer-reviewer-1`));

  const userContinuationDelta = events.find((event) =>
    event.type === "chat-message-delta" &&
    event.speakerRole === "user" &&
    event.message?.includes("협업 강조 방향")
  );
  assert.ok(userContinuationDelta);
});

test("continuation note that mentions notion triggers a fresh notion pre-pass and is treated as latest user guidance", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Shinhan Bank");
  await storage.saveProfileTextDocument("Career", "Built backend systems", true);

  await storage.createRun({
    id: "prior-run",
    projectSlug: project.slug,
    question: "왜 신한은행인가?",
    draft: "기존 초안",
    reviewMode: "deepFeedback",
    notionRequest: "이전 노션 요청",
    coordinatorProvider: "claude",
    reviewerProviders: ["codex", "gemini"],
    rounds: 1,
    selectedDocumentIds: [],
    status: "completed",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString()
  });
  await storage.saveRunTextArtifact(project.slug, "prior-run", "revised-draft.md", "이전 수정 초안");
  await storage.saveRunTextArtifact(project.slug, "prior-run", "notion-brief.md", "이전 노션 브리프");

  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId, _prompt, round) => {
    if (providerId === "claude" && round === 0) {
      return [
        "## Resolution",
        "Campung 관련 최신 노션 페이지를 다시 확인했습니다.",
        "## Notion Brief",
        "Campung는 금융 해커톤이 아니라 운영 백엔드 경험으로 정리해야 합니다.",
        "## Sources Considered",
        "- Campung 정정 메모"
      ].join("\n");
    }

    if (providerId === "claude") {
      return ["## Summary", "정리 완료", "## Improvement Plan", "- 신한 연결을 더 선명하게", "## Revised Draft", "새 초안"].join("\n");
    }

    return ["## Overall Verdict", "Useful", "## Strengths", "- Good correction", "## Problems", "- Needs clearer bank fit", "## Suggestions", "- Use corrected Campung framing", "## Direct Responses To Other Reviewers", "- Agree"].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  const continuationNote = "CAMPUNG에 대한 내용이 노션에 잘못 기재돼있었다. 다시 파악하고 진행해";
  const result = await orchestrator.run({
    projectSlug: project.slug,
    question: "왜 신한은행인가?",
    draft: "새 초안",
    reviewMode: "deepFeedback",
    continuationFromRunId: "prior-run",
    continuationNote,
    coordinatorProvider: "claude",
    reviewerProviders: ["codex", "gemini"],
    rounds: 1,
    selectedDocumentIds: []
  });

  assert.match(result.run.notionRequest ?? "", /노션에 잘못 기재/);
  const notionCall = gateway.calls.find((call) => call.providerId === "claude" && call.round === 0);
  assert.ok(notionCall);
  assert.match(notionCall.prompt, /## User Notion Request/);
  assert.match(notionCall.prompt, /CAMPUNG에 대한 내용이 노션에 잘못 기재돼있었다/);

  const reviewerCall = gateway.calls.find((call) => call.providerId === "codex" && call.round === 1);
  assert.ok(reviewerCall);
  assert.match(reviewerCall.prompt, /## User Guidance/);
  assert.match(reviewerCall.prompt, /Before Start/);
  assert.match(reviewerCall.prompt, /다시 파악하고 진행해/);
  assert.match(reviewerCall.prompt, /Campung는 금융 해커톤이 아니라 운영 백엔드 경험으로 정리해야 합니다/);
});

test("deep feedback prompts explicitly require Korean responses while preserving English headings", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Shinhan Bank");
  await storage.saveProfileTextDocument("Career", "Built backend systems", true);

  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId, _prompt, round) => {
    if (providerId === "claude" && round === 0) {
      return [
        "## Resolution",
        "노션 확인 완료",
        "## Notion Brief",
        "Campung 정정 내용",
        "## Sources Considered",
        "- 노션 페이지"
      ].join("\n");
    }

    if (providerId === "claude") {
      return ["## Summary", "정리 완료", "## Improvement Plan", "- 신한 연결 보강", "## Revised Draft", "새 초안"].join("\n");
    }

    return ["## Overall Verdict", "유용함", "## Strengths", "- 정정 반영", "## Problems", "- 신한 연결 약함", "## Suggestions", "- 동기 강화", "## Direct Responses To Other Reviewers", "- 동의"].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  await orchestrator.run({
    projectSlug: project.slug,
    question: "왜 신한은행인가?",
    draft: "초안",
    reviewMode: "deepFeedback",
    notionRequest: "Campung 내용을 노션에서 다시 확인해줘",
    coordinatorProvider: "claude",
    reviewerProviders: ["gemini"],
    rounds: 1,
    selectedDocumentIds: []
  });

  const notionCall = gateway.calls.find((call) => call.providerId === "claude" && call.round === 0);
  assert.ok(notionCall);
  assert.match(notionCall.prompt, /Write all substantive content in Korean \(한국어\)/);
  assert.match(notionCall.prompt, /Keep the required English top-level section headings exactly as written/);

  const reviewerCall = gateway.calls.find((call) => call.providerId === "gemini" && call.round === 1);
  assert.ok(reviewerCall);
  assert.match(reviewerCall.prompt, /Write all substantive content in Korean \(한국어\)/);
  assert.match(reviewerCall.prompt, /Keep the required English section headings exactly as written/);

  const coordinatorCall = gateway.calls.find((call) => call.providerId === "claude" && call.round === 1);
  assert.ok(coordinatorCall);
  assert.match(coordinatorCall.prompt, /Write all substantive content in Korean \(한국어\)/);
  assert.match(coordinatorCall.prompt, /Keep the required English section headings exactly as written/);
});

test("orchestrator persists streamed chat messages emitted during provider turns", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Line");
  await storage.saveProfileTextDocument("Career", "Built collaboration tools", true);

  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(
    healthyStates(),
    (providerId) => {
      if (providerId === "claude") {
        return ["## Summary", "Coordinator summary", "## Improvement Plan", "- Tighten examples", "## Revised Draft", "Updated draft"].join("\n");
      }
      return ["## Overall Verdict", "Useful", "## Strengths", "- Clear", "## Problems", "- Needs stronger metrics", "## Suggestions", "- Add outcomes", "## Direct Responses To Other Reviewers", "- Agree"].join("\n");
    },
    async (providerId, _prompt, options) => {
      await options.onEvent?.({
        timestamp: new Date().toISOString(),
        type: "chat-message-started",
        providerId,
        round: options.round,
        messageId: `${providerId}-${options.round}`,
        speakerRole: options.speakerRole,
        recipient: "All",
        message: ""
      });
      await options.onEvent?.({
        timestamp: new Date().toISOString(),
        type: "chat-message-delta",
        providerId,
        round: options.round,
        messageId: `${providerId}-${options.round}`,
        speakerRole: options.speakerRole,
        recipient: "All",
        message: `${providerId} says hello`
      });
      await options.onEvent?.({
        timestamp: new Date().toISOString(),
        type: "chat-message-completed",
        providerId,
        round: options.round,
        messageId: `${providerId}-${options.round}`,
        speakerRole: options.speakerRole,
        recipient: "All",
        message: ""
      });
    }
  );

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  const result = await orchestrator.run({
    projectSlug: project.slug,
    question: "Why Line?",
    draft: "I enjoy platform work.",
    reviewMode: "deepFeedback",
    coordinatorProvider: "claude",
    reviewerProviders: ["codex", "gemini"],
    rounds: 1,
    selectedDocumentIds: []
  });

  const chatArtifact = await storage.readOptionalRunArtifact(project.slug, result.run.id, "chat-messages.json");
  assert.ok(chatArtifact);
  assert.match(chatArtifact, /codex says hello/);
  assert.match(chatArtifact, /claude says hello/);
});

test("orchestrator continues to another cycle on blank input and stops on /done", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Toss");
  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId) => {
    if (providerId === "claude") {
      return ["## Summary", "Coordinator summary", "## Improvement Plan", "- Tighten evidence", "## Revised Draft", "Updated draft"].join("\n");
    }
    return ["## Overall Verdict", "Useful", "## Strengths", "- Clear", "## Problems", "- Needs metrics", "## Suggestions", "- Add outcomes", "## Direct Responses To Other Reviewers", "- Agree"].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  const events: RunEvent[] = [];
  let pauseCount = 0;
  const result = await orchestrator.run(
    {
      projectSlug: project.slug,
      question: "Why Toss?",
      draft: "I like fintech.",
      reviewMode: "deepFeedback",
      coordinatorProvider: "claude",
      reviewerProviders: ["codex", "gemini"],
      rounds: 1,
      selectedDocumentIds: []
    },
    async (event) => {
      events.push(event);
    },
    async () => {
      pauseCount += 1;
      return pauseCount === 1 ? "" : "/done";
    }
  );

  assert.equal(result.run.status, "completed");
  assert.equal(result.run.rounds, 2);
  assert.ok(events.filter((event) => event.type === "awaiting-user-input").length >= 2);
  assert.ok(events.some((event) => event.type === "user-input-received" && /Session marked complete/.test(event.message ?? "")));
  assert.ok(gateway.calls.some((call) => call.providerId === "claude" && call.round === 2));
});

test("orchestrator injects non-empty user intervention into the next cycle prompts", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("NHN");
  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId) => {
    if (providerId === "claude") {
      return ["## Summary", "Coordinator summary", "## Improvement Plan", "- Highlight collaboration", "## Revised Draft", "Updated draft"].join("\n");
    }
    return ["## Overall Verdict", "Useful", "## Strengths", "- Relevant", "## Problems", "- Weak company fit", "## Suggestions", "- Explain collaboration", "## Direct Responses To Other Reviewers", "- Agree"].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  let pauseCount = 0;
  const result = await orchestrator.run(
    {
      projectSlug: project.slug,
      question: "Why NHN?",
      draft: "I like building services.",
      reviewMode: "deepFeedback",
      coordinatorProvider: "claude",
      reviewerProviders: ["codex", "gemini"],
      rounds: 1,
      selectedDocumentIds: []
    },
    undefined,
    async () => {
      pauseCount += 1;
      return pauseCount === 1 ? "협업 관점을 더 강조해줘" : "/done";
    }
  );

  assert.equal(result.run.status, "completed");
  const reviewerCall = gateway.calls.find((call) => call.providerId === "codex" && call.round === 2);
  const coordinatorCall = gateway.calls.find((call) => call.providerId === "claude" && call.round === 2);
  assert.ok(reviewerCall);
  assert.ok(coordinatorCall);
  assert.match(reviewerCall.prompt, /## User Guidance/);
  assert.match(reviewerCall.prompt, /협업 관점을 더 강조해줘/);
  assert.match(coordinatorCall.prompt, /## User Guidance/);
  assert.match(coordinatorCall.prompt, /협업 관점을 더 강조해줘/);
  const chatArtifact = await storage.readOptionalRunArtifact(project.slug, result.run.id, "chat-messages.json");
  assert.ok(chatArtifact);
  assert.match(chatArtifact, /"speaker": "You"/);
});

test("realtime mode waits for unanimous approval and saves only the final draft artifact", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Kurly");
  await storage.saveProfileTextDocument("Career", "Built product and growth systems", true);

  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId, prompt, round) => {
    if (providerId === "claude") {
      return /closing a realtime multi-model essay review session/i.test(prompt)
        ? "최종 지원서 초안"
        : buildRealtimeLedgerResponse({
            currentFocus: round === 1 ? "핵심 성과 수치를 먼저 선명하게 정리합니다." : "성과와 회사 연결을 한 문단으로 정리합니다.",
            targetSection: "도입 문단",
            miniDraft: round === 1
              ? "대규모 결제 안정화 경험을 먼저 꺼내고, 왜 그 경험이 컬리와 맞닿는지 바로 잇습니다."
              : "대규모 결제 안정화 경험을 먼저 꺼내고, 그 경험이 컬리의 사용자 신뢰와 어떻게 연결되는지 한 문단에서 정리합니다.",
            acceptedDecisions: ["성과 수치를 초반에 배치한다"],
            openChallenges: round === 1 ? ["컬리와의 연결 근거를 더 분명히 써야 한다"] : []
          });
    }

    return [
      "Mini Draft: 성과를 먼저 꺼내는 방향은 좋습니다.",
      round === 1
        ? "Challenge: 컬리와의 연결 근거는 아직 열어둬야 합니다."
        : "Challenge: 남은 쟁점은 이제 닫아도 됩니다.",
      round === 1
        ? "Cross-feedback: 첫 라운드라 교차 피드백은 없습니다."
        : "Cross-feedback: 직전 라운드 objection에 동의하며 회사 연결 근거를 더 보강했습니다.",
      "Status: APPROVE"
    ].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  const result = await orchestrator.run({
    projectSlug: project.slug,
    question: "Why Kurly?",
    draft: "사용자 문제를 해결하는 서비스가 좋아요.",
    reviewMode: "realtime",
    coordinatorProvider: "claude",
    reviewerProviders: ["codex", "gemini"],
    rounds: 1,
    selectedDocumentIds: []
  });

  assert.equal(result.run.status, "completed");
  assert.equal(result.run.rounds, 2);
  assert.equal(result.artifacts.revisedDraft, "최종 지원서 초안");
  assert.equal((await storage.getPreferences()).lastReviewMode, "realtime");
  assert.equal(await storage.readOptionalRunArtifact(project.slug, result.run.id, "summary.md"), undefined);
  assert.equal(await storage.readOptionalRunArtifact(project.slug, result.run.id, "improvement-plan.md"), undefined);
  assert.equal(await storage.readOptionalRunArtifact(project.slug, result.run.id, "revised-draft.md"), "최종 지원서 초안");
  const discussionLedger = await storage.readOptionalRunArtifact(project.slug, result.run.id, "discussion-ledger.md");
  assert.ok(discussionLedger);
  assert.match(discussionLedger, /## Mini Draft/);
  assert.match(discussionLedger, /성과와 회사 연결/);
  const reviewerPrompt = gateway.calls.find((call) => call.providerId === "codex");
  assert.ok(reviewerPrompt);
  assert.match(reviewerPrompt.prompt, /Status: APPROVE/);
});

test("realtime prompts explicitly require Korean responses while preserving status lines", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Kurly");
  await storage.saveProfileTextDocument("Career", "Built product systems", true);

  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId, prompt) => {
    if (providerId === "claude") {
      return /closing a realtime multi-model essay review session/i.test(prompt)
        ? "최종 지원서 초안"
        : buildRealtimeLedgerResponse({
            currentFocus: "핵심 근거를 더 선명하게 맞춥니다.",
            targetSection: "도입 문단",
            miniDraft: "핵심 성과와 지원 동기의 연결을 두 문장으로 압축합니다.",
            acceptedDecisions: ["성과를 먼저 말한다"],
            openChallenges: []
          });
    }

    return ["Mini Draft: 방향은 좋습니다.", "Challenge: 남은 쟁점은 없습니다.", "Cross-feedback: 첫 라운드라 교차 피드백은 없습니다.", "Status: APPROVE"].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  await orchestrator.run({
    projectSlug: project.slug,
    question: "Why Kurly?",
    draft: "사용자 문제 해결이 좋아요.",
    reviewMode: "realtime",
    coordinatorProvider: "claude",
    reviewerProviders: ["gemini"],
    rounds: 1,
    selectedDocumentIds: []
  });

  const coordinatorPrompt = gateway.calls.find(
    (call) => call.providerId === "claude" && call.round === 1 && !/closing a realtime multi-model essay review session/i.test(call.prompt)
  );
  assert.ok(coordinatorPrompt);
  assert.match(coordinatorPrompt.prompt, /Write your response sentences in Korean \(한국어\)/);
  assert.match(coordinatorPrompt.prompt, /Keep any required English status line exactly as written/);

  const reviewerPrompt = gateway.calls.find((call) => call.providerId === "gemini" && call.round === 1);
  assert.ok(reviewerPrompt);
  assert.match(reviewerPrompt.prompt, /Write your response sentences in Korean \(한국어\)/);
  assert.match(reviewerPrompt.prompt, /Keep any required English status line exactly as written/);
  assert.match(reviewerPrompt.prompt, /Status: APPROVE/);
  assert.match(reviewerPrompt.prompt, /## Discussion Ledger/);
  assert.match(reviewerPrompt.prompt, /## Mini Draft/);

  const finalPrompt = gateway.calls.find(
    (call) => call.providerId === "claude" && /closing a realtime multi-model essay review session/i.test(call.prompt)
  );
  assert.ok(finalPrompt);
  assert.match(finalPrompt.prompt, /Write the final essay draft in Korean \(한국어\)/);
});

test("realtime reviewer prompts include the latest ledger and previous-round cross-feedback instructions", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Musinsa");
  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId, prompt, round) => {
    if (providerId === "claude") {
      if (/closing a realtime multi-model essay review session/i.test(prompt)) {
        return "무신사 최종본";
      }
      return buildRealtimeLedgerResponse({
        currentFocus: round === 1 ? "브랜드 적합도보다 성과 근거를 먼저 정리합니다." : "성과 근거와 브랜드 적합도를 같이 묶습니다.",
        targetSection: "지원 동기 문단",
        miniDraft: round === 1
          ? "검색 품질 개선 성과를 먼저 제시하고, 왜 그 경험이 무신사와 닿는지 한 문장으로 잇습니다."
          : "검색 품질 개선 성과를 먼저 제시하고, 그 경험이 무신사의 탐색 경험과 어떻게 이어지는지 두 문장으로 잇습니다.",
        acceptedDecisions: ["성과를 문단 첫머리에 둔다"],
        openChallenges: round === 1 ? ["무신사와의 연결 근거가 아직 약하다"] : []
      });
    }

    return [
      round === 1
        ? "Mini Draft: 성과를 먼저 두는 방향은 좋습니다."
        : "Mini Draft: 무신사와의 연결 문장을 더 선명하게 유지하세요.",
      round === 1
        ? "Challenge: 무신사와의 연결 근거는 열어둬야 합니다."
        : "Challenge: 남은 쟁점은 이제 닫아도 됩니다.",
      round === 1
        ? "Cross-feedback: 첫 라운드라 교차 피드백은 없습니다."
        : "Cross-feedback: 직전 라운드 objection에 동의하며 회사 연결 근거를 더 보강해야 합니다.",
      "Status: APPROVE"
    ].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  await orchestrator.run({
    projectSlug: project.slug,
    question: "Why Musinsa?",
    draft: "패션 플랫폼이 좋아서 지원합니다.",
    reviewMode: "realtime",
    coordinatorProvider: "claude",
    reviewerProviders: ["codex", "gemini"],
    rounds: 1,
    selectedDocumentIds: []
  });

  const roundTwoReviewerPrompt = gateway.calls.find((call) => call.providerId === "codex" && call.round === 2);
  assert.ok(roundTwoReviewerPrompt);
  assert.match(roundTwoReviewerPrompt.prompt, /## Discussion Ledger/);
  assert.match(roundTwoReviewerPrompt.prompt, /## Previous Round Reviewer Summary/);
  assert.match(roundTwoReviewerPrompt.prompt, /## Mini Draft/);
  assert.match(roundTwoReviewerPrompt.prompt, /성과를 문단 첫머리에 둔다/);
  assert.match(roundTwoReviewerPrompt.prompt, /무신사와의 연결 근거가 아직 약하다/);
  assert.match(roundTwoReviewerPrompt.prompt, /explicitly agree or disagree with exactly one objection/i);
});

test("realtime mode tracks duplicate reviewer slots separately", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Dang근");
  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (_providerId, prompt, round, options) => {
    if (options?.speakerRole === "coordinator") {
      return /closing a realtime multi-model essay review session/i.test(prompt)
        ? "중복 reviewer 최종본"
        : buildRealtimeLedgerResponse({
            currentFocus: "협업 경험을 더 또렷하게 맞춥니다.",
            targetSection: "협업 문단",
            miniDraft: "협업 장면을 먼저 보여주고, 그 결과를 숫자로 닫습니다.",
            acceptedDecisions: ["협업 장면을 구체화한다"],
            openChallenges: round === 1 ? ["결과 수치가 아직 약하다"] : []
          });
    }

    if (round === 1 && options?.participantId === "reviewer-1") {
      return ["Mini Draft: 협업 장면은 좋지만 결과 수치는 약합니다.", "Challenge: 결과 수치는 아직 열어둬야 합니다.", "Cross-feedback: 첫 라운드라 교차 피드백은 없습니다.", "Status: REVISE"].join("\n");
    }

    return [
      `Mini Draft: ${options?.participantLabel || "reviewer"} 기준으로 방향은 충분합니다.`,
      round === 1 ? "Challenge: 결과 수치는 더 보강해야 합니다." : "Challenge: 남은 쟁점은 없습니다.",
      round === 1 ? "Cross-feedback: 첫 라운드라 교차 피드백은 없습니다." : "Cross-feedback: 직전 objection을 반영해 수치 보강에 동의합니다.",
      "Status: APPROVE"
    ].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  const result = await orchestrator.run({
    projectSlug: project.slug,
    question: "Why Dang근?",
    draft: "동네 기반 서비스가 좋아서 지원합니다.",
    reviewMode: "realtime",
    coordinatorProvider: "claude",
    reviewerProviders: ["codex", "codex"],
    rounds: 1,
    selectedDocumentIds: []
  });

  assert.equal(result.run.status, "completed");
  assert.equal(result.run.rounds, 2);
  assert.equal(result.artifacts.revisedDraft, "중복 reviewer 최종본");

  const roundOneReviewerCalls = gateway.calls.filter((call) => call.round === 1 && call.providerId === "codex");
  assert.equal(roundOneReviewerCalls.length, 2);
  assert.deepEqual(
    roundOneReviewerCalls.map((call) => call.participantId),
    ["reviewer-1", "reviewer-2"]
  );
  assert.deepEqual(
    roundOneReviewerCalls.map((call) => call.participantLabel),
    ["Codex reviewer 1", "Codex reviewer 2"]
  );
  assert.notEqual(roundOneReviewerCalls[0].messageScope, roundOneReviewerCalls[1].messageScope);

  const storedTurnsRaw = await storage.readOptionalRunArtifact(project.slug, result.run.id, "review-turns.json");
  assert.ok(storedTurnsRaw);
  assert.match(storedTurnsRaw, /"participantId": "reviewer-1"/);
  assert.match(storedTurnsRaw, /"participantId": "reviewer-2"/);
});

test("realtime mode pauses after four rounds without consensus and can stop without writing a final draft", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Woowa");
  const compiler = new ContextCompiler(storage);
  const gateway = new FakeGateway(healthyStates(), (providerId, _prompt, round) => {
    if (providerId === "claude") {
      return buildRealtimeLedgerResponse({
        currentFocus: "이 문단의 근거를 더 보강합니다.",
        targetSection: "지원 동기 문단",
        miniDraft: "서비스 친숙함만 말하지 말고, 직접 만든 개선 경험과 연결합니다.",
        acceptedDecisions: ["서비스 친숙함만으로는 부족하다"],
        openChallenges: [`라운드 ${round}에서도 근거가 여전히 약하다`]
      });
    }

    return ["Mini Draft: 아직 구체성이 부족합니다.", "Challenge: 쟁점을 유지해야 합니다.", "Cross-feedback: 첫 라운드라 교차 피드백은 없습니다.", "Status: REVISE"].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  const events: RunEvent[] = [];
  const result = await orchestrator.run(
    {
      projectSlug: project.slug,
      question: "Why Woowa?",
      draft: "배달 서비스가 익숙해서 지원합니다.",
      reviewMode: "realtime",
      coordinatorProvider: "claude",
      reviewerProviders: ["codex", "gemini"],
      rounds: 1,
      selectedDocumentIds: []
    },
    async (event) => {
      events.push(event);
    },
    async () => "/done"
  );

  assert.equal(result.run.status, "completed");
  assert.equal(result.run.rounds, 4);
  assert.equal(await storage.readOptionalRunArtifact(project.slug, result.run.id, "summary.md"), undefined);
  assert.equal(await storage.readOptionalRunArtifact(project.slug, result.run.id, "improvement-plan.md"), undefined);
  assert.equal(await storage.readOptionalRunArtifact(project.slug, result.run.id, "revised-draft.md"), undefined);
  const ledgerArtifact = await storage.readOptionalRunArtifact(project.slug, result.run.id, "discussion-ledger.md");
  assert.ok(ledgerArtifact);
  assert.match(ledgerArtifact, /## Open Challenges/);
  assert.ok(events.some((event) => event.type === "awaiting-user-input" && /without unanimous approval/i.test(event.message ?? "")));
  assert.ok(events.some((event) => event.type === "user-input-received" && /without a final draft/i.test(event.message ?? "")));
  assert.equal(
    gateway.calls.filter((call) => call.providerId === "claude" && /closing a realtime multi-model essay review session/i.test(call.prompt)).length,
    0
  );
});

test("realtime mode lets the current writer finish, then redirects through the coordinator before remaining reviewers continue", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject("Socar");
  const compiler = new ContextCompiler(storage);
  const queuedMessages: string[] = [];

  const gateway = new FakeGateway(healthyStates(), (providerId, prompt, round) => {
    if (providerId === "claude") {
      if (/The user just redirected the discussion/i.test(prompt)) {
        return buildRealtimeLedgerResponse({
          currentFocus: "사용자 요청대로 협업 경험 중심으로 방향을 전환합니다.",
          targetSection: "협업 문단",
          miniDraft: "혼자 해결했다는 표현을 줄이고, 협업으로 문제를 푼 장면을 전면에 둡니다.",
          acceptedDecisions: ["협업 경험을 전면에 둔다"],
          openChallenges: []
        });
      }
      if (/closing a realtime multi-model essay review session/i.test(prompt)) {
        return "협업 중심 최종본";
      }
      return buildRealtimeLedgerResponse({
        currentFocus: "우선 핵심 임팩트를 선명하게 잡습니다.",
        targetSection: "도입 문단",
        miniDraft: "모빌리티 서비스 경험보다 직접 만든 임팩트를 먼저 말합니다.",
        acceptedDecisions: ["임팩트를 먼저 제시한다"],
        openChallenges: ["협업 장면이 아직 드러나지 않는다"]
      });
    }

    if (providerId === "codex" && round === 1) {
      queuedMessages.push("방금 논점 말고 협업이 드러나게 바꿔줘");
      return ["Mini Draft: 이 방향은 아직 애매합니다.", "Challenge: 협업 장면은 열어둬야 합니다.", "Cross-feedback: 첫 라운드라 교차 피드백은 없습니다.", "Status: REVISE"].join("\n");
    }

    return ["Mini Draft: 이제 충분합니다.", "Challenge: 남은 쟁점은 없습니다.", "Cross-feedback: 직전 objection에 동의하며 협업 장면을 보강했습니다.", "Status: APPROVE"].join("\n");
  });

  const orchestrator = new ReviewOrchestrator(storage, compiler, gateway);
  const result = await orchestrator.run(
    {
      projectSlug: project.slug,
      question: "Why Socar?",
      draft: "모빌리티 서비스를 좋아해서 지원합니다.",
      reviewMode: "realtime",
      coordinatorProvider: "claude",
      reviewerProviders: ["codex", "gemini"],
      rounds: 1,
      selectedDocumentIds: []
    },
    undefined,
    undefined,
    () => queuedMessages.splice(0, queuedMessages.length)
  );

  assert.equal(result.artifacts.revisedDraft, "협업 중심 최종본");
  assert.equal(
    gateway.calls.some((call) => call.providerId === "gemini" && call.round === 1),
    false
  );
  assert.equal(
    gateway.calls.some((call) => call.providerId === "claude" && call.round === 2 && /The user just redirected the discussion/i.test(call.prompt)),
    true
  );
  const chatArtifact = await storage.readOptionalRunArtifact(project.slug, result.run.id, "chat-messages.json");
  assert.ok(chatArtifact);
  assert.match(chatArtifact, /협업이 드러나게 바꿔줘/);
});

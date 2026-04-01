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
  const gateway = new FakeGateway(healthyStates(), (providerId, prompt) => {
    if (providerId === "claude") {
      return /closing a realtime multi-model essay review session/i.test(prompt)
        ? "최종 지원서 초안"
        : "핵심 성과 수치를 한 줄로 더 선명하게 맞춰보는 게 어떨까요?";
    }

    return "좋습니다. 이 방향이면 충분합니다.\nStatus: APPROVE";
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
  assert.equal(result.run.rounds, 1);
  assert.equal(result.artifacts.revisedDraft, "최종 지원서 초안");
  assert.equal((await storage.getPreferences()).lastReviewMode, "realtime");
  assert.equal(await storage.readOptionalRunArtifact(project.slug, result.run.id, "summary.md"), undefined);
  assert.equal(await storage.readOptionalRunArtifact(project.slug, result.run.id, "improvement-plan.md"), undefined);
  assert.equal(await storage.readOptionalRunArtifact(project.slug, result.run.id, "revised-draft.md"), "최종 지원서 초안");
  const reviewerPrompt = gateway.calls.find((call) => call.providerId === "codex");
  assert.ok(reviewerPrompt);
  assert.match(reviewerPrompt.prompt, /Status: APPROVE/);
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
        : "협업 경험을 더 또렷하게 맞추죠.";
    }

    if (round === 1 && options?.participantId === "reviewer-1") {
      return "아직 근거가 약합니다.\nStatus: REVISE";
    }

    return `좋습니다. ${options?.participantLabel || "reviewer"} 기준으로 충분합니다.\nStatus: APPROVE`;
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
  const gateway = new FakeGateway(healthyStates(), (providerId) => {
    if (providerId === "claude") {
      return "이 문단의 근거가 아직 약하니 한 번만 더 짚어볼게요.";
    }

    return "아직 구체성이 부족합니다.\nStatus: REVISE";
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
        return "좋아요. 이제 협업 경험을 중심으로 다시 맞춰봅시다.";
      }
      if (/closing a realtime multi-model essay review session/i.test(prompt)) {
        return "협업 중심 최종본";
      }
      return "우선 핵심 임팩트를 더 선명하게 보죠.";
    }

    if (providerId === "codex" && round === 1) {
      queuedMessages.push("방금 논점 말고 협업이 드러나게 바꿔줘");
      return "이 방향은 아직 애매합니다.\nStatus: REVISE";
    }

    return "이제 충분합니다.\nStatus: APPROVE";
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

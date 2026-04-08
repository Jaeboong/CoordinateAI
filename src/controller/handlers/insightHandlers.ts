import { collectCompanySourceBundle } from "../../core/companySources";
import { generateInsightArtifacts } from "../../core/insights";
import { fetchAndExtractJobPosting, isJobPostingFetchError } from "../../core/jobPosting";
import { OpenDartClient, OpenDartCompanyResolution } from "../../core/openDart";
import { WebviewToExtensionMessage } from "../../core/webviewProtocol";
import { ControllerContext, MessageHandlerMap } from "../controllerContext";
import { buildInsightWorkspaceState } from "./insightWorkspaceState";
import { getOpenDartApiKey } from "./openDartHandlers";
import { buildProjectInput } from "./projectHandlers";

export function createInsightHandlers(ctx: ControllerContext): Pick<MessageHandlerMap,
  | "analyzeProjectInsights"
  | "generateProjectInsights"
  | "openInsightWorkspace"
> {
  return {
    analyzeProjectInsights: async (message) => {
      await ctx.runBusy("지원 공고를 분석하는 중...", async () => {
        await analyzeProjectInsights(ctx, message);
      });
    },
    generateProjectInsights: async (message) => {
      await ctx.runBusy("인사이트 문서를 생성하는 중...", async () => {
        await generateProjectInsights(ctx, message);
      });
    },
    openInsightWorkspace: async (message) => {
      await openInsightWorkspace(ctx, message.projectSlug);
    }
  };
}

async function analyzeProjectInsights(
  ctx: ControllerContext,
  message: Extract<WebviewToExtensionMessage, { type: "analyzeProjectInsights" }>
): Promise<void> {
  const storage = ctx.storage();
  const baseProject = await storage.updateProjectInfo(message.projectSlug, buildProjectInput(message));

  try {
    const extraction = await fetchAndExtractJobPosting({
      jobPostingUrl: baseProject.jobPostingUrl,
      jobPostingText: baseProject.jobPostingText,
      seedCompanyName: baseProject.companyName,
      seedRoleName: baseProject.roleName
    });

    await storage.saveProjectInsightJson(message.projectSlug, "job-extraction.json", extraction);
    await storage.updateProject({
      ...baseProject,
      companyName: extraction.companyName || baseProject.companyName,
      roleName: extraction.roleName || baseProject.roleName,
      mainResponsibilities: extraction.mainResponsibilities || baseProject.mainResponsibilities,
      qualifications: extraction.qualifications || baseProject.qualifications,
      preferredQualifications: extraction.preferredQualifications || baseProject.preferredQualifications,
      keywords: extraction.keywords.length > 0 ? extraction.keywords : baseProject.keywords,
      jobPostingText: extraction.normalizedText,
      postingAnalyzedAt: extraction.fetchedAt,
      jobPostingManualFallback: false,
      insightStatus: "reviewNeeded",
      insightLastError: extraction.warnings.length > 0 ? extraction.warnings.join(" ") : undefined,
      openDartCandidates: undefined
    });
    await ctx.stateStore.refreshProjects(message.projectSlug);
    await ctx.sidebar.postBanner(
      extraction.warnings.length > 0
        ? `공고 분석을 마쳤습니다. 검토가 필요한 항목이 있습니다: ${extraction.warnings.join(" / ")}`
        : "공고 분석을 마쳤습니다. 추출 결과를 검토한 뒤 인사이트를 생성하세요."
    );
  } catch (error) {
    await recordJobPostingFetchFailure(ctx, message.projectSlug, error);
    await storage.updateProject({
      ...baseProject,
      jobPostingManualFallback: true,
      insightStatus: "reviewNeeded",
      insightLastError: buildJobPostingFallbackMessage(error)
    });
    await ctx.stateStore.refreshProjects(message.projectSlug);
    await ctx.sidebar.postBanner(buildJobPostingFallbackMessage(error), "error");
  }
}

async function generateProjectInsights(
  ctx: ControllerContext,
  message: Extract<WebviewToExtensionMessage, { type: "generateProjectInsights" }>
): Promise<void> {
  const storage = ctx.storage();
  let project = await storage.updateProjectInfo(message.projectSlug, buildProjectInput(message));

  if (!project.essayQuestions?.length) {
    throw new Error("인사이트를 생성하려면 에세이 질문을 한 개 이상 입력하세요.");
  }

  if (!project.jobPostingText?.trim() && !project.jobPostingUrl?.trim()) {
    throw new Error("인사이트를 생성하려면 지원 공고 URL 또는 수동 입력 공고 텍스트가 필요합니다.");
  }

  try {
    if (!project.jobPostingText?.trim() && project.jobPostingUrl?.trim()) {
      try {
        const extraction = await fetchAndExtractJobPosting({
          jobPostingUrl: project.jobPostingUrl,
          seedCompanyName: project.companyName,
          seedRoleName: project.roleName
        });
        await storage.saveProjectInsightJson(message.projectSlug, "job-extraction.json", extraction);
        project = await storage.updateProject({
          ...project,
          companyName: extraction.companyName || project.companyName,
          roleName: extraction.roleName || project.roleName,
          mainResponsibilities: extraction.mainResponsibilities || project.mainResponsibilities,
          qualifications: extraction.qualifications || project.qualifications,
          preferredQualifications: extraction.preferredQualifications || project.preferredQualifications,
          keywords: extraction.keywords.length > 0 ? extraction.keywords : project.keywords,
          jobPostingText: extraction.normalizedText,
          postingAnalyzedAt: extraction.fetchedAt,
          jobPostingManualFallback: false
        });
      } catch (error) {
        await recordJobPostingFetchFailure(ctx, message.projectSlug, error);
        const fallbackMessage = buildJobPostingFallbackMessage(error);
        await storage.updateProject({
          ...project,
          jobPostingManualFallback: true,
          insightStatus: "reviewNeeded",
          insightLastError: fallbackMessage
        });
        await ctx.stateStore.refreshProjects(message.projectSlug);
        await ctx.sidebar.postBanner(fallbackMessage, "error");
        return;
      }
    }

    project = await storage.updateProject({
      ...project,
      insightStatus: "generating",
      insightLastError: undefined
    });

    let companyResolution: OpenDartCompanyResolution | undefined;
    let partialNotice: string | undefined;
    const openDartApiKey = await getOpenDartApiKey(ctx);
    if (openDartApiKey) {
      try {
        const openDart = new OpenDartClient(storage.storageRoot, openDartApiKey);
        companyResolution = await openDart.resolveAndFetchCompany(project.companyName, project.openDartCorpCode);
        await storage.saveProjectInsightJson(message.projectSlug, "company-enrichment.json", companyResolution);

        if (companyResolution.status === "ambiguous") {
          await storage.updateProject({
            ...project,
            openDartCandidates: companyResolution.candidates,
            insightStatus: "reviewNeeded",
            insightLastError: "OpenDART 회사 매칭 후보를 선택한 뒤 다시 생성하세요."
          });
          await ctx.stateStore.refreshProjects(message.projectSlug);
          await ctx.sidebar.postBanner("OpenDART 회사 후보가 여러 개입니다. 후보를 선택한 뒤 다시 인사이트를 생성하세요.", "error");
          return;
        }

        if (companyResolution.status === "resolved") {
          project = await storage.updateProject({
            ...project,
            openDartCorpCode: companyResolution.match.corpCode,
            openDartCorpName: companyResolution.match.corpName,
            openDartStockCode: companyResolution.match.stockCode,
            openDartCandidates: undefined
          });
        }
      } catch (error) {
        partialNotice = error instanceof Error ? error.message : String(error);
        companyResolution = {
          status: "unavailable",
          notices: [`OpenDART enrichment failed: ${partialNotice}`]
        };
        await storage.saveProjectInsightJson(message.projectSlug, "company-enrichment.json", {
          status: "error",
          message: partialNotice
        });
      }
    }

    const companySourceBundle = await collectCompanySourceBundle(project, companyResolution);
    await storage.saveProjectInsightJson(message.projectSlug, "company-source-manifest.json", companySourceBundle.manifest);
    await storage.saveProjectInsightJson(message.projectSlug, "company-source-snippets.json", companySourceBundle.snippets);

    const preferences = await storage.getPreferences();
    const generated = await generateInsightArtifacts(
      ctx.registry(),
      storage.storageRoot,
      project,
      companyResolution,
      companySourceBundle,
      preferences.lastCoordinatorProvider
    );
    const generatedNote = `Generated by ForJob insight pre-pass using ${generated.providerId}. Regenerate to refresh source-backed insights.`;

    await storage.saveOrUpdateProjectGeneratedDocument(message.projectSlug, "company-insight.md", generated.artifacts["company-insight.md"], generatedNote);
    await storage.saveOrUpdateProjectGeneratedDocument(message.projectSlug, "job-insight.md", generated.artifacts["job-insight.md"], generatedNote);
    await storage.saveOrUpdateProjectGeneratedDocument(message.projectSlug, "application-strategy.md", generated.artifacts["application-strategy.md"], generatedNote);
    await storage.saveOrUpdateProjectGeneratedDocument(message.projectSlug, "question-analysis.md", generated.artifacts["question-analysis.md"], generatedNote);
    await storage.saveProjectInsightJson(message.projectSlug, "company-profile.json", generated.companyProfile);
    await storage.saveProjectInsightJson(message.projectSlug, "insight-sources.json", {
      generatedAt: new Date().toISOString(),
      providerId: generated.providerId,
      openDartStatus: companyResolution?.status ?? "notAttempted",
      companySourceCoverage: companySourceBundle.manifest.coverage,
      companyName: project.companyName,
      roleName: project.roleName,
      essayQuestions: project.essayQuestions
    });
    await storage.updateProject({
      ...project,
      jobPostingManualFallback: false,
      insightStatus: "ready",
      insightLastGeneratedAt: new Date().toISOString(),
      insightLastError:
        companyResolution?.status === "notFound" || companyResolution?.status === "unavailable"
          ? companyResolution.notices.join(" ")
          : undefined
    });
    await ctx.stateStore.refreshProjects(message.projectSlug);
    await openInsightWorkspace(ctx, message.projectSlug);
    await ctx.sidebar.postBanner(
      companyResolution?.status === "notFound"
        ? "인사이트 문서를 생성했습니다. OpenDART 회사를 찾지 못해 공고 기반으로만 작성했습니다."
        : companyResolution?.status === "unavailable"
          ? "인사이트 문서를 생성했습니다. OpenDART 조회에 실패해 공고 기반으로만 작성했습니다."
          : "인사이트 문서를 생성했습니다. 이후 실행에서 자동으로 참고됩니다."
    );
  } catch (error) {
    await storage.updateProject({
      ...project,
      insightStatus: "error",
      insightLastError: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export async function openInsightWorkspace(ctx: ControllerContext, projectSlug: string): Promise<void> {
  ctx.insightWorkspace.show(await buildInsightWorkspaceState(ctx, projectSlug));
}

export function buildJobPostingFallbackMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `자동 공고 분석에 실패했습니다. URL이 막혀 있으면 아래 수동 입력 칸에 공고 원문을 붙여 넣어 주세요. (${detail})`;
}

async function recordJobPostingFetchFailure(
  ctx: ControllerContext,
  projectSlug: string,
  error: unknown
): Promise<void> {
  if (!isJobPostingFetchError(error)) {
    return;
  }

  await ctx.storage().saveProjectInsightJson(projectSlug, "job-fetch-error.json", error.diagnostics);
  ctx.logError(`job posting fetch failed for ${projectSlug}`, error.diagnostics);
}

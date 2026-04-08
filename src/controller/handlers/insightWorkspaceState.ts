import { renderCompanySourceCoverageMarkdown } from "../../core/companySources";
import { CompanySourceManifest } from "../../core/companySourceModel";
import { InsightWorkspaceState } from "../../webview/insightWorkspaceScript";
import { ControllerContext } from "../controllerContext";

const requiredDocuments = [
  { key: "company", tabLabel: "기업 분석", title: "company-insight.md" },
  { key: "job", tabLabel: "직무 분석", title: "job-insight.md" },
  { key: "strategy", tabLabel: "지원 전략", title: "application-strategy.md" },
  { key: "question", tabLabel: "문항 분석", title: "question-analysis.md" }
] as const;

export async function buildInsightWorkspaceState(
  ctx: ControllerContext,
  projectSlug: string
): Promise<InsightWorkspaceState> {
  const storage = ctx.storage();
  const project = await storage.getProject(projectSlug);
  const documents = await storage.listProjectDocuments(projectSlug);
  const companySourceManifest = await storage.readProjectInsightJson<CompanySourceManifest>(projectSlug, "company-source-manifest.json");

  const views = await Promise.all(requiredDocuments.map(async (item) => {
    const document = documents.find((candidate) => candidate.title === item.title);
    const preview = document ? await storage.readDocumentPreviewContent(document) : { content: "", previewSource: "none" as const };
    const content = item.key === "company"
      ? mergeCompanyCoverage(preview.content, companySourceManifest)
      : preview.content;
    return {
      key: item.key,
      tabLabel: item.tabLabel,
      title: project.companyName || item.tabLabel,
      content,
      available: Boolean(content.trim())
    };
  }));

  return {
    projectSlug: project.slug,
    companyName: project.companyName,
    roleName: project.roleName,
    jobPostingUrl: project.jobPostingUrl,
    postingAnalyzedAt: project.postingAnalyzedAt,
    insightLastGeneratedAt: project.insightLastGeneratedAt,
    openDartCorpName: project.openDartCorpName,
    openDartStockCode: project.openDartStockCode,
    documents: views
  };
}

function mergeCompanyCoverage(
  content: string,
  manifest: CompanySourceManifest | undefined
): string {
  const coverage = renderCompanySourceCoverageMarkdown(manifest);
  return [coverage, content.trim()].filter(Boolean).join("\n\n---\n\n");
}

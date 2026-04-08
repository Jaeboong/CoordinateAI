import * as assert from "node:assert/strict";
import test from "node:test";
import { buildInsightWorkspaceState } from "../controller/handlers/insightWorkspaceState";
import { ControllerContext } from "../controller/controllerContext";
import { cleanupTempWorkspace, createStorage, createTempWorkspace } from "./helpers";

test("buildInsightWorkspaceState prepends source coverage to the company tab", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(workspaceRoot));

  const storage = await createStorage(workspaceRoot);
  const project = await storage.createProject({
    companyName: "에코마케팅",
    roleName: "Backend Engineer"
  });

  await storage.saveOrUpdateProjectGeneratedDocument(
    project.slug,
    "company-insight.md",
    "# 기업 분석\n본문",
    "generated",
    true
  );
  await storage.saveProjectInsightJson(project.slug, "company-source-manifest.json", {
    collectedAt: "2026-04-08T10:00:00.000Z",
    companyName: "에코마케팅",
    sources: [
      {
        id: "open-dart-overview",
        tier: "official",
        kind: "openDartOverview",
        label: "OpenDART 기업개황",
        status: "available"
      }
    ],
    coverage: {
      summaryLabel: "OpenDART + 공식 홈페이지 + 공식 채용",
      sourceTypes: ["OpenDART", "공식 홈페이지", "공식 채용"],
      omissions: ["최근 방향성을 뒷받침할 공식 IR/보도/기술 자료가 제한적입니다."],
      coverageNote: "일부 공식 소스를 확보했지만 누락된 축은 문서 안에서 제한적으로만 해석해야 합니다.",
      externalEnrichmentUsed: false
    }
  });

  const state = await buildInsightWorkspaceState({
    storage: () => storage
  } as ControllerContext, project.slug);
  const companyView = state.documents.find((document) => document.key === "company");

  assert.ok(companyView);
  assert.match(companyView?.content ?? "", /## 소스 커버리지/);
  assert.match(companyView?.content ?? "", /OpenDART \+ 공식 홈페이지 \+ 공식 채용/);
  assert.match(companyView?.content ?? "", /# 기업 분석/);
});

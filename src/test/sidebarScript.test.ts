import * as assert from "node:assert/strict";
import test from "node:test";
import { buildSidebarScript } from "../webview/sidebarScript";
import { buildInsightWorkspaceScript } from "../webview/insightWorkspaceScript";

test("buildSidebarScript returns parseable browser script", () => {
  const script = buildSidebarScript();

  assert.doesNotThrow(() => {
    new Function(script);
  });

  assert.match(script, /실시간 대화형/);
  assert.match(script, /심화 피드백/);
  assert.match(script, /AI 도구/);
  assert.match(script, /프로필/);
  assert.match(script, /OpenDART/);
  assert.match(script, /버전 v/);
  assert.match(script, /extensionVersion/);
  assert.match(script, /프로젝트/);
  assert.match(script, /자기소개서/);
  assert.match(script, /설정/);
  assert.match(script, /settingsModalOpen/);
  assert.match(script, /switch-settings-tab/);
  assert.match(script, /set-review-mode/);
  assert.match(script, /역할 배치/);
  assert.match(script, /고급 옵션/);
  assert.match(script, /toggle-run-role-advanced/);
  assert.match(script, /set-run-role-provider/);
  assert.match(script, /set-run-role-model/);
  assert.match(script, /set-run-role-effort/);
  assert.match(script, /toggle-run-role-defaults/);
  assert.match(script, /roleAssignments/);
  assert.match(script, /raw\?\.roleKey \|\| raw\?\.role/);
  assert.match(script, /role: assignment\.roleKey/);
  assert.match(script, /context_researcher/);
  assert.match(script, /section_coordinator/);
  assert.match(script, /section_drafter/);
  assert.match(script, /fit_reviewer/);
  assert.match(script, /evidence_reviewer/);
  assert.match(script, /voice_reviewer/);
  assert.match(script, /finalizer/);
  assert.match(script, /toggle-collapsible/);
  assert.match(script, /초기화/);
  assert.match(script, /실행 설정/);
  assert.match(script, /projectStates/);
  assert.match(script, /questionStates/);
  assert.match(script, /activeQuestionIndex/);
  assert.match(script, /set-active-question/);
  assert.match(script, /question-nav-list/);
  assert.match(script, /completeEssayQuestion/);
  assert.match(script, /완료 업데이트/);
  assert.match(script, /role-group/);
  assert.match(script, /role-advanced-panel/);
  assert.match(script, /collapsibleStates/);
  assert.match(script, /tabScrollPositions/);
  assert.match(script, /project-inline-panel/);
  assert.match(script, /projects-toolbar/);
  assert.match(script, /project-fold-summary/);
  assert.match(script, /rememberCurrentTabScroll/);
  assert.match(script, /restoreSelectedTabScroll/);
  assert.match(script, /pendingInteractionScrollTop/);
  assert.match(script, /setInteractionScrollAnchor/);
  assert.match(script, /consumeInteractionScrollAnchor/);
  assert.match(script, /reset-project-rubric/);
  assert.match(script, /회사 이름/);
  assert.match(script, /포지션/);
  assert.match(script, /지원 공고 URL/);
  assert.match(script, /에세이 문항/);
  assert.match(script, /문항 추가/);
  assert.match(script, /add-essay-question/);
  assert.match(script, /getAll\("essayQuestions"\)/);
  assert.match(script, /주요 업무/);
  assert.match(script, /자격요건/);
  assert.match(script, /우대사항/);
  assert.match(script, /키워드 \/ 기술 스택/);
  assert.match(script, /공고 원문 붙여넣기/);
  assert.match(script, /인사이트 프리패스/);
  assert.match(script, /연결 확인/);
  assert.match(script, /test-open-dart-connection/);
  assert.match(script, /공고 분석/);
  assert.match(script, /인사이트 생성/);
  assert.match(script, /saveOpenDartApiKey/);
  assert.match(script, /clearOpenDartApiKey/);
  assert.match(script, /testOpenDartConnection/);
  assert.match(script, /analyzeProjectInsights/);
  assert.match(script, /generateProjectInsights/);
  assert.match(script, /openInsightWorkspace/);
  assert.match(script, /readProjectInsightFormPayload/);
  assert.match(script, /projectInsightStatusMeta/);
  assert.match(script, /company-insight\.md/);
  assert.match(script, /job-insight\.md/);
  assert.match(script, /application-strategy\.md/);
  assert.match(script, /question-analysis\.md/);
  assert.match(script, /열림/);
  assert.match(script, /접힘/);
  assert.match(script, /삭제/);
  assert.match(script, /project-fold/);
  assert.match(script, /pin-toggle/);
  assert.match(script, /pin-icon/);
  assert.match(script, /open-profile-document-preview/);
  assert.match(script, /profileDocumentPreview/);
  assert.match(script, /doc-preview-trigger/);
  assert.match(script, /close-profile-document-preview/);
  assert.match(script, /run-document-list/);
  assert.match(script, /toggle-run-extra-doc/);
  assert.match(script, /run-document-chip/);
  assert.match(script, /run-document-toggle-icon/);
  assert.match(script, /projectQuestionIndex: activeQuestionIndex\(project\)/);
  assert.doesNotMatch(script, /id="run-question"/);
  assert.match(script, /conversation-composer/);
  assert.match(script, /대화에 메시지를 보내세요/);
  assert.match(script, /논의 이어가기/);
  assert.match(script, /continuationDisabledAttr/);
  assert.match(script, /discussion-ledger-summary/);
  assert.match(script, /discussion-ledger-updated/);
  assert.match(script, /현재 초점/);
  assert.match(script, /미니 초안/);
  assert.match(script, /남은 쟁점/);
  assert.match(script, /후속 과제/);
  assert.match(script, /토론 상태 열기/);
  assert.match(script, /discussion-ledger\.md/);
  assert.match(script, /speaker-name/);
  assert.match(script, /speakerProviderClass/);
  assert.match(script, /리서처/);
  assert.match(script, /드래프터/);
  assert.match(script, /파이널라이저/);
  assert.match(script, /isNotionPrepassMessage/);
  assert.match(script, /context-researcher/);
  assert.match(script, /if \(appState\?\.(?:runState\?\.)?status === "idle"\) \{\s*liveDiscussionLedger = null;\s*awaitingIntervention = null;/);
  assert.match(script, /if \(runStatus === "paused" && awaitingIntervention\)/);
  assert.match(script, /최종 점검 열기/);
  assert.match(script, /final-checks\.md/);
  assert.match(script, /completed-run-composer-form/);
  assert.match(script, /continueRunDiscussion/);
  assert.match(script, /webviewClientError/);
  assert.match(script, /window\.addEventListener\("error"/);
});

test("buildInsightWorkspaceScript returns parseable browser script", () => {
  const script = buildInsightWorkspaceScript({
    projectSlug: "alpha",
    companyName: "에코마케팅",
    roleName: "Java",
    documents: [
      {
        key: "company",
        tabLabel: "기업 분석",
        title: "에코마케팅",
        content: "# 기업 분석",
        available: true
      }
    ]
  });

  assert.doesNotThrow(() => {
    const factory = new Function("acquireVsCodeApi", "window", "document", "location", script);
    factory(
      () => ({ postMessage() {} }),
      { addEventListener() {} },
      { getElementById() { return null; }, addEventListener() {} },
      { href: "vscode-webview://forjob" }
    );
  });

  assert.match(script, /webviewClientError/);
  assert.match(script, /insightWorkspace/);
  assert.match(script, /window\.addEventListener\("error"/);
});

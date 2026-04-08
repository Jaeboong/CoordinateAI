import { ControllerContext, MessageHandlerMap } from "../controllerContext";

export function createEssayQuestionHandlers(
  ctx: ControllerContext
): Pick<MessageHandlerMap, "completeEssayQuestion"> {
  return {
    completeEssayQuestion: async (message) => {
      const answer = message.answer.trim();
      if (!answer) {
        throw new Error("완료하려면 현재 문항의 답안을 먼저 입력하세요.");
      }

      const project = await ctx.storage().getProject(message.projectSlug);
      const question = project.essayQuestions?.[message.questionIndex]?.trim();
      if (!question) {
        throw new Error("선택한 문항을 프로젝트에서 찾지 못했습니다. 프로젝트 탭에서 문항을 확인해주세요.");
      }

      await ctx.runBusy("문항 답안을 저장하는 중...", async () => {
        await ctx.storage().saveCompletedEssayAnswer(
          message.projectSlug,
          message.questionIndex,
          question,
          answer,
          message.runId
        );
        await ctx.stateStore.refreshProjects(message.projectSlug);
        await ctx.sidebar.postBanner(`문항 ${message.questionIndex + 1} 답안을 완료로 저장했습니다.`);
      });
    }
  };
}

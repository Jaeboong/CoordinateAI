import { stateSource } from "./sidebarState";
import { essayWorkflowSource } from "./sidebarEssayWorkflow";
import { projectQuestionFieldsSource } from "./sidebarProjectQuestionFields";
import { messageHandlingSource } from "./sidebarMessages";
import { markdownSource } from "./sidebarMarkdown";
import { renderSource } from "./sidebarRender";
import { pageRendererSource } from "./sidebarPageRenderers";
import { domEventSource } from "./sidebarDomEvents";

const bootSource = String.raw`
      post({ type: "ready" });
`;

export function buildSidebarScript(): string {
  return materializeInlineScript([
    stateSource,
    projectQuestionFieldsSource,
    essayWorkflowSource,
    messageHandlingSource,
    markdownSource,
    renderSource,
    pageRendererSource,
    domEventSource,
    bootSource
  ].join("\n"));
}

function materializeInlineScript(source: string): string {
  return source
    .replace(/\\`/g, "`")
    .replace(/\\\$\{/g, "${");
}

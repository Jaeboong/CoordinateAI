import { ContextDocument, ProjectRecord } from "./types";
import { ForJobStorage } from "./storage";

export interface CompileContextRequest {
  project: ProjectRecord;
  profileDocuments: ContextDocument[];
  projectDocuments: ContextDocument[];
  selectedDocumentIds: string[];
  question: string;
  draft: string;
}

export interface CompileContextResult {
  markdown: string;
  includedDocuments: ContextDocument[];
}

export class ContextCompiler {
  constructor(private readonly storage: ForJobStorage) {}

  async compile(request: CompileContextRequest): Promise<CompileContextResult> {
    const selectedIds = new Set(request.selectedDocumentIds);
    const includedProfileDocuments = request.profileDocuments.filter(
      (document) => document.pinnedByDefault || selectedIds.has(document.id)
    );
    const pinnedProjectIds = new Set(request.project.pinnedDocumentIds);
    const includedProjectDocuments = request.projectDocuments.filter(
      (document) => document.pinnedByDefault || pinnedProjectIds.has(document.id) || selectedIds.has(document.id)
    );
    const includedDocuments = [...includedProfileDocuments, ...includedProjectDocuments];

    const sections: string[] = ["# ForJob Compiled Context"];
    sections.push("## Project");
    sections.push(`- Company: ${request.project.companyName}`);
    if (request.project.roleName) {
      sections.push(`- Role: ${request.project.roleName}`);
    }
    if (request.project.mainResponsibilities?.trim()) {
      sections.push("");
      sections.push("## Main Responsibilities");
      sections.push(request.project.mainResponsibilities.trim());
    }
    if (request.project.qualifications?.trim()) {
      sections.push("");
      sections.push("## Qualifications");
      sections.push(request.project.qualifications.trim());
    }

    sections.push("## Evaluation Rubric");
    sections.push(request.project.rubric.trim() || "- No rubric configured");

    sections.push("## Essay Question");
    sections.push(request.question.trim());

    sections.push("## Current Draft");
    sections.push(request.draft.trim());

    sections.push("## Common Profile Context");
    sections.push(await this.renderDocumentSection(includedProfileDocuments));

    sections.push("## Project Context");
    sections.push(await this.renderDocumentSection(includedProjectDocuments));

    return {
      markdown: sections.join("\n\n").trim(),
      includedDocuments
    };
  }

  private async renderDocumentSection(documents: ContextDocument[]): Promise<string> {
    if (documents.length === 0) {
      return "_No documents selected._";
    }

    const chunks: string[] = [];
    for (const document of documents) {
      chunks.push(`### ${document.title}`);
      chunks.push(`- Source type: ${document.sourceType}`);
      if (document.note) {
        chunks.push(`- Note: ${document.note}`);
      }

      if (document.normalizedPath) {
        const content = await this.storage.readDocumentNormalizedContent(document);
        chunks.push(content?.trim() || "_Normalized content was empty._");
      } else {
        chunks.push("_Raw file only. Use the stored file and note for reference._");
      }
    }

    return chunks.join("\n\n");
  }
}

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ZodError, z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const stringList = z.array(nonEmptyString);

const agentSpecSchema = z.object({
  schemaVersion: z.number().int().positive(),
  name: nonEmptyString,
  displayName: nonEmptyString,
  kind: nonEmptyString,
  role: nonEmptyString,
  description: nonEmptyString,
  mission: nonEmptyString,
  execution: z.object({
    visibility: nonEmptyString,
    interactionMode: nonEmptyString,
    parallelSafe: z.boolean(),
    writesFinalProse: z.boolean()
  }).passthrough(),
  tools: z.object({
    allowed: stringList,
    forbidden: stringList
  }).passthrough(),
  inputs: z.object({
    required: stringList.min(1),
    optional: stringList.optional().default([])
  }).passthrough(),
  outputs: z.object({
    format: nonEmptyString,
    sections: stringList.min(1),
    mustInclude: stringList.min(1)
  }).passthrough(),
  constraints: z.object({
    forbiddenActions: stringList.min(1),
    requiredBehaviors: stringList.min(1)
  }).passthrough(),
  success: z.object({
    criteria: stringList.min(1)
  }).passthrough()
}).passthrough();

type AgentSpec = z.infer<typeof agentSpecSchema>;

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const agentsDir = path.join(repoRoot, "agents");
  const entries = await fs.readdir(agentsDir, { withFileTypes: true });
  const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name).sort();
  const mdFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort();
  const jsonBaseNames = new Set(jsonFiles.map((file) => path.basename(file, ".json")));
  const mdBaseNames = new Set(mdFiles.map((file) => path.basename(file, ".md")));
  const allBaseNames = [...new Set([...jsonBaseNames, ...mdBaseNames])].sort();

  const errors: string[] = [];
  const validated: Array<{ baseName: string; spec: AgentSpec; markdownPath: string }> = [];

  for (const baseName of allBaseNames) {
    if (!jsonBaseNames.has(baseName)) {
      errors.push(`agents/${baseName}.md is missing a matching agents/${baseName}.json file.`);
      continue;
    }
    if (!mdBaseNames.has(baseName)) {
      errors.push(`agents/${baseName}.json is missing a matching agents/${baseName}.md file.`);
      continue;
    }

    const jsonPath = path.join(agentsDir, `${baseName}.json`);
    const markdownPath = path.join(agentsDir, `${baseName}.md`);
    let spec: AgentSpec;

    try {
      const raw = await fs.readFile(jsonPath, "utf8");
      spec = agentSpecSchema.parse(JSON.parse(raw));
    } catch (error) {
      errors.push(formatJsonError(baseName, error));
      continue;
    }

    if (spec.name !== baseName) {
      errors.push(`agents/${baseName}.json has name="${spec.name}", but the file basename is "${baseName}".`);
    }

    validated.push({ baseName, spec, markdownPath });
  }

  const displayNames = new Map<string, string>();
  for (const { baseName, spec, markdownPath } of validated) {
    if (displayNames.has(spec.displayName)) {
      errors.push(
        `agents/${baseName}.json reuses displayName "${spec.displayName}", already used by ${displayNames.get(spec.displayName)}.`
      );
    } else {
      displayNames.set(spec.displayName, `agents/${baseName}.json`);
    }

    const markdown = await fs.readFile(markdownPath, "utf8");
    const heading = firstHeading(markdown);
    if (!heading) {
      errors.push(`agents/${baseName}.md is missing a top-level "# Heading".`);
      continue;
    }

    if (normalize(heading) !== normalize(spec.displayName)) {
      errors.push(
        `agents/${baseName}.md has heading "${heading}", but agents/${baseName}.json uses displayName "${spec.displayName}".`
      );
    }
  }

  if (errors.length > 0) {
    console.error("Agent spec validation failed:\n");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Validated ${validated.length} agent spec pair(s) in agents/.`);
}

function formatJsonError(baseName: string, error: unknown): string {
  if (error instanceof SyntaxError) {
    return `agents/${baseName}.json is not valid JSON: ${error.message}`;
  }
  if (error instanceof ZodError) {
    const details = error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    return `agents/${baseName}.json does not satisfy the expected contract: ${details}`;
  }
  return `agents/${baseName}.json could not be validated: ${String(error)}`;
}

function firstHeading(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^#\s+(.+?)\s*$/.exec(line.trim());
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

void main().catch((error) => {
  console.error(`validate-agent-specs failed: ${String(error)}`);
  process.exitCode = 1;
});

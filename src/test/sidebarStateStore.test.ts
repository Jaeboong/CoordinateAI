import * as assert from "node:assert/strict";
import test from "node:test";
import { SidebarStateStore } from "../controller/sidebarStateStore";
import { ProjectRecord } from "../core/types";

function createProject(slug: string, companyName: string): ProjectRecord {
  return {
    slug,
    companyName,
    rubric: "- fit",
    pinnedDocumentIds: [],
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:00:00.000Z"
  };
}

test("sidebar state store refreshes only the targeted project slice", async () => {
  const projectRecords = [createProject("alpha", "Alpha"), createProject("beta", "Beta")];
  const counters = {
    listProjects: 0,
    profileDocuments: 0,
    preferences: 0,
    providers: 0,
    documents: { alpha: 0, beta: 0 },
    runs: { alpha: 0, beta: 0 }
  };

  const storage = {
    storageRoot: "/workspace/.forjob",
    ensureInitialized: async () => undefined,
    listProfileDocuments: async () => {
      counters.profileDocuments += 1;
      return [];
    },
    listProjects: async () => {
      counters.listProjects += 1;
      return projectRecords;
    },
    getPreferences: async () => {
      counters.preferences += 1;
      return {};
    },
    getProject: async (projectSlug: string) => projectRecords.find((project) => project.slug === projectSlug),
    listProjectDocuments: async (projectSlug: "alpha" | "beta") => {
      counters.documents[projectSlug] += 1;
      return [];
    },
    listRuns: async (projectSlug: "alpha" | "beta") => {
      counters.runs[projectSlug] += 1;
      return [];
    },
    readOptionalRunArtifact: async () => undefined
  };

  const registry = {
    listRuntimeStates: async () => {
      counters.providers += 1;
      return [];
    },
    refreshRuntimeState: async () => {
      throw new Error("not used");
    }
  };

  const store = new SidebarStateStore({
    workspaceRoot: "/workspace",
    storage: storage as never,
    registry
  });

  await store.initialize();

  assert.equal(counters.documents.alpha, 1);
  assert.equal(counters.documents.beta, 1);
  assert.equal(counters.runs.alpha, 1);
  assert.equal(counters.runs.beta, 1);

  await store.refreshProjects("alpha");

  assert.equal(counters.listProjects, 2);
  assert.equal(counters.documents.alpha, 2);
  assert.equal(counters.documents.beta, 1);
  assert.equal(counters.runs.alpha, 2);
  assert.equal(counters.runs.beta, 1);
});

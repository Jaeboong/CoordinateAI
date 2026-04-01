import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";
import { resolveProviderCommand, withCommandDirectoryInPath } from "../core/providerCommandResolver";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers";

test("provider command resolver prefers the newest nvm-installed CLI", async (t) => {
  const fakeHome = await createTempWorkspace();
  t.after(async () => cleanupTempWorkspace(fakeHome));

  const older = path.join(fakeHome, ".nvm", "versions", "node", "v20.12.2", "bin");
  const newer = path.join(fakeHome, ".nvm", "versions", "node", "v22.22.2", "bin");
  await fs.mkdir(older, { recursive: true });
  await fs.mkdir(newer, { recursive: true });
  await fs.writeFile(path.join(older, "codex"), "");
  await fs.writeFile(path.join(newer, "codex"), "");

  const command = await resolveProviderCommand("codex", "codex", fakeHome);
  assert.equal(command, path.join(newer, "codex"));
});

test("provider command resolver keeps explicit custom commands untouched", async () => {
  const command = await resolveProviderCommand("gemini", "/custom/tools/gemini");
  assert.equal(command, "/custom/tools/gemini");
});

test("runtime environment prepends the command directory to PATH", () => {
  const env = withCommandDirectoryInPath(
    {
      PATH: "/usr/local/bin:/usr/bin"
    },
    "/home/test/.nvm/versions/node/v22.22.2/bin/gemini"
  );

  assert.equal(env.PATH, "/home/test/.nvm/versions/node/v22.22.2/bin:/usr/local/bin:/usr/bin");
});

test("runtime environment moves an existing command directory to the front of PATH", () => {
  const env = withCommandDirectoryInPath(
    {
      PATH: "/home/test/.local/bin:/usr/local/bin:/home/test/.nvm/versions/node/v22.22.2/bin:/usr/bin"
    },
    "/home/test/.nvm/versions/node/v22.22.2/bin/codex"
  );

  assert.equal(
    env.PATH,
    "/home/test/.nvm/versions/node/v22.22.2/bin:/home/test/.local/bin:/usr/local/bin:/usr/bin"
  );
});

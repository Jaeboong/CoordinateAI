import * as assert from "node:assert/strict";
import test from "node:test";
import { RunSessionManager } from "../controller/runSessionManager";

test("run session manager blocks reentry while a run is active", () => {
  const manager = new RunSessionManager();

  manager.start("alpha", "realtime");

  assert.equal(manager.snapshot().status, "running");
  assert.equal(manager.snapshot().projectSlug, "alpha");
  assert.throws(() => manager.assertCanStart("alpha"), /already active/i);
  assert.throws(() => manager.assertCanStart("beta"), /only one run can be active/i);
});

test("paused run keeps its original intervention resolver until resumed", async () => {
  const manager = new RunSessionManager();
  manager.start("alpha", "deepFeedback");

  const intervention = manager.waitForIntervention({
    projectSlug: "alpha",
    runId: "run-1",
    round: 2,
    reviewMode: "deepFeedback",
    coordinatorProvider: "codex"
  });

  assert.equal(manager.snapshot().status, "paused");
  assert.equal(manager.snapshot().runId, "run-1");
  assert.equal(manager.snapshot().round, 2);
  assert.throws(() => manager.assertCanStart("alpha"), /paused/i);
  assert.throws(
    () => manager.waitForIntervention({ projectSlug: "alpha", runId: "run-2", round: 3, reviewMode: "deepFeedback", coordinatorProvider: "claude" }),
    /already waiting/i
  );

  assert.equal(manager.submitIntervention("keep going"), "resumed");

  assert.equal(await intervention, "keep going");
  assert.equal(manager.snapshot().status, "running");
  assert.equal(manager.snapshot().runId, "run-1");
  assert.equal(manager.snapshot().reviewMode, "deepFeedback");

  manager.finish();
  assert.deepEqual(manager.snapshot(), { status: "idle" });
});

test("running realtime session queues user messages until the current writer finishes", () => {
  const manager = new RunSessionManager();
  manager.start("alpha", "realtime");

  assert.equal(manager.submitIntervention("이 방향 말고 협업 중심으로 가자"), "queued");
  assert.deepEqual(manager.drainQueuedMessages(), ["이 방향 말고 협업 중심으로 가자"]);
  assert.deepEqual(manager.drainQueuedMessages(), []);
});

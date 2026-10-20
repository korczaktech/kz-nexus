import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { claimAndStoreJob, safeStoredFilename, sendHeartbeat, validateConfig } from "../src/agent.js";

const validConfig = {
  apiBase: "https://kzdoc.onrender.com/api/v1",
  nodeId: "12345678-1234-1234-1234-123456789abc",
  nodeToken: "knode_" + "A".repeat(64),
};

test("accepts HTTPS production configuration", () => {
  assert.deepEqual(validateConfig(validConfig), validConfig);
});

test("rejects remote HTTP endpoints", () => {
  assert.throws(() => validateConfig({ ...validConfig, apiBase: "http://example.com/api/v1" }), /HTTPS/);
});

test("rejects credentials embedded in API URL", () => {
  assert.throws(() => validateConfig({ ...validConfig, apiBase: "https://user:pass@example.com/api/v1" }), /credenciais/);
});

test("rejects malformed node identifiers and credentials", () => {
  assert.throws(() => validateConfig({ ...validConfig, nodeId: "not-an-id" }), /nodeId/);
  assert.throws(() => validateConfig({ ...validConfig, nodeToken: "secret" }), /nodeToken/);
});

test("sends heartbeat with node credential and validates response", async () => {
  let captured;
  const result = await sendHeartbeat(validConfig, async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ node_id: validConfig.nodeId, status: "online" }),
    };
  });
  assert.equal(result.status, "online");
  assert.equal(captured.url, "https://kzdoc.onrender.com/api/v1/storage/nodes/12345678-1234-1234-1234-123456789abc/heartbeat");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.Authorization, `Bearer ${validConfig.nodeToken}`);
});

test("treats revoked credentials as permanent failure", async () => {
  await assert.rejects(
    sendHeartbeat(validConfig, async () => ({ ok: false, status: 401 })),
    (error) => error.permanent === true && /revogada/.test(error.message),
  );
});

test("retries server failures rather than treating them as successful", async () => {
  await assert.rejects(
    sendHeartbeat(validConfig, async () => ({ ok: false, status: 503 })),
    /HTTP 503/,
  );
});


test("sanitizes file names before writing them to node storage", () => {
  assert.equal(safeStoredFilename("../../private\\\\notes.nsx"), "notes.nsx");
  assert.equal(safeStoredFilename(""), "arquivo");
});

test("claims a save job, persists its content, and confirms the durable write", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "nexus-node-test-"));
  const calls = [];
  const result = await claimAndStoreJob(validConfig, {
    storageDir,
    log: { info() {} },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/jobs/claim")) {
        return { ok: true, status: 200, json: async () => ({ job: {
          id: "job-1", name: "sample.nsx", content: "{\\\"format\\\":\\\"nsx\\\"}", mime_type: "application/x-korczak-nexus",
        } }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: "completed" }) };
    },
  });
  try {
    assert.equal(result.status, "completed");
    assert.equal(await readFile(result.stored_path, "utf8"), "{\\\"format\\\":\\\"nsx\\\"}");
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /jobs\\/job-1\\/complete$/);
    assert.equal(JSON.parse(calls[1].options.body).status, "completed");
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});

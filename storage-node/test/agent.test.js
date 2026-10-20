import test from "node:test";
import assert from "node:assert/strict";
import { sendHeartbeat, validateConfig } from "../src/agent.js";

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

import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { claimAndStoreJob, getUserDocumentsDir, normalizeReportedStoragePath, readStorageMetrics, safeStoredFilename, sendHeartbeat, validateConfig } from "../src/agent.js";

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
          id: "job-1", user_id: "user-a", name: "sample.nsx", content: "{\\\"format\\\":\\\"nsx\\\"}", mime_type: "application/x-korczak-nexus",
        } }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: "completed" }) };
    },
  });
  try {
    assert.equal(result.status, "completed");
    assert.equal(await readFile(result.stored_path, "utf8"), "{\\\"format\\\":\\\"nsx\\\"}");
    assert.equal(calls.length, 2);
    assert.ok(calls[1].url.endsWith("/jobs/job-1/complete"));
    assert.equal(JSON.parse(calls[1].options.body).status, "completed");
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});


test("initializes .Nexus users, system, and node metadata directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexus-layout-test-"));
  try {
    const metrics = await readStorageMetrics(root, validConfig.nodeId);
    assert.ok(metrics.total_bytes > 0);
    assert.equal((await stat(join(root, "users"))).isDirectory(), true);
    assert.equal((await stat(join(root, "system"))).isDirectory(), true);
    assert.equal((await stat(join(root, "system", "nodes", validConfig.nodeId))).isDirectory(), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("routes each user's documents into the shared .Nexus directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexus-root-test-"));
  const expectedDir = join(root, "users", "user-a", "documents");
  assert.equal(getUserDocumentsDir("user-a", root), expectedDir);
  assert.throws(() => getUserDocumentsDir("../other-user", root), /Identificador inválido/);

  const calls = [];
  try {
    const result = await claimAndStoreJob(validConfig, {
      nexusRoot: root,
      log: { info() {} },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith("/jobs/claim")) {
          return { ok: true, status: 200, json: async () => ({ job: {
            id: "job-nexus-root", user_id: "user-a", name: "hello.nsx", content: "document",
          } }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: "completed" }) };
      },
    });
    assert.equal(result.status, "completed");
    assert.equal(result.stored_path, join(expectedDir, "job-nexus-root-hello.nsx"));
    assert.equal(await readFile(result.stored_path, "utf8"), "document");
    assert.equal(JSON.parse(calls[1].options.body).stored_path, result.stored_path);
    assert.equal((await stat(join(root, "system", "nodes", validConfig.nodeId))).isDirectory(), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports directory creation failures instead of confirming a physical write", async () => {
  const parent = await mkdtemp(join(tmpdir(), "nexus-node-mkdir-test-"));
  const storageDir = join(parent, "not-a-directory");
  const { writeFile: createFile } = await import("node:fs/promises");
  await createFile(storageDir, "block mkdir");
  const calls = [];
  try {
    await assert.rejects(
      claimAndStoreJob(validConfig, {
        storageDir,
        log: { info() {} },
        fetchImpl: async (url, options) => {
          calls.push({ url, options });
          if (url.endsWith("/jobs/claim")) {
            return { ok: true, status: 200, json: async () => ({ job: {
              id: "job-dir-fail", user_id: "user-a", name: "sample.nsx", content: "payload",
            } }) };
          }
          return { ok: true, status: 200, json: async () => ({ status: "failed" }) };
        },
      }),
      /Não foi possível gravar o arquivo no nó/,
    );
    const completion = calls.find((call) => call.url.endsWith("/jobs/job-dir-fail/complete"));
    assert.ok(completion);
    assert.equal(JSON.parse(completion.options.body).status, "failed");
    assert.equal(JSON.parse(completion.options.body).stored_path, null);
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(parent, { recursive: true, force: true });
  }
});

test("reports file write conflicts instead of overwriting an existing file", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "nexus-node-write-test-"));
  const { writeFile: createFile } = await import("node:fs/promises");
  await createFile(join(storageDir, "job-write-fail-sample.nsx"), "existing");
  const calls = [];
  try {
    await assert.rejects(
      claimAndStoreJob(validConfig, {
        storageDir,
        log: { info() {} },
        fetchImpl: async (url, options) => {
          calls.push({ url, options });
          if (url.endsWith("/jobs/claim")) {
            return { ok: true, status: 200, json: async () => ({ job: {
              id: "job-write-fail", user_id: "user-a", name: "sample.nsx", content: "new payload",
            } }) };
          }
          return { ok: true, status: 200, json: async () => ({ status: "failed" }) };
        },
      }),
      /Não foi possível gravar o arquivo no nó/,
    );
    assert.equal(await readFile(join(storageDir, "job-write-fail-sample.nsx"), "utf8"), "existing");
    const completion = calls.find((call) => call.url.endsWith("/jobs/job-write-fail/complete"));
    assert.ok(completion);
    assert.equal(JSON.parse(completion.options.body).status, "failed");
    assert.equal(JSON.parse(completion.options.body).stored_path, null);
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});



test("retries transient completion failures and normalizes Android storage aliases", async () => {
  assert.equal(normalizeReportedStoragePath("/storage/self/primary/.Nexus/users/user-a/documents/a.nsx"), "/storage/emulated/0/.Nexus/users/user-a/documents/a.nsx");
  assert.equal(normalizeReportedStoragePath("/tmp/.Nexus/a.nsx"), "/tmp/.Nexus/a.nsx");
  const root = await mkdtemp(join(tmpdir(), "nexus-node-retry-test-"));
  const calls = [];
  let completionAttempts = 0;
  try {
    const result = await claimAndStoreJob(validConfig, {
      nexusRoot: root,
      log: { info() {} },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith("/jobs/claim")) {
          return { ok: true, status: 200, json: async () => ({ job: {
            id: "job-retry", user_id: "user-a", name: "hello.nsx", content: "document",
          } }) };
        }
        completionAttempts += 1;
        if (completionAttempts === 1) {
          return { ok: false, status: 503, text: async () => "temporarily unavailable" };
        }
        return { ok: true, status: 200, json: async () => ({ status: "completed" }) };
      },
    });
    assert.equal(result.status, "completed");
    assert.equal(completionAttempts, 2);
    assert.equal(JSON.parse(calls.at(-1).options.body).stored_path, result.stored_path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts an identical existing file as a recoverable prior write", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexus-node-recovery-test-"));
  const target = join(root, "users", "user-a", "documents", "job-recover-sample.nsx");
  const { mkdir: makeDir, writeFile: createFile } = await import("node:fs/promises");
  await makeDir(join(root, "users", "user-a", "documents"), { recursive: true });
  await createFile(target, "same payload");
  const calls = [];
  try {
    const result = await claimAndStoreJob(validConfig, {
      nexusRoot: root,
      log: { info() {} },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (url.endsWith("/jobs/claim")) {
          return { ok: true, status: 200, json: async () => ({ job: {
            id: "job-recover", user_id: "user-a", name: "sample.nsx", content: "same payload",
          } }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: "completed" }) };
      },
    });
    assert.equal(result.status, "completed");
    assert.equal(await readFile(target, "utf8"), "same payload");
    assert.equal(JSON.parse(calls.at(-1).options.body).status, "completed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

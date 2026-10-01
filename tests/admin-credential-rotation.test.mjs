import assert from "node:assert/strict";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { parseEnv } from "node:util";

import {
  ADMIN_PASSWORD_MIN_LENGTH,
  ADMIN_ROTATION_OWNER_UID,
  ADMIN_SESSION_SECRET_BYTES,
  ADMIN_SESSION_SECRET_ROLE,
  ADMIN_SESSION_SECRET_ROTATION_EFFECT,
  CLOUDFLARE_API_BASE_URL,
  REMOTE_BULK_ATOMICITY,
  ROTATION_BACKUP_SUFFIX,
  ROTATION_LOCK_SUFFIX,
  ROTATION_PENDING_SUFFIX,
  buildRemoteSecretBundle,
  operatorQuestion,
  parseRotationInvocation,
  readAdminRuntimeSource,
  runAdminRotation,
  validateAdminPassword,
  validatePasswordConfirmation
} from "../scripts/admin-credential-rotation.mjs";
import {
  PRODUCTION_TARGETS,
  REQUIRED_RUNTIME_KEYS,
  REQUIRED_SECRET_KEYS,
  STAGING_TARGETS
} from "../scripts/run-staging-wrangler.mjs";
import {
  handleAdminLogin,
  isAdminAuthenticated
} from "../src/admin/auth.ts";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/constants.ts";

const OLD_PASSWORD = "Old-Staging-Admin-2026!";
const NEW_PASSWORD = "New-Staging-Admin-2026!";
const CANARY_PASSWORD = "Canary-Staging-Secret-2026!";
const SYNTHETIC_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";

function syntheticRuntimeValues(overrides = {}) {
  return {
    NOTION_TOKEN: "synthetic-notion-token",
    NOTION_ACCIDENT_DB_ID: "synthetic-accident-db-id",
    NOTION_ATTACHMENT_DB_ID: "synthetic-attachment-db-id",
    ADMIN_PASSWORD: OLD_PASSWORD,
    ADMIN_SESSION_SECRET: "synthetic-admin-session-secret",
    TURNSTILE_SITE_KEY: "synthetic-turnstile-site-key",
    TURNSTILE_SECRET_KEY: "synthetic-turnstile-secret-key",
    ...overrides
  };
}

function serialize(values) {
  return `${REQUIRED_RUNTIME_KEYS.map(
    (key) => `${key}=${JSON.stringify(values[key])}`
  ).join("\n")}\n`;
}

function createRuntimeFixture(options = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "sawstop-admin-rotation-"));
  const sourcePath = resolve(root, ".dev.vars.staging");
  const values = syntheticRuntimeValues(options.values);
  writeFileSync(sourcePath, serialize(values), { mode: 0o600 });
  return {
    root,
    sourcePath,
    pendingPath: `${sourcePath}${ROTATION_PENDING_SUFFIX}`,
    lockPath: `${sourcePath}${ROTATION_LOCK_SUFFIX}`,
    backupPath: `${sourcePath}${ROTATION_BACKUP_SUFFIX}`,
    values,
    options: {
      sourcePath,
      expectedUid: ADMIN_ROTATION_OWNER_UID,
      assertRuntimeValues() {},
      env: {},
      credentialSource: () => ({
        accountId: SYNTHETIC_ACCOUNT_ID,
        token: "synthetic-worker-write-token-must-not-leak"
      }),
      randomBytes: (size) => Buffer.alloc(size, 0x42),
      collectPassword: async () => ({
        password: NEW_PASSWORD,
        confirmation: NEW_PASSWORD
      }),
      confirmRemote: async () => true,
      log() {}
    }
  };
}

async function withRuntimeFixture(options, action) {
  const fixture = createRuntimeFixture(options);
  try {
    return await action(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function workerMissingResponse() {
  return response(
    { success: false, result: null, errors: [{ code: 10007 }] },
    404
  );
}

function secretListResponse() {
  return response({
    success: true,
    result: REQUIRED_SECRET_KEYS.map((name) => ({ name, type: "secret_text" })),
    errors: []
  });
}

function fetchSequence(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    assert.ok(next, "unexpected extra Cloudflare request");
    return next;
  };
  return { calls, fetchImpl };
}

function readFixtureValues(path) {
  return parseEnv(readFileSync(path, "utf8"));
}

function nativeIo(overrides = {}) {
  return {
    chmodSync,
    closeSync,
    fchmodSync,
    fstatSync,
    fsyncSync,
    lstatSync,
    openSync,
    readFileSync,
    renameSync,
    statSync,
    unlinkSync,
    writeFileSync,
    ...overrides
  };
}

test("operator commands exist with exact STAGING-only invocations", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    packageJson.scripts["rotate:admin-password:staging"],
    "node scripts/admin-credential-rotation.mjs password staging"
  );
  assert.equal(
    packageJson.scripts["rotate:admin-credentials:staging"],
    "node scripts/admin-credential-rotation.mjs credentials staging"
  );
});

test("rotation invocation accepts only the exact STAGING environment", () => {
  assert.equal(parseRotationInvocation(["password", "staging"]), "password");
  assert.equal(
    parseRotationInvocation(["credentials", "staging"]),
    "credentials"
  );
});

test("rotation invocation rejects Production and arbitrary targets", () => {
  assert.throws(
    () => parseRotationInvocation(["password", "production"]),
    /exact STAGING/
  );
  assert.throws(
    () => parseRotationInvocation(["password", "preview"]),
    /exact STAGING/
  );
  assert.throws(
    () =>
      parseRotationInvocation([
        "password",
        "staging",
        "--name",
        PRODUCTION_TARGETS.worker
      ]),
    /Extra rotation arguments/
  );
});

test("hidden input disables echo and never writes the entered canary", async () => {
  let stderr = "";
  const sttyCalls = [];
  const entered = CANARY_PASSWORD;
  const result = await operatorQuestion("새 비밀번호: ", true, {
    stdin: { isTTY: true },
    stderr: { isTTY: true, write: (value) => (stderr += value) },
    spawnSync: (_command, args) => {
      sttyCalls.push(args.join(" "));
      return { status: 0, error: undefined };
    },
    createInterface: () => ({
      question: async () => entered,
      close() {}
    })
  });
  assert.equal(result, entered);
  assert.deepEqual(sttyCalls, ["-echo", "echo"]);
  assert.equal(stderr.includes(entered), false);
});

test("password confirmation rejects mismatch", () => {
  assert.throws(
    () => validatePasswordConfirmation(NEW_PASSWORD, `${NEW_PASSWORD}x`),
    /does not match/
  );
});

test("password contract rejects empty and weak passwords", () => {
  assert.throws(() => validateAdminPassword(""), /must not be empty/);
  assert.throws(
    () => validateAdminPassword(` ${NEW_PASSWORD}`),
    /must not start or end with whitespace/
  );
  assert.throws(
    () => validateAdminPassword(`${NEW_PASSWORD} `),
    /must not start or end with whitespace/
  );
  assert.throws(
    () => validateAdminPassword("a".repeat(ADMIN_PASSWORD_MIN_LENGTH)),
    /at least 3/
  );
  assert.equal(validateAdminPassword(NEW_PASSWORD), NEW_PASSWORD);
});

test("existing local runtime source is required", () => {
  const root = mkdtempSync(resolve(tmpdir(), "sawstop-admin-rotation-missing-"));
  try {
    assert.throws(
      () =>
        readAdminRuntimeSource({
          sourcePath: resolve(root, ".dev.vars.staging"),
          expectedUid: ADMIN_ROTATION_OWNER_UID,
          assertRuntimeValues() {}
        }),
      /missing or inaccessible/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local runtime source rejects wrong mode", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    chmodSync(fixture.sourcePath, 0o640);
    assert.throws(
      () => readAdminRuntimeSource(fixture.options),
      /permissions must be 0600/
    );
  });
});

test("local runtime source rejects wrong owner", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const io = nativeIo({
      lstatSync(path) {
        const info = lstatSync(path);
        return path === fixture.sourcePath
          ? Object.assign(Object.create(Object.getPrototypeOf(info)), info, {
              uid: ADMIN_ROTATION_OWNER_UID + 1
            })
          : info;
      }
    });
    assert.throws(
      () => readAdminRuntimeSource({ ...fixture.options, io }),
      /owner must be uid/
    );
  });
});

test("local runtime source rejects symlinks", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const linkPath = resolve(fixture.root, ".dev.vars.staging-link");
    symlinkSync(fixture.sourcePath, linkPath);
    assert.throws(
      () =>
        readAdminRuntimeSource({
          ...fixture.options,
          sourcePath: linkPath
        }),
      /regular non-symlink/
    );
  });
});

test("temp-write failure retains the existing good credential", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    let writeCount = 0;
    const io = nativeIo({
      writeFileSync(...args) {
        writeCount += 1;
        if (writeCount === 2) throw new Error("synthetic write failure");
        return writeFileSync(...args);
      }
    });
    const remote = fetchSequence([workerMissingResponse()]);
    await assert.rejects(
      runAdminRotation("password", {
        ...fixture.options,
        io,
        fetchImpl: remote.fetchImpl
      }),
      /pending source could not be written safely/
    );
    assert.equal(readFixtureValues(fixture.sourcePath).ADMIN_PASSWORD, OLD_PASSWORD);
    assert.equal(existsSync(fixture.pendingPath), false);
    assert.equal(existsSync(fixture.lockPath), false);
  });
});

test("pre-deploy mode atomically updates local source without remote WRITE", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const remote = fetchSequence([workerMissingResponse()]);
    const result = await runAdminRotation("password", {
      ...fixture.options,
      fetchImpl: remote.fetchImpl
    });
    assert.equal(result.state, "PRE_DEPLOY");
    assert.equal(result.remoteWriteCount, 0);
    assert.deepEqual(remote.calls.map((call) => call.init.method), ["GET"]);
    const values = readFixtureValues(fixture.sourcePath);
    assert.equal(values.ADMIN_PASSWORD, NEW_PASSWORD);
    assert.equal(
      values.ADMIN_SESSION_SECRET,
      fixture.values.ADMIN_SESSION_SECRET
    );
    assert.equal((statSync(fixture.sourcePath).mode & 0o777), 0o600);
    assert.equal(existsSync(fixture.backupPath), false);
  });
});

test("atomic replacement failure retains old source and secure pending candidate", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const io = nativeIo({
      renameSync: () => {
        throw new Error("synthetic rename failure");
      }
    });
    const remote = fetchSequence([workerMissingResponse()]);
    await assert.rejects(
      runAdminRotation("password", {
        ...fixture.options,
        io,
        fetchImpl: remote.fetchImpl
      }),
      /existing credential is retained/
    );
    assert.equal(readFixtureValues(fixture.sourcePath).ADMIN_PASSWORD, OLD_PASSWORD);
    assert.equal(readFixtureValues(fixture.pendingPath).ADMIN_PASSWORD, NEW_PASSWORD);
    assert.equal((statSync(fixture.pendingPath).mode & 0o777), 0o600);
  });
});

test("post-rename readback durability failure restores old source and pending candidate", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    let fsyncCount = 0;
    const io = nativeIo({
      fsyncSync(descriptor) {
        fsyncCount += 1;
        if (fsyncCount === 4) throw new Error("synthetic directory fsync failure");
        return fsyncSync(descriptor);
      }
    });
    const remote = fetchSequence([workerMissingResponse()]);
    await assert.rejects(
      runAdminRotation("password", {
        ...fixture.options,
        io,
        fetchImpl: remote.fetchImpl
      }),
      /existing credential is retained/
    );
    assert.equal(readFixtureValues(fixture.sourcePath).ADMIN_PASSWORD, OLD_PASSWORD);
    assert.equal(readFixtureValues(fixture.pendingPath).ADMIN_PASSWORD, NEW_PASSWORD);
    assert.equal(existsSync(fixture.backupPath), false);
  });
});

test("post-deploy mocked mode performs one exact bulk PATCH and readback", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const remote = fetchSequence([
      secretListResponse(),
      response({ success: true, result: null, errors: [] }),
      secretListResponse()
    ]);
    const result = await runAdminRotation("password", {
      ...fixture.options,
      fetchImpl: remote.fetchImpl
    });
    assert.equal(result.state, "POST_DEPLOY");
    assert.equal(result.remoteWriteCount, 1);
    assert.deepEqual(
      remote.calls.map((call) => call.init.method),
      ["GET", "PATCH", "GET"]
    );
    assert.match(remote.calls[1].url, /sawstop-finger-save-staging\/secrets-bulk$/);
    const body = JSON.parse(remote.calls[1].init.body);
    assert.deepEqual(Object.keys(body.secrets), ["ADMIN_PASSWORD"]);
  });
});

test("remote confirmation rejection performs no WRITE and asks for no password", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    let passwordCollected = false;
    const remote = fetchSequence([secretListResponse()]);
    await assert.rejects(
      runAdminRotation("password", {
        ...fixture.options,
        fetchImpl: remote.fetchImpl,
        confirmRemote: async () => false,
        collectPassword: async () => {
          passwordCollected = true;
          return { password: NEW_PASSWORD, confirmation: NEW_PASSWORD };
        }
      }),
      /cancelled before WRITE/
    );
    assert.equal(passwordCollected, false);
    assert.deepEqual(remote.calls.map((call) => call.init.method), ["GET"]);
    assert.equal(readFixtureValues(fixture.sourcePath).ADMIN_PASSWORD, OLD_PASSWORD);
  });
});

test("explicit remote failure retains old local source and one secure candidate", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const remote = fetchSequence([
      secretListResponse(),
      response({ success: false, result: null, errors: [{ code: 99999 }] }, 500)
    ]);
    await assert.rejects(
      runAdminRotation("password", {
        ...fixture.options,
        fetchImpl: remote.fetchImpl
      }),
      /automatic retry is forbidden/
    );
    assert.equal(readFixtureValues(fixture.sourcePath).ADMIN_PASSWORD, OLD_PASSWORD);
    assert.equal(readFixtureValues(fixture.pendingPath).ADMIN_PASSWORD, NEW_PASSWORD);
    assert.equal(remote.calls.filter((call) => call.init.method === "PATCH").length, 1);
  });
});

test("ambiguous remote result is never retried and is contained", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const remote = fetchSequence([
      secretListResponse(),
      new Error("synthetic network loss")
    ]);
    await assert.rejects(
      runAdminRotation("password", {
        ...fixture.options,
        fetchImpl: remote.fetchImpl
      }),
      /ambiguous; automatic retry is forbidden/
    );
    assert.deepEqual(
      remote.calls.map((call) => call.init.method),
      ["GET", "PATCH"]
    );
    assert.equal(readFixtureValues(fixture.sourcePath).ADMIN_PASSWORD, OLD_PASSWORD);
    assert.equal(existsSync(fixture.pendingPath), true);
  });
});

test("post-WRITE readback ambiguity does not repeat the WRITE", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const remote = fetchSequence([
      secretListResponse(),
      response({ success: true, result: null, errors: [] }),
      new Error("synthetic readback loss")
    ]);
    await assert.rejects(
      runAdminRotation("password", {
        ...fixture.options,
        fetchImpl: remote.fetchImpl
      }),
      /automatic retry is forbidden/
    );
    assert.equal(remote.calls.filter((call) => call.init.method === "PATCH").length, 1);
    assert.equal(readFixtureValues(fixture.sourcePath).ADMIN_PASSWORD, OLD_PASSWORD);
    assert.equal(existsSync(fixture.pendingPath), true);
  });
});

test("emergency rotation sends both admin materials in one request", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const remote = fetchSequence([
      secretListResponse(),
      response({ success: true, result: null, errors: [] }),
      secretListResponse()
    ]);
    const result = await runAdminRotation("credentials", {
      ...fixture.options,
      fetchImpl: remote.fetchImpl
    });
    assert.deepEqual(result.rotatedKeys, ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"]);
    const body = JSON.parse(remote.calls[1].init.body);
    assert.deepEqual(Object.keys(body.secrets).sort(), [
      "ADMIN_PASSWORD",
      "ADMIN_SESSION_SECRET"
    ]);
    assert.equal(
      body.secrets.ADMIN_SESSION_SECRET.text.length > ADMIN_SESSION_SECRET_BYTES,
      true
    );
    const values = readFixtureValues(fixture.sourcePath);
    assert.notEqual(values.ADMIN_SESSION_SECRET, fixture.values.ADMIN_SESSION_SECRET);
  });
});

test("normal rotation preserves ADMIN_SESSION_SECRET", () => {
  const values = syntheticRuntimeValues();
  const bundle = buildRemoteSecretBundle("password", {
    ...values,
    ADMIN_PASSWORD: NEW_PASSWORD
  });
  assert.deepEqual(Object.keys(bundle.secrets), ["ADMIN_PASSWORD"]);
  assert.equal(values.ADMIN_SESSION_SECRET, "synthetic-admin-session-secret");
});

test("remote bulk contract records one-request but not unproven transactional atomicity", () => {
  assert.equal(
    REMOTE_BULK_ATOMICITY,
    "ONE_PATCH_REQUEST_SERVER_TRANSACTIONAL_ATOMICITY_NOT_CONFIRMED"
  );
});

test("exact STAGING target is the only Cloudflare resource accessed", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const remote = fetchSequence([
      secretListResponse(),
      response({ success: true, result: null, errors: [] }),
      secretListResponse()
    ]);
    await runAdminRotation("password", {
      ...fixture.options,
      fetchImpl: remote.fetchImpl
    });
    for (const call of remote.calls) {
      assert.equal(call.url.startsWith(CLOUDFLARE_API_BASE_URL), true);
      assert.equal(call.url.includes(`/scripts/${STAGING_TARGETS.worker}/`), true);
      assert.equal(call.url.includes(`/scripts/${PRODUCTION_TARGETS.worker}/`), false);
      assert.equal(call.url.includes(PRODUCTION_TARGETS.hostname), false);
    }
  });
});

test("remote preflight refuses a secret-name drift before WRITE", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const remote = fetchSequence([
      response({ success: true, result: [{ name: "ADMIN_PASSWORD" }], errors: [] })
    ]);
    await assert.rejects(
      runAdminRotation("password", {
        ...fixture.options,
        fetchImpl: remote.fetchImpl
      }),
      /do not match the exact STAGING contract/
    );
    assert.deepEqual(remote.calls.map((call) => call.init.method), ["GET"]);
  });
});

test("canary values never appear in success stdout/stderr-equivalent logs", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const messages = [];
    const remote = fetchSequence([workerMissingResponse()]);
    await runAdminRotation("password", {
      ...fixture.options,
      fetchImpl: remote.fetchImpl,
      collectPassword: async () => ({
        password: CANARY_PASSWORD,
        confirmation: CANARY_PASSWORD
      }),
      log: (message) => messages.push(message)
    });
    assert.equal(messages.join("\n").includes(CANARY_PASSWORD), false);
    assert.equal(
      JSON.stringify(remote.calls.map(({ url, init }) => ({ url, method: init.method }))).includes(
        CANARY_PASSWORD
      ),
      false
    );
  });
});

test("canary values never appear in remote failure diagnostics", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    const remote = fetchSequence([secretListResponse(), new Error(CANARY_PASSWORD)]);
    let message = "";
    try {
      await runAdminRotation("password", {
        ...fixture.options,
        fetchImpl: remote.fetchImpl,
        collectPassword: async () => ({
          password: CANARY_PASSWORD,
          confirmation: CANARY_PASSWORD
        })
      });
    } catch (error) {
      message = error.message;
    }
    assert.equal(message.includes(CANARY_PASSWORD), false);
  });
});

test("password recovery does not request or validate the old password", async () => {
  await withRuntimeFixture({}, async (fixture) => {
    let collectionCount = 0;
    const remote = fetchSequence([workerMissingResponse()]);
    await runAdminRotation("password", {
      ...fixture.options,
      fetchImpl: remote.fetchImpl,
      collectPassword: async () => {
        collectionCount += 1;
        return { password: NEW_PASSWORD, confirmation: NEW_PASSWORD };
      }
    });
    assert.equal(collectionCount, 1);
    assert.equal(readFixtureValues(fixture.sourcePath).ADMIN_PASSWORD, NEW_PASSWORD);
  });
});

test("ADMIN_SESSION_SECRET is the stateless admin cookie HMAC signing key", () => {
  assert.equal(
    ADMIN_SESSION_SECRET_ROLE,
    "HMAC_SHA256_SIGNING_KEY_FOR_STATELESS_ADMIN_SESSION_COOKIE"
  );
  assert.equal(
    ADMIN_SESSION_SECRET_ROTATION_EFFECT,
    "CONFIRMED_INVALIDATES_EXISTING_ADMIN_SESSIONS"
  );
});

test("rotating ADMIN_SESSION_SECRET invalidates an existing real admin cookie", async () => {
  const env = {
    ADMIN_PASSWORD: NEW_PASSWORD,
    ADMIN_SESSION_SECRET: "session-signing-secret-before-rotation",
    ADMIN_AUTH_LOCK: {
      idFromName: () => ({ toString: () => "admin-account" }),
      get: () => ({
        fetch: async () =>
          response({ ok: true, status: "success" })
      })
    }
  };
  const form = new FormData();
  form.set("password", NEW_PASSWORD);
  const login = await handleAdminLogin(
    new Request("https://staging.example.test/admin/login", {
      method: "POST",
      body: form
    }),
    env
  );
  const sessionHeader = login.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=`));
  assert.ok(sessionHeader);
  const cookie = sessionHeader.split(";", 1)[0];
  const authenticatedRequest = new Request("https://staging.example.test/admin", {
    headers: { Cookie: cookie }
  });
  assert.equal(await isAdminAuthenticated(authenticatedRequest, env), true);
  assert.equal(
    await isAdminAuthenticated(authenticatedRequest, {
      ...env,
      ADMIN_SESSION_SECRET: "session-signing-secret-after-rotation"
    }),
    false
  );
});

test("ADMIN_PASSWORD login flow uses the configured runtime value", async () => {
  const attempts = [];
  const env = {
    ADMIN_PASSWORD: NEW_PASSWORD,
    ADMIN_SESSION_SECRET: "synthetic-session-secret",
    ADMIN_AUTH_LOCK: {
      idFromName: () => ({ toString: () => "admin-account" }),
      get: () => ({
        fetch: async (request) => {
          attempts.push(await request.json());
          return response({ ok: true, status: "invalid" });
        }
      })
    }
  };
  for (const password of [NEW_PASSWORD, "wrong-password"]) {
    const form = new FormData();
    form.set("password", password);
    await handleAdminLogin(
      new Request("https://staging.example.test/admin/login", {
        method: "POST",
        body: form
      }),
      env
    );
  }
  assert.deepEqual(attempts, [{ passwordValid: true }, { passwordValid: false }]);
});

import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import test from "node:test";
import {
  ACCIDENT_DB_PROPERTY_NAMES as P,
  ACCIDENT_STATUS,
  ADMIN_ACCIDENT_SEARCH_ROUTE,
  ADMIN_SESSION_COOKIE_NAME,
  CUSTOMER_FAILURE_MESSAGE,
  NOTION_API_VERSION
} from "../src/constants.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const STAGING = "https://sawstop-finger-save-staging.chbjbj.workers.dev";
const HEADER = "X-T58-Pagination-Proof";
const CHALLENGE = "v1.12345678-1234-4234-8234-123456789abc";
const RECEIPTS = ["202609091440-0560", "202609091907-0570", "202609101358-6841"];
const TARGET = RECEIPTS[2];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// All values are local test sentinels, never loaded from credentials or fixtures.
const ENV = {
  NOTION_TOKEN: "LOCAL_ONLY_NOTION_TOKEN",
  NOTION_ACCIDENT_DB_ID: "LOCAL_ONLY_DATABASE_ID",
  ADMIN_SESSION_SECRET: "LOCAL_ONLY_SESSION_SECRET",
  ADMIN_PASSWORD: "LOCAL_ONLY_ADMIN_PASSWORD"
};
const PHONE = "010-0000-6841";
const CURSOR = "LOCAL_ONLY_RAW_CURSOR_A";
const SENSITIVE = [
  ...Object.values(ENV), PHONE, CURSOR, "LOCAL_ONLY_PAGE_ID", "LOCAL_ONLY_DATA_SOURCE_ID",
  "LOCAL_ONLY_OPERATOR", "LOCAL_ONLY_SERIAL", "LOCAL_ONLY_UPSTREAM_ERROR",
  "LOCAL_ONLY_AUTHORIZATION", "LOCAL_ONLY_COOKIE", "2001-02-03"
];

function sessionCookie(exp = Date.now() + 60_000, name = ADMIN_SESSION_COOKIE_NAME) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const signature = createHmac("sha256", ENV.ADMIN_SESSION_SECRET).update(payload).digest("hex");
  return `${name}=${payload}.${signature}`;
}

function candidate(receipt = TARGET, id = "LOCAL_ONLY_PAGE_ID", status = ACCIDENT_STATUS.received,
  phone = PHONE) {
  return {
    id,
    parent: { database_id: ENV.NOTION_ACCIDENT_DB_ID, data_source_id: "LOCAL_ONLY_DATA_SOURCE_ID" },
    properties: {
      [P.receiptNumber]: { title: [{ plain_text: receipt }] },
      [P.status]: { status: { name: status } },
      [P.phone]: { phone_number: phone },
      [P.occurredAt]: { date: { start: "2001-02-03" } },
      [P.operatorName]: { rich_text: [{ plain_text: "LOCAL_ONLY_OPERATOR" }] },
      [P.sawSerialNumber]: { rich_text: [{ plain_text: "LOCAL_ONLY_SERIAL" }] }
    }
  };
}

function page(results = [], has_more = false, next_cursor = null) {
  return { results, has_more, next_cursor };
}

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

function keys(value, expected) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
}

function privacy(response, body, forbidden = []) {
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("Pragma"), "no-cache");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.deepEqual([...response.headers.keys()].sort(), [
    "cache-control", "content-type", "pragma", "x-content-type-options"
  ]);
  if (body.ok === true) {
    assert.equal(response.status, 200);
    keys(body, ["ok", "proof"]);
    const proof = body.proof;
    keys(proof, ["schema", "challenge", "workerRequestId", "searchBranch", "page1", "page2",
      "target", "finalResultCount"]);
    assert.equal(proof.schema, "t58-pagination-proof-v1");
    assert.equal(proof.searchBranch, "exact-receipt");
    assert.match(proof.challenge, /^v1\.[0-9a-fA-F-]{36}$/);
    assert.equal(proof.challenge.length, 39);
    assert.match(proof.workerRequestId, UUID);
    assert.notEqual(proof.workerRequestId, proof.challenge.slice(3));
    keys(proof.page1, ["requestObserved", "startCursorPresent", "hasMore", "nextCursorNonempty"]);
    keys(proof.page2, ["requestObserved", "startCursorMatchesPage1"]);
    for (const value of [...Object.values(proof.page1), ...Object.values(proof.page2)]) {
      assert.equal(typeof value, "boolean");
    }
    keys(proof.target, ["receipt", "seenOnPage1", "seenOnPage2", "occurrences", "includedFromPage2"]);
    assert.ok(RECEIPTS.includes(proof.target.receipt));
    for (const name of ["seenOnPage1", "seenOnPage2", "includedFromPage2"]) {
      assert.equal(typeof proof.target[name], "boolean");
    }
    assert.ok(Number.isInteger(proof.target.occurrences) && proof.target.occurrences >= 0);
    assert.ok(Number.isInteger(proof.finalResultCount) && proof.finalResultCount >= 0 &&
      proof.finalResultCount <= 20);
  } else {
    keys(body, ["ok", "message"]);
    assert.equal(body.ok, false);
    assert.ok([400, 401, 500].includes(response.status));
    assert.equal(body.message, response.status === 401 ? "Unauthorized" : CUSTOMER_FAILURE_MESSAGE);
  }
  // Exact recursive key/value contracts above prevent extra payloads even if sentinels change.
  const serialized = JSON.stringify({ body, headers: [...response.headers] });
  for (const value of [...SENSITIVE, ...forbidden]) {
    if (value) assert.equal(serialized.includes(value), false, "private response leaked a test sentinel");
  }
}

function accepted(proof) {
  return proof.page1.requestObserved && !proof.page1.startCursorPresent && proof.page1.hasMore &&
    proof.page1.nextCursorNonempty && proof.page2.requestObserved &&
    proof.page2.startCursorMatchesPage1 && proof.target.seenOnPage2 &&
    proof.target.occurrences === 1 && proof.target.includedFromPage2;
}

async function harness(t, steps = []) {
  const calls = [];
  const violations = [];
  const forbidden = new Set();
  const failIo = () => {
    violations.push("unexpected I/O or unrelated route");
    throw new Error("FORBIDDEN_LOCAL_TEST_IO");
  };
  // No host fetch, process, require, socket, timer, or dynamic-import capability is exposed.
  // Unexpected calls are remembered so a production catch cannot hide a failed test.
  const context = createContext({
    URL, Request, Response, Headers, TextEncoder, TextDecoder, atob, btoa, crypto: webcrypto,
    console: { log: failIo, error: failIo, warn: failIo },
    fetch: async (input, init) => {
      const ordinal = calls.length;
      if (input !== `https://api.notion.com/v1/databases/${ENV.NOTION_ACCIDENT_DB_ID}/query` ||
          init?.method !== "POST" || typeof init.body !== "string" || ordinal >= steps.length) {
        return failIo();
      }
      const body = JSON.parse(init.body);
      calls.push(body);
      try {
        assert.equal(body.page_size, 50);
        assert.deepEqual(body.filter, { or: ["접수", "진행중", "반려"].map((status) => ({
          property: P.status, status: { equals: status }
        })) });
        assert.deepEqual(body.sorts, [{ property: "고객 접수(자동)", direction: "descending" }]);
        assert.equal(init.headers.Authorization, `Bearer ${ENV.NOTION_TOKEN}`);
        assert.equal(init.headers["Notion-Version"], NOTION_API_VERSION);
        const step = steps[ordinal];
        const data = typeof step === "function" ? await step(body, ordinal) : step;
        if (typeof data?.next_cursor === "string") {
          forbidden.add(data.next_cursor);
          forbidden.add(data.next_cursor.trim());
        }
        if (data instanceof Response) return data;
        return Response.json(data);
      } catch (error) {
        if (error?.code === "ERR_ASSERTION") violations.push("mock request assertion failed");
        throw error;
      }
    }
  });
  const realPaths = new Set([
    "src/index.ts", "src/constants.ts", "src/admin/search.ts", "src/admin/auth.ts",
    "src/admin/response-privacy.ts"
  ].map((name) => resolve(ROOT, name)));
  const modules = new Map();
  const sources = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    assert.ok(realPaths.has(path), "only explicitly approved local source modules may load");
    let source = stripTypeScriptTypes(readFileSync(path, "utf8"), { mode: "transform" });
    // Test-only exports expose identity/observation seams without editing production exports.
    if (path === resolve(ROOT, "src/admin/search.ts")) {
      source += "\nexport { queryRecentAccidents, createT58PaginationTrace, finishT58PaginationProof };";
    }
    sources.set(path, source);
    const module = new SourceTextModule(source, { context, identifier: path });
    modules.set(path, module);
    return module;
  }
  const entry = load(resolve(ROOT, "src/index.ts"));
  await entry.link((specifier, parent) => {
    assert.ok(specifier.startsWith("."), "external module imports are forbidden");
    const path = resolve(dirname(parent.identifier), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`);
    if (realPaths.has(path)) return load(path);
    // Keep the actual entry route and authentication code; all unrelated routes fail if invoked.
    assert.equal(parent.identifier, entry.identifier);
    const names = new Set();
    for (const match of sources.get(parent.identifier).matchAll(/(?:import|export)\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
      if (match[2] === specifier) {
        for (const name of match[1].split(",")) {
          if (name.trim()) names.add(name.trim().split(/\s+as\s+/)[0]);
        }
      }
    }
    assert.ok(names.size > 0);
    return new SyntheticModule([...names], function () {
      for (const name of names) this.setExport(name, failIo);
    }, { context, identifier: path });
  });
  await entry.evaluate();
  t.after(() => {
    assert.deepEqual(violations, [], "unexpected communication must fail even if caught by the handler");
    assert.equal(calls.length, steps.length, "all and only planned local mock requests must execute");
  });
  async function send({ query = TARGET, origin = STAGING, header = CHALLENGE,
    cookie = sessionCookie(Date.now() + 60_000,
      new URL(origin).protocol === "https:" ? ADMIN_SESSION_COOKIE_NAME : "sawstop-admin-session"),
    headers = {}, queryKey = "query", env = ENV } = {}) {
    const requestHeaders = new Headers({ Authorization: "LOCAL_ONLY_AUTHORIZATION", ...headers });
    if (cookie !== null) requestHeaders.set("Cookie", cookie);
    if (header !== null) requestHeaders.set(HEADER, header);
    const url = new URL(ADMIN_ACCIDENT_SEARCH_ROUTE, origin);
    url.searchParams.set(queryKey, query);
    const request = new Request(url, { headers: requestHeaders });
    const response = await entry.namespace.default.fetch(request, env, { waitUntil: failIo });
    const body = await response.json();
    if (header !== null || response.status === 401) {
      privacy(response, body, [...forbidden, cookie, ...Object.values(headers)]);
      if (body.ok) assert.equal(body.proof.challenge, header);
    }
    return { response, body };
  }
  return { send, calls, internal: modules.get(resolve(ROOT, "src/admin/search.ts")).namespace,
    inspect: (response, body) => privacy(response, body, [...forbidden]) };
}

test("A: actual authenticated route observes two pages and includes the page-2 candidate", async (t) => {
  const h = await harness(t, [
    page([candidate("UNRELATED_RECEIPT")], true, CURSOR),
    page([candidate()])
  ]);
  const { body } = await h.send();
  assert.deepEqual(h.calls.map((body) => body.start_cursor), [undefined, CURSOR]);
  assert.equal(Object.hasOwn(h.calls[0], "start_cursor"), false);
  assert.equal(accepted(body.proof), true);
  assert.deepEqual(body.proof.target, {
    receipt: TARGET, seenOnPage1: false, seenOnPage2: true, occurrences: 1, includedFromPage2: true
  });
  assert.equal(body.proof.finalResultCount, 1);
});

test("B: single page cannot claim page-2 proof even with an unused next_cursor", async (t) => {
  const h = await harness(t, [page([], false, CURSOR)]);
  const { body } = await h.send();
  assert.deepEqual(body.proof.page1, {
    requestObserved: true, startCursorPresent: false, hasMore: false, nextCursorNonempty: false
  });
  assert.deepEqual(body.proof.page2, { requestObserved: false, startCursorMatchesPage1: false });
  assert.equal(body.proof.target.occurrences, 0);
  assert.equal(body.proof.finalResultCount, 0);
  assert.equal(accepted(body.proof), false);
});

test("C: target on page 1 stays page-1 evidence after a real second page", async (t) => {
  const h = await harness(t, [page([candidate()], true, CURSOR), page([])]);
  const { body } = await h.send();
  assert.deepEqual(body.proof.target, {
    receipt: TARGET, seenOnPage1: true, seenOnPage2: false, occurrences: 1, includedFromPage2: false
  });
  assert.equal(body.proof.finalResultCount, 1);
  assert.equal(accepted(body.proof), false);
});

test("D: duplicates across pages retain both results and disclose non-unique evidence", async (t) => {
  const h = await harness(t, [page([candidate()], true, CURSOR), page([candidate(TARGET, "LOCAL_ONLY_PAGE_ID_2")])]);
  const { body } = await h.send();
  assert.deepEqual(body.proof.target, {
    receipt: TARGET, seenOnPage1: true, seenOnPage2: true, occurrences: 2, includedFromPage2: true
  });
  assert.equal(body.proof.finalResultCount, 2);
  assert.equal(accepted(body.proof), false);
});

test("E: internal selection seam observes a page-2 target excluded by the normal result cap", async (t) => {
  // With approved exact queries, a page-2 target must enter a still-unfilled exact array.
  // Exclusion is therefore unreachable through the valid proof route. Exercise the real
  // unchanged last-four selection internally; the public guard still rejects this branch.
  const h = await harness(t, [
    page(Array.from({ length: 19 }, (_, n) => candidate(`OTHER_${n}-6841`)), true, CURSOR),
    page([candidate("OTHER_20-6841"), candidate()])
  ]);
  const trace = h.internal.createT58PaginationTrace(CHALLENGE, TARGET);
  const results = await h.internal.queryRecentAccidents(ENV, "6841", trace);
  assert.equal(results.length, 20);
  assert.equal(results.some((item) => item.receiptNumber === TARGET), false);
  const response = h.internal.finishT58PaginationProof(trace, results);
  const body = await response.json();
  h.inspect(response, body);
  assert.equal(body.proof.target.seenOnPage2, true);
  assert.equal(body.proof.target.occurrences, 1);
  assert.equal(body.proof.target.includedFromPage2, false);
  assert.equal(accepted(body.proof), false);
});

test("E identity: a same-receipt copy cannot stand in for the actual mapped page-2 object", async (t) => {
  const h = await harness(t, [page([], true, CURSOR), page([candidate()])]);
  const trace = h.internal.createT58PaginationTrace(CHALLENGE, TARGET);
  const results = await h.internal.queryRecentAccidents(ENV, TARGET, trace);
  const [tracked] = trace.page2Targets;
  assert.strictEqual(results[0], tracked);
  assert.equal(Object.keys(tracked).some((key) => /proof|pageNumber|provenance/i.test(key)), false);
  const response = h.internal.finishT58PaginationProof(trace, [{ ...tracked }]);
  const body = await response.json();
  h.inspect(response, body);
  assert.equal(body.proof.target.seenOnPage2, true);
  assert.equal(body.proof.target.includedFromPage2, false);
});

for (const cursor of ["", " \t ", null, 42]) {
  test(`F: invalid cursor ${JSON.stringify(cursor)} preserves safe 500`, async (t) => {
    const h = await harness(t, [page([], true, cursor)]);
    const { response } = await h.send();
    assert.equal(response.status, 500);
  });
}

test("G: normalized repeated cursor fails without a third request", async (t) => {
  const h = await harness(t, [page([], true, CURSOR), page([], true, ` ${CURSOR} `)]);
  const { response } = await h.send();
  assert.equal(response.status, 500);
  assert.equal(h.calls[1].start_cursor, CURSOR);
});

test("H: trimmed logical cursor is the actual second serialized start_cursor", async (t) => {
  const h = await harness(t, [page([], true, ` \t${CURSOR}\n`), page([candidate()])]);
  const { body } = await h.send();
  assert.equal(h.calls[1].start_cursor, CURSOR);
  assert.equal(body.proof.page1.nextCursorNonempty, true);
  assert.equal(body.proof.page2.startCursorMatchesPage1, true);
  assert.equal(accepted(body.proof), true);
});

for (const [label, step] of [
  ["invalid JSON", () => new Response("LOCAL_ONLY_UPSTREAM_ERROR {", { status: 200 })],
  ["upstream 503", () => new Response(SENSITIVE.join(" "), { status: 503 })],
  ["fetch rejection", () => { throw new Error(SENSITIVE.join(" ")); }],
  ["malformed results", () => ({ results: {}, has_more: true, next_cursor: CURSOR })]
]) {
  test(`I: ${label} exposes only the existing generic failure`, async (t) => {
    const h = await harness(t, [step]);
    const { response } = await h.send();
    assert.equal(response.status, 500);
  });
}

test("I: second fetch failure cannot serialize a partial success proof", async (t) => {
  const h = await harness(t, [page([], true, CURSOR), () => new Response(SENSITIVE.join(" "), { status: 502 })]);
  assert.equal((await h.send()).response.status, 500);
});

test("J: interleaved searches with the same challenge keep UUID, target and cursors isolated", async (t) => {
  const aStarted = deferred();
  const releaseA = deferred();
  const cursorB = "LOCAL_ONLY_RAW_CURSOR_B";
  const h = await harness(t, [
    async () => { aStarted.resolve(); await releaseA.promise; return page([], true, CURSOR); },
    page([candidate(RECEIPTS[0])], true, cursorB),
    (body) => { assert.equal(body.start_cursor, cursorB); return page([]); },
    (body) => { assert.equal(body.start_cursor, CURSOR); return page([candidate()]); }
  ]);
  const pendingA = h.send();
  await aStarted.promise;
  let b;
  try {
    b = (await h.send({ query: RECEIPTS[0] })).body.proof;
  } finally {
    releaseA.resolve();
  }
  const a = (await pendingA).body.proof;
  assert.notEqual(a.workerRequestId, b.workerRequestId);
  assert.equal(a.challenge, b.challenge);
  assert.equal(accepted(a), true);
  assert.equal(accepted(b), false);
  assert.equal(b.target.receipt, RECEIPTS[0]);
  assert.equal(b.target.seenOnPage1, true);
  assert.equal(b.target.seenOnPage2, false);
  assert.equal(b.target.includedFromPage2, false);
  assert.equal(a.target.occurrences, 1);
  assert.equal(b.target.occurrences, 1);
});

test("observation seam: unresolved first/second fetch is never marked observed", async (t) => {
  const firstStarted = deferred();
  const secondStarted = deferred();
  const releaseFirst = deferred();
  const releaseSecond = deferred();
  const h = await harness(t, [
    async () => { firstStarted.resolve(); await releaseFirst.promise; return page([], true, CURSOR); },
    async () => { secondStarted.resolve(); await releaseSecond.promise; return page([candidate()]); }
  ]);
  const trace = h.internal.createT58PaginationTrace(CHALLENGE, TARGET);
  const pending = h.internal.queryRecentAccidents(ENV, TARGET, trace);
  await firstStarted.promise;
  try {
    assert.equal(trace.proof.page1.requestObserved, false);
    assert.equal(trace.proof.page2.requestObserved, false);
  } finally { releaseFirst.resolve(); }
  await secondStarted.promise;
  try {
    assert.equal(trace.proof.page1.requestObserved, true);
    assert.equal(trace.proof.page1.nextCursorNonempty, true);
    assert.equal(trace.proof.page2.requestObserved, false);
    assert.equal(trace.proof.page2.startCursorMatchesPage1, false);
  } finally { releaseSecond.resolve(); }
  const response = h.internal.finishT58PaginationProof(trace, await pending);
  const body = await response.json();
  h.inspect(response, body);
  assert.equal(accepted(body.proof), true);
});

test("strict evidence: truthy non-boolean has_more preserves traversal but cannot PASS", async (t) => {
  const h = await harness(t, [page([], "true", CURSOR), page([candidate()])]);
  const { body } = await h.send();
  assert.equal(body.proof.page1.hasMore, false);
  assert.equal(body.proof.page2.requestObserved, true);
  assert.equal(accepted(body.proof), false);
});

test("K: missing proof header preserves the ordinary full search contract and headers", async (t) => {
  const h = await harness(t, [page([candidate()])]);
  const { response, body } = await h.send({ header: null });
  assert.equal(response.status, 200);
  assert.deepEqual([...response.headers], [["content-type", "application/json; charset=utf-8"]]);
  assert.deepEqual(body, { ok: true, results: [{
    pageId: "LOCAL_ONLY_PAGE_ID", receiptNumber: TARGET, status: ACCIDENT_STATUS.received,
    phone: PHONE, occurredAt: "2001-02-03", operatorName: "LOCAL_ONLY_OPERATOR",
    sawSerialNumber: "LOCAL_ONLY_SERIAL"
  }] });
});

for (const [label, header] of [
  ["empty", ""], ["missing prefix", CHALLENGE.slice(3)], ["wrong schema", CHALLENGE.replace("v1.", "v2.")],
  ["non-hex", CHALLENGE.replace("12345678", "z2345678")],
  ["invalid UUID version", CHALLENGE.replace("-4234-", "-0234-")],
  ["invalid UUID variant", CHALLENGE.replace("-8234-", "-7234-")],
  ["nil UUID", "v1.00000000-0000-0000-0000-000000000000"],
  ["too long", `${CHALLENGE}a`], ["duplicate header values", `${CHALLENGE}, ${CHALLENGE}`],
  ["embedded whitespace", CHALLENGE.replace("-4234-", "- 234-")]
]) {
  test(`L: ${label} proof challenge rejects before fetching`, async (t) => {
    const h = await harness(t);
    assert.equal((await h.send({ header })).response.status, 400);
  });
}

for (const [label, origin] of [
  ["Production", "https://sawstop-finger-save.chbjbj.workers.dev"],
  ["arbitrary", "https://example.invalid"],
  ["substring suffix", `${STAGING}.example.invalid`],
  ["HTTP", STAGING.replace("https:", "http:")],
  ["different port", `${STAGING}:8443`],
  ["trailing hostname dot", `${STAGING}.`]
]) {
  test(`M: ${label} origin rejects despite spoofed Origin/Host/forwarding headers`, async (t) => {
    const h = await harness(t);
    const { response } = await h.send({ origin, headers: {
      Origin: STAGING, Host: new URL(STAGING).host, "X-Forwarded-Host": new URL(STAGING).host,
      "X-Forwarded-Proto": "https", Forwarded: `host=${new URL(STAGING).host};proto=https`
    } });
    assert.equal(response.status, 400);
  });
}

test("M: URL credentials spoof is rejected by the actual Request constructor", async (t) => {
  const h = await harness(t);
  await assert.rejects(h.send({ origin: `${STAGING}@example.invalid` }), TypeError);
});

for (const query of ["202609101357-0570", "202609101359-6841", "20260910-6841"]) {
  test(`N: unapproved exact receipt ${query} rejects locally`, async (t) => {
    const h = await harness(t);
    assert.equal((await h.send({ query })).response.status, 400);
  });
}

for (const query of ["", "6841", "202609101358", PHONE, "arbitrary", `${TARGET}extra`]) {
  test(`O: non-exact branch ${JSON.stringify(query)} rejects locally`, async (t) => {
    const h = await harness(t);
    assert.equal((await h.send({ query })).response.status, 400);
  });
}

for (const [label, cookie] of [
  ["missing", null], ["forged", `${ADMIN_SESSION_COOKIE_NAME}=LOCAL_ONLY_COOKIE`],
  ["expired", sessionCookie(Date.now() - 60_000)]
]) {
  test(`authentication: ${label} session stops at the real existing route guard`, async (t) => {
    const h = await harness(t);
    assert.equal((await h.send({ cookie })).response.status, 401);
  });
}

for (const query of RECEIPTS) {
  test(`allowlist: approved synthetic receipt ${query} activates proof`, async (t) => {
    const h = await harness(t, [page([])]);
    const { body } = await h.send({ query: ` ${query} `, queryKey: "q" });
    assert.equal(body.proof.target.receipt, query);
  });
}

test("occurrences: only valid mapped candidates count, including cap-excluded duplicates", async (t) => {
  const invalid = candidate();
  delete invalid.id;
  const h = await harness(t, [
    page([invalid, { id: "LOCAL_ONLY_PAGE_ID_NO_PROPERTIES" }], true, CURSOR),
    page(Array.from({ length: 23 }, (_, n) => candidate(TARGET, `LOCAL_ONLY_PAGE_ID_${n}`)), true, "")
  ]);
  const { body } = await h.send();
  assert.equal(body.proof.target.occurrences, 23);
  assert.equal(body.proof.finalResultCount, 20);
  assert.equal(body.proof.target.includedFromPage2, true);
  assert.equal(accepted(body.proof), false);
});

test("page provenance: page 3 target does not masquerade as page 2", async (t) => {
  const h = await harness(t, [page([], true, CURSOR), page([], true, "LOCAL_ONLY_CURSOR_C"), page([candidate()])]);
  const { body } = await h.send();
  assert.equal(body.proof.target.occurrences, 1);
  assert.equal(body.proof.target.seenOnPage2, false);
  assert.equal(body.proof.target.includedFromPage2, false);
  assert.equal(body.proof.finalResultCount, 1);
});

test("P: exact 20-result early stop does not validate unused cursor or force page 2", async (t) => {
  const data = page(Array.from({ length: 25 }, (_, n) => candidate(TARGET, `LOCAL_ONLY_PAGE_ID_${n}`)), true, "");
  const h = await harness(t, [data, data]);
  const proof = (await h.send()).body.proof;
  const ordinary = (await h.send({ header: null })).body;
  assert.equal(proof.target.occurrences, 25);
  assert.equal(proof.finalResultCount, 20);
  assert.equal(proof.page1.hasMore, true);
  assert.equal(proof.page1.nextCursorNonempty, false);
  assert.equal(proof.page2.requestObserved, false);
  assert.equal(accepted(proof), false);
  assert.equal(ordinary.results.length, 20);
  assert.deepEqual(ordinary.results.map((item) => item.pageId),
    Array.from({ length: 20 }, (_, n) => `LOCAL_ONLY_PAGE_ID_${n}`));
});

test("P: ordinary exact receipt never falls back to matching Phone or partial receipt", async (t) => {
  const h = await harness(t, [page([candidate(`prefix-${TARGET}`), candidate("OTHER", "other", "접수", TARGET)])]);
  assert.deepEqual((await h.send({ header: null })).body, { ok: true, results: [] });
});

test("P: ordinary last-four combines receipt/Phone suffixes and stops at 20 in order", async (t) => {
  const data = [candidate("OTHER-6841", "receipt-suffix", "접수", "010-0000-9999"),
    candidate("OTHER-9999", "phone-suffix"), candidate("OTHER-9998", "no-suffix", "접수", "010-6841-9999"),
    ...Array.from({ length: 23 }, (_, n) => candidate(`OTHER_${n}-6841`, `suffix-${n}`))];
  const h = await harness(t, [page(data, true, "")]);
  const { body } = await h.send({ header: null, query: "68-41" });
  assert.equal(body.results.length, 20);
  assert.deepEqual(body.results.slice(0, 2).map((item) => item.pageId), ["receipt-suffix", "phone-suffix"]);
  assert.equal(body.results.some((item) => item.pageId === "no-suffix"), false);
});

test("P: general receipt on page 2 takes priority over 20 earlier Phone matches", async (t) => {
  const h = await harness(t, [
    page(Array.from({ length: 24 }, (_, n) => candidate("OTHER", `phone-${n}`, "접수", "010-12345-999")), true, CURSOR),
    page([candidate("receipt-12345", "receipt-winner", "반려")])
  ]);
  const { body } = await h.send({ header: null, query: "12345" });
  assert.deepEqual(body.results.map((item) => item.pageId), ["receipt-winner"]);
});

test("P: general Phone fallback traverses to exhaustion and keeps the first 20", async (t) => {
  const h = await harness(t, [
    page(Array.from({ length: 24 }, (_, n) => candidate("OTHER", `phone-${n}`, "접수", "010-12345-999")), true, CURSOR),
    page([candidate("OTHER_LATER", "later", "진행중", "010-12345-999")])
  ]);
  const { body } = await h.send({ header: null, query: "12345" });
  assert.deepEqual(body.results.map((item) => item.pageId), Array.from({ length: 20 }, (_, n) => `phone-${n}`));
});

test("P: general receipt cap stops immediately and keeps input order", async (t) => {
  const h = await harness(t, [page(Array.from({ length: 25 }, (_, n) => candidate(`MATCH_${n}`, `match-${n}`)), true, "")]);
  const { body } = await h.send({ header: null, query: "MATCH" });
  assert.deepEqual(body.results.map((item) => item.pageId), Array.from({ length: 20 }, (_, n) => `match-${n}`));
});

test("P: ordinary blank query and invalid pagination retain existing failures", async (t) => {
  const h = await harness(t, [page([], true, "")]);
  const blank = await h.send({ header: null, query: " " });
  assert.equal(blank.response.status, 400);
  assert.deepEqual(blank.body, { ok: false, message: CUSTOMER_FAILURE_MESSAGE });
  const invalid = await h.send({ header: null });
  assert.equal(invalid.response.status, 500);
  assert.deepEqual(invalid.body, blank.body);
});

test("Q: missing upstream configuration fails privately without fetching", async (t) => {
  const h = await harness(t);
  assert.equal((await h.send({ env: { ...ENV, NOTION_TOKEN: "" } })).response.status, 500);
});

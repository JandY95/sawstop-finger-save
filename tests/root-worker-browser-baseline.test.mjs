import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, defaultResolve) {
    try {
      return defaultResolve(specifier, context);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ERR_MODULE_NOT_FOUND" &&
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !specifier.endsWith(".ts")
      ) {
        return defaultResolve(`${specifier}.ts`, context);
      }

      throw error;
    }
  }
});

const BROWSER_ORIGIN = "https://t51-browser-baseline.invalid";
const CUSTOMER_SECTION_HEADINGS = [
  "1. 연락받으실 정보",
  "2. 사고가 발생한 때와 사람",
  "3. 손가락과 상처 정보",
  "4. 기계 및 카트리지 정보",
  "5. 작업 당시 정보",
  "6. 사고 설명",
  "7. 사진 첨부 및 동의"
];

async function configurePlaywrightPlatform() {
  if (
    process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ||
    process.platform !== "linux"
  ) {
    return;
  }

  const osRelease = fs.readFileSync("/etc/os-release", "utf8");
  if (
    /^ID=ubuntu$/m.test(osRelease) &&
    /^VERSION_ID="?26\.04"?$/m.test(osRelease)
  ) {
    process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = "ubuntu24.04-x64";
  }
}

function buildBrowserEnv() {
  return {
    ADMIN_PASSWORD: "local-admin-password",
    ADMIN_SESSION_SECRET: "local-admin-session-secret",
    ADMIN_AUTH_LOCK: {
      idFromName(name) {
        return { toString: () => name };
      },
      get() {
        return {
          async fetch() {
            return Response.json({ ok: true, status: "success" });
          }
        };
      }
    }
  };
}

async function installRootWorkerRoute(page, worker) {
  const handlerRequests = [];
  const locallyBlockedThirdPartyRequests = [];
  const unexpectedRequests = [];
  const env = buildBrowserEnv();
  const ctx = {
    waitUntil() {},
    passThroughOnException() {}
  };

  await page.route("**/*", async (route) => {
    const browserRequest = route.request();
    const url = new URL(browserRequest.url());

    if (url.origin === BROWSER_ORIGIN) {
      handlerRequests.push({ method: browserRequest.method(), path: url.pathname });
      const response = await worker.fetch(
        new Request(browserRequest.url(), {
          method: browserRequest.method(),
          headers: await browserRequest.allHeaders()
        }),
        env,
        ctx
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text()
      });
      return;
    }

    if (
      url.href ===
      "https://challenges.cloudflare.com/turnstile/v0/api.js"
    ) {
      locallyBlockedThirdPartyRequests.push(url.href);
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: ""
      });
      return;
    }

    unexpectedRequests.push(url.href);
    await route.abort("blockedbyclient");
  });

  return {
    handlerRequests,
    locallyBlockedThirdPartyRequests,
    unexpectedRequests
  };
}

async function pageWidthSnapshot(page, selectors) {
  return page.evaluate((targetSelectors) => {
    const boxes = targetSelectors.map((selector) => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      return {
        selector,
        found: Boolean(rect),
        left: rect?.left ?? -1,
        right: rect?.right ?? -1,
        width: rect?.width ?? -1
      };
    });

    return {
      innerWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      boxes
    };
  }, selectors);
}

function assertFitsViewport(snapshot) {
  assert.ok(
    snapshot.documentScrollWidth <= snapshot.innerWidth,
    `document width ${snapshot.documentScrollWidth} exceeded viewport ${snapshot.innerWidth}`
  );
  assert.ok(
    snapshot.bodyScrollWidth <= snapshot.innerWidth,
    `body width ${snapshot.bodyScrollWidth} exceeded viewport ${snapshot.innerWidth}`
  );
  for (const box of snapshot.boxes) {
    assert.equal(box.found, true, `${box.selector} must exist`);
    assert.ok(box.left >= -0.5, `${box.selector} crossed the left viewport edge`);
    assert.ok(
      box.right <= snapshot.innerWidth + 0.5,
      `${box.selector} crossed the right viewport edge`
    );
    assert.ok(box.width > 0, `${box.selector} must have visible width`);
  }
}

test(
  "고객 접수 화면은 실제 root handler 응답으로 열리고 휴대폰과 PC 폭에 맞는다",
  async () => {
    await configurePlaywrightPlatform();
    const { chromium } = await import("@playwright/test");
    const worker = (await import("../src/index.ts")).default;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const routeEvidence = await installRootWorkerRoute(page, worker);

    try {
      const navigation = await page.goto(`${BROWSER_ORIGIN}/`, {
        waitUntil: "domcontentloaded"
      });
      assert.equal(navigation?.status(), 200);
      assert.deepEqual(
        await page.locator("form > section.section > h2").allTextContents(),
        CUSTOMER_SECTION_HEADINGS
      );
      assert.equal(await page.locator("form").getAttribute("action"), "/submit");
      assert.equal(await page.locator("form").getAttribute("method"), "post");
      assert.equal(
        (await page.locator("#customer-submit-button").innerText()).trim(),
        "접수하기"
      );
      assert.equal(await page.locator("#customer-success-view").isHidden(), true);
      assert.equal(
        (await page.locator("#customer-success-view h2").textContent())?.trim(),
        "접수가 완료되었습니다."
      );
      assert.equal(
        (await page.locator("#customer-success-view p").textContent())?.trim(),
        "입력하신 내용은 내부 검토 후 확인됩니다."
      );
      assert.equal(
        await page.locator('[name="attachmentType"]').count(),
        0,
        "customer form must not expose an attachment-type control"
      );
      const visibleText = await page.locator("body").innerText();
      const successText =
        (await page.locator("#customer-success-view").textContent()) ?? "";
      for (const internalText of [
        "page_id",
        "첨부 업로드 상태",
        "손가락 사진 있음",
        "발송 준비 완료(자동)"
      ]) {
        assert.equal(visibleText.includes(internalText), false, internalText);
        assert.equal(successText.includes(internalText), false, internalText);
      }

      const mobileSnapshot = await pageWidthSnapshot(page, [
        "main.page",
        "form",
        "form > section.section",
        "#customer-attachment-upload-zone",
        "#customer-attachment-preview",
        "#customer-submit-button"
      ]);
      assertFitsViewport(mobileSnapshot);
      const mobilePreviewColumns = await page
        .locator("#customer-attachment-preview")
        .evaluate((element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
            .length
        );
      assert.equal(mobilePreviewColumns, 1);
      const mobileContactBoxes = await page
        .locator(".contact-row > .field")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, bottom: rect.bottom };
          })
        );
      assert.equal(mobileContactBoxes.length, 2);
      assert.ok(
        mobileContactBoxes[1].y >= mobileContactBoxes[0].bottom,
        "mobile contact fields must stack vertically"
      );

      await page.setViewportSize({ width: 1280, height: 900 });
      const desktopSnapshot = await pageWidthSnapshot(page, [
        "main.page",
        "form",
        "form > section.section",
        "#customer-attachment-upload-zone",
        "#customer-attachment-preview",
        "#customer-submit-button"
      ]);
      assertFitsViewport(desktopSnapshot);
      const desktopPreviewColumns = await page
        .locator("#customer-attachment-preview")
        .evaluate((element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
            .length
        );
      assert.equal(desktopPreviewColumns, 4);
      const desktopContactBoxes = await page
        .locator(".contact-row > .field")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y };
          })
        );
      assert.equal(desktopContactBoxes.length, 2);
      assert.ok(
        Math.abs(desktopContactBoxes[0].y - desktopContactBoxes[1].y) < 1,
        "desktop contact fields must share one row"
      );
      assert.ok(
        desktopContactBoxes[1].x > desktopContactBoxes[0].x,
        "desktop email field must be to the right of phone"
      );

      assert.deepEqual(routeEvidence.handlerRequests, [
        { method: "GET", path: "/" }
      ]);
      assert.deepEqual(routeEvidence.locallyBlockedThirdPartyRequests, [
        "https://challenges.cloudflare.com/turnstile/v0/api.js"
      ]);
      assert.deepEqual(routeEvidence.unexpectedRequests, []);
      assert.deepEqual(pageErrors, []);
    } finally {
      await browser.close();
    }
  }
);

test(
  "관리자 로그인 화면은 실제 root handler 응답으로 열리고 휴대폰과 PC 폭에 맞는다",
  async () => {
    await configurePlaywrightPlatform();
    const { chromium } = await import("@playwright/test");
    const worker = (await import("../src/index.ts")).default;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const routeEvidence = await installRootWorkerRoute(page, worker);

    try {
      const navigation = await page.goto(`${BROWSER_ORIGIN}/admin`, {
        waitUntil: "domcontentloaded"
      });
      assert.equal(navigation?.status(), 200);
      assert.equal(
        (await page.locator("h1").innerText()).trim(),
        "Admin Login"
      );
      assert.equal(
        await page.locator('form[action="/admin/login"]').count(),
        1
      );
      assert.equal(await page.locator("#password").getAttribute("type"), "password");
      assert.equal((await page.locator('button[type="submit"]').innerText()).trim(), "로그인");
      assert.equal(await page.locator("#search-form").count(), 0);

      const mobileSnapshot = await pageWidthSnapshot(page, [
        ".panel.narrow",
        'form[action="/admin/login"]',
        "#password",
        'button[type="submit"]'
      ]);
      assertFitsViewport(mobileSnapshot);

      await page.setViewportSize({ width: 1280, height: 900 });
      const desktopSnapshot = await pageWidthSnapshot(page, [
        ".panel.narrow",
        'form[action="/admin/login"]',
        "#password",
        'button[type="submit"]'
      ]);
      assertFitsViewport(desktopSnapshot);

      assert.deepEqual(routeEvidence.handlerRequests, [
        { method: "GET", path: "/admin" }
      ]);
      assert.deepEqual(routeEvidence.locallyBlockedThirdPartyRequests, []);
      assert.deepEqual(routeEvidence.unexpectedRequests, []);
      assert.deepEqual(pageErrors, []);
    } finally {
      await browser.close();
    }
  }
);

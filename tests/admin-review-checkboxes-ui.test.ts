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

const { renderAdminPage } = await import("../src/admin/render.ts");
const ADMIN_ORIGIN = "https://admin-review-checkboxes.sawstop.invalid";
const PAGE_ID = "44444444-4444-4444-4444-444444444444";
const RECEIPT_NUMBER = "202608021600-4444";

async function configurePlaywrightPlatform() {
  if (process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE || process.platform !== "linux") {
    return;
  }

  const osRelease = fs.readFileSync("/etc/os-release", "utf8");
  if (/^ID=ubuntu$/m.test(osRelease) && /^VERSION_ID="?26\.04"?$/m.test(osRelease)) {
    process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = "ubuntu24.04-x64";
  }
}

test("T44 admin UI shows each review value and supports individual confirm/clear actions", async () => {
  const response = renderAdminPage(
    new Request("https://worker.test/admin"),
    { authenticated: true }
  );
  const html = await response.text();

  assert.match(html, /id="review-checkbox-card"/);
  assert.match(html, /id="review-checkbox-message"/);
  assert.match(html, /id="review-checkbox-list"/);
  assert.match(html, /영문 검수 완료/);
  assert.match(html, /첨부 최종 확인 완료/);
  assert.match(html, /출력 확인 완료/);
  assert.match(html, /영문 본문의 번역과 수정을 모두 확인/);
  assert.match(html, /손가락 사진을 포함한 현재 첨부를 최종 확인/);
  assert.match(html, /웹뷰와 PDF 출력 내용을 최종 확인/);

  for (const reviewKey of [
    "englishReviewComplete",
    "attachmentFinalCheck",
    "outputCheckComplete"
  ]) {
    assert.match(
      html,
      new RegExp(
        `type="checkbox"[^>]+data-review-key="${reviewKey}"|data-review-key="${reviewKey}"[^>]+type="checkbox"`
      ),
      `${reviewKey} checkbox`
    );
  }

  assert.match(html, /현재: 확인 완료/);
  assert.match(html, /현재: 미완료/);
  assert.match(html, /loadReviewCheckboxes/);
  assert.match(html, /updateReviewCheckbox/);
  assert.match(html, /\/admin\/accidents\/review-checkboxes/);
  assert.match(html, /window\.confirm/);
  assert.match(html, /실제 검토를 마친 경우에만/);
  assert.match(html, /확인 완료로 변경/);
  assert.match(html, /확인 해제 성공|확인 완료 성공/);
});

test("T44 browser UI reads and independently confirms or clears each review value", async () => {
  await configurePlaywrightPlatform();
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const pageErrors: Error[] = [];
  const dialogs: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const values = {
    englishReviewComplete: false,
    attachmentFinalCheck: true,
    outputCheckComplete: false
  };

  page.on("pageerror", (error) => pageErrors.push(error));
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/admin") {
      const response = renderAdminPage(new Request(url), { authenticated: true });
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text()
      });
      return;
    }

    if (url.pathname === "/admin/accidents/search") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          results: [
            {
              pageId: PAGE_ID,
              receiptNumber: RECEIPT_NUMBER,
              status: "진행중",
              phone: "010-4444-4444",
              occurredAt: "2026-08-02T16:00:00+09:00",
              operatorName: "T44 Operator",
              sawSerialNumber: "C444444444"
            }
          ]
        })
      });
      return;
    }

    if (url.pathname === "/admin/attachments/list") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, attachments: [] })
      });
      return;
    }

    if (url.pathname === "/admin/accidents/review-checkboxes") {
      if (request.method() === "POST") {
        const update = request.postDataJSON() as Record<string, unknown>;
        updates.push(update);
        values[update.reviewKey as keyof typeof values] = Boolean(update.checked);
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, values })
      });
      return;
    }

    await route.fulfill({ status: 204, body: "" });
  });

  try {
    await page.goto(`${ADMIN_ORIGIN}/admin?receiptNumber=${RECEIPT_NUMBER}`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      (pageId) => document.querySelector<HTMLInputElement>("#selected-page-id")?.value === pageId,
      PAGE_ID
    );
    await page.waitForFunction(
      () => !document.querySelector<HTMLInputElement>("#review-english-complete")?.disabled
    );

    assert.equal(await page.locator("#review-english-complete").isChecked(), false);
    assert.equal(await page.locator("#review-attachment-final").isChecked(), true);
    assert.equal(await page.locator("#review-output-complete").isChecked(), false);
    assert.equal(
      await page.locator("#review-english-complete-state").innerText(),
      "현재: 미완료"
    );

    await page.locator("#review-english-complete").check();
    await page.waitForFunction(() =>
      document.querySelector("#review-checkbox-message")?.textContent?.includes("영문 검수 완료 확인 완료 성공")
    );
    await page.locator("#review-attachment-final").uncheck();
    await page.waitForFunction(() =>
      document.querySelector("#review-checkbox-message")?.textContent?.includes("첨부 최종 확인 완료 확인 해제 성공")
    );
    await page.locator("#review-output-complete").check();
    await page.waitForFunction(() =>
      document.querySelector("#review-checkbox-message")?.textContent?.includes("출력 확인 완료 확인 완료 성공")
    );

    assert.deepEqual(updates, [
      {
        pageId: PAGE_ID,
        reviewKey: "englishReviewComplete",
        checked: true
      },
      {
        pageId: PAGE_ID,
        reviewKey: "attachmentFinalCheck",
        checked: false
      },
      {
        pageId: PAGE_ID,
        reviewKey: "outputCheckComplete",
        checked: true
      }
    ]);
    assert.equal(dialogs.length, 2, "confirm actions should warn; clear should not");
    assert.match(dialogs[0] ?? "", /실제 검토를 마친 경우에만/);
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
});

console.log("T44 admin review checkbox UI contract passed.");

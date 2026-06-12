#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const targetUrl = "http://127.0.0.1:8787/";
const localBrowserQaRunbookPath = path.join(root, "docs/runbooks/LOCAL_BROWSER_QA.md");
const playwrightHostDependencySetup = [
  "cd /srv/harness-lab/repos/sawstop-finger-save",
  "npm install",
  "PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium",
  "PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 sudo -E npx playwright install-deps chromium"
].join("\n");
const fallbackAptDependencySetup = [
  "cd /srv/harness-lab/repos/sawstop-finger-save",
  "sudo apt-get update",
  "sudo apt-get install -y \\",
  "  at-spi2-common \\",
  "  fontconfig \\",
  "  fonts-freefont-ttf \\",
  "  fonts-ipafont-gothic \\",
  "  fonts-liberation \\",
  "  fonts-tlwg-loma-otf \\",
  "  fonts-unifont \\",
  "  fonts-wqy-zenhei \\",
  "  libasound2-data \\",
  "  libasound2t64 \\",
  "  libatk-bridge2.0-0t64 \\",
  "  libatk1.0-0t64 \\",
  "  libatspi2.0-0t64 \\",
  "  libavahi-client3 \\",
  "  libavahi-common-data \\",
  "  libavahi-common3 \\",
  "  libcairo2 \\",
  "  libcups2t64 \\",
  "  libdatrie1 \\",
  "  libfontenc1 \\",
  "  libgraphite2-3 \\",
  "  libharfbuzz0b \\",
  "  libpango-1.0-0 \\",
  "  libpixman-1-0 \\",
  "  libthai-data \\",
  "  libthai0 \\",
  "  libxcb-render0 \\",
  "  libxdamage1 \\",
  "  libxfont2 \\",
  "  libxres1 \\",
  "  x11-xkb-utils \\",
  "  xfonts-cyrillic \\",
  "  xfonts-encodings \\",
  "  xfonts-scalable \\",
  "  xfonts-utils \\",
  "  xserver-common \\",
  "  xvfb"
].join("\n");
const artifactDir = path.join(
  root,
  "diagnostics",
  "playwright",
  "customer-click-layout-stability",
  new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")
);

const scrollTolerancePx = 1;
const geometryTolerancePx = 1;
const layoutShiftTolerance = 0.0001;
const readinessTimeoutMs = 60000;
const childOutputLimit = 12000;
const serverGracefulShutdownTimeoutMs = 5000;
const serverForcedShutdownTimeoutMs = 2000;
const isWindows = process.platform === "win32";
const postClickSampleDelays = [
  { phase: "after-click", delayMs: 0 },
  { phase: "after-50ms", delayMs: 50 },
  { phase: "after-150ms", delayMs: 100 },
  { phase: "after-300ms", delayMs: 150 }
];
const visualJitterStyleProperties = [
  "boxShadow",
  "outlineWidth",
  "outlineOffset",
  "transform",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontSize",
  "lineHeight"
];
const riskyTransitionProperties = [
  "all",
  "background",
  "background-color",
  "border-color",
  "box-shadow",
  "color",
  "opacity",
  "transform",
  "filter",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border",
  "border-width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "font-size",
  "line-height"
];

let failures = 0;
let spawnedServer = null;
let usedExistingServer = false;
const childOutput = [];
const evidence = {
  targetUrl,
  artifactDir,
  usedExistingServer: false,
  playwrightHostPlatformOverride: process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE || "",
  interactions: [],
  consoleErrors: [],
  ignoredConsoleMessages: [],
  pageErrors: [],
  forbiddenRequests: [],
  mainFrameNavigations: []
};

function pass(rule) {
  console.log(`PASS ${rule}`);
}

function fail(rule, detail) {
  failures += 1;
  console.error(`FAIL ${rule}: ${detail}`);
}

function redactOutput(value) {
  return value
    .replaceAll(/(token|secret|password|key)(["'\s:=]+)[^\s"',]+/gi, "$1$2[redacted]")
    .replaceAll(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
}

function appendChildOutput(chunk) {
  childOutput.push(redactOutput(chunk.toString()));
  while (childOutput.join("").length > childOutputLimit) {
    childOutput.shift();
  }
}

function isPlaywrightHostDependencyError(error) {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);

  return (
    /Host system is missing dependencies/i.test(message) ||
    /missing.*shared librar/i.test(message) ||
    /missing.*dependencies/i.test(message) ||
    /error while loading shared libraries/i.test(message) ||
    /cannot open shared object file/i.test(message) ||
    /playwright install-deps/i.test(message)
  );
}

function formatPlaywrightHostDependencyHold(error) {
  const message = error instanceof Error ? error.message : String(error);

  return [
    "Automated browser QA runtime HOLD: Playwright Chromium could not launch because the server host is missing browser shared libraries/dependencies.",
    `Runbook: ${localBrowserQaRunbookPath}`,
    "Run these commands in an interactive server terminal because sudo requires local authentication; Hermes cannot receive a sudo password in chat:",
    playwrightHostDependencySetup,
    "If install-deps cannot complete, use the explicit apt package fallback from the same runbook:",
    fallbackAptDependencySetup,
    "Original Chromium launch error:",
    message
  ].join("\n");
}

async function probeServer() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(targetUrl, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer(childProcess) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < readinessTimeoutMs) {
    if (await probeServer()) {
      return;
    }

    if (childProcess.exitCode !== null) {
      throw new Error(
        `Local dev server exited before readiness with code ${childProcess.exitCode}.\n` +
          childOutput.join("")
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(
    `Timed out waiting for ${targetUrl} after ${readinessTimeoutMs}ms.\n` +
      childOutput.join("")
  );
}

async function ensureServer() {
  if (await probeServer()) {
    usedExistingServer = true;
    evidence.usedExistingServer = true;
    pass("local-dev-server-existing");
    return;
  }

  const npmCommand = isWindows ? "npm.cmd" : "npm";
  spawnedServer = spawn(
    npmCommand,
    ["run", "dev:fully-local", "--", "--host", "127.0.0.1", "--port", "8787"],
    {
      cwd: root,
      env: {
        ...process.env,
        NO_COLOR: "1",
        WRANGLER_LOG_PATH: path.join(artifactDir, "wrangler-logs")
      },
      detached: !isWindows,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );

  spawnedServer.stdout.on("data", appendChildOutput);
  spawnedServer.stderr.on("data", appendChildOutput);

  await waitForServer(spawnedServer);
  pass("local-dev-server-spawned");
}

function isNoSuchProcessError(error) {
  return error && typeof error === "object" && "code" in error && error.code === "ESRCH";
}

function isSpawnedServerAlive() {
  if (!spawnedServer?.pid) {
    return false;
  }

  if (isWindows) {
    return spawnedServer.exitCode === null;
  }

  try {
    process.kill(-spawnedServer.pid, 0);
    return true;
  } catch (error) {
    if (isNoSuchProcessError(error)) {
      return false;
    }
    throw error;
  }
}

async function taskkillWindowsProcessTree(force) {
  if (!spawnedServer?.pid) {
    return false;
  }

  const args = ["/PID", String(spawnedServer.pid), "/T"];
  if (force) {
    args.push("/F");
  }

  return await new Promise((resolve) => {
    const stopper = spawn("taskkill", args, {
      stdio: "ignore",
      windowsHide: true
    });

    stopper.once("error", () => {
      resolve(false);
    });
    stopper.once("exit", (code) => {
      resolve(code === 0);
    });
  });
}

async function signalSpawnedServer(signal) {
  if (!spawnedServer?.pid) {
    return false;
  }

  if (isWindows && (await taskkillWindowsProcessTree(signal === "SIGKILL"))) {
    return true;
  }

  try {
    if (isWindows) {
      return spawnedServer.kill(signal);
    }

    process.kill(-spawnedServer.pid, signal);
    return true;
  } catch (error) {
    if (isNoSuchProcessError(error)) {
      return false;
    }
    throw error;
  }
}

async function waitForSpawnedServerStop(timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!isSpawnedServerAlive()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return !isSpawnedServerAlive();
}

async function stopServer() {
  if (!spawnedServer || usedExistingServer) {
    return;
  }

  await signalSpawnedServer("SIGTERM");
  if (await waitForSpawnedServerStop(serverGracefulShutdownTimeoutMs)) {
    return;
  }

  await signalSpawnedServer("SIGKILL");
  await waitForSpawnedServerStop(serverForcedShutdownTimeoutMs);
}

async function writeEvidence() {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(
    path.join(artifactDir, "layout-stability-evidence.json"),
    JSON.stringify(evidence, null, 2),
    "utf8"
  );
}

async function ensurePlaywrightHostPlatformOverride() {
  if (process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE) {
    evidence.playwrightHostPlatformOverride = process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE;
    return;
  }

  if (process.platform !== "linux" || process.arch !== "x64") {
    return;
  }

  try {
    const osRelease = await fs.readFile("/etc/os-release", "utf8");
    if (/^ID=ubuntu$/m.test(osRelease) && /^VERSION_ID="?26\.04"?$/m.test(osRelease)) {
      process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = "ubuntu24.04-x64";
      evidence.playwrightHostPlatformOverride = process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE;
    }
  } catch {
    // If OS detection is unavailable, let Playwright use its normal host mapping.
  }
}

function rectDelta(before, after) {
  return {
    x: Math.abs(after.x - before.x),
    y: Math.abs(after.y - before.y),
    width: Math.abs(after.width - before.width),
    height: Math.abs(after.height - before.height),
    top: Math.abs(after.top - before.top),
    left: Math.abs(after.left - before.left),
    right: Math.abs(after.right - before.right),
    bottom: Math.abs(after.bottom - before.bottom)
  };
}

function maxDelta(delta) {
  return Math.max(...Object.values(delta));
}

function parseCssTimeList(value) {
  return String(value || "0s")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const numeric = Number.parseFloat(entry);
      if (!Number.isFinite(numeric)) {
        return 0;
      }
      return entry.endsWith("ms") ? numeric : numeric * 1000;
    });
}

function hasRiskyActiveTransition(styles) {
  const properties = String(styles.transitionProperty || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const durations = parseCssTimeList(styles.transitionDuration);
  const delays = parseCssTimeList(styles.transitionDelay);

  return properties.some((property, index) => {
    const duration = durations[index] ?? durations[durations.length - 1] ?? 0;
    const delay = delays[index] ?? delays[delays.length - 1] ?? 0;

    return duration + delay > 0 && riskyTransitionProperties.includes(property);
  });
}

async function installLayoutShiftObserver(page) {
  await page.addInitScript(() => {
    window.__customerLayoutShiftEntries = [];
    window.__customerLayoutShiftSupported = false;

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          window.__customerLayoutShiftEntries.push({
            value: entry.value,
            hadRecentInput: entry.hadRecentInput,
            startTime: entry.startTime,
            sources: Array.from(entry.sources || []).map((source) => ({
              currentRect: source.currentRect
                ? {
                    x: source.currentRect.x,
                    y: source.currentRect.y,
                    width: source.currentRect.width,
                    height: source.currentRect.height,
                    top: source.currentRect.top,
                    left: source.currentRect.left,
                    right: source.currentRect.right,
                    bottom: source.currentRect.bottom
                  }
                : null,
              previousRect: source.previousRect
                ? {
                    x: source.previousRect.x,
                    y: source.previousRect.y,
                    width: source.previousRect.width,
                    height: source.previousRect.height,
                    top: source.previousRect.top,
                    left: source.previousRect.left,
                    right: source.previousRect.right,
                    bottom: source.previousRect.bottom
                  }
                : null
            }))
          });
        });
      });

      observer.observe({ type: "layout-shift", buffered: true });
      window.__customerLayoutShiftSupported = true;
    } catch {
      window.__customerLayoutShiftSupported = false;
    }
  });
}

async function clearLayoutShiftEntries(page) {
  await page.evaluate(() => {
    window.__customerLayoutShiftEntries = [];
  });
}

async function positionInteractionViewport(page, interaction) {
  const measureSelector = interaction.measureSelector ?? interaction.selector;
  const viewportAnchor = interaction.viewportAnchor ?? 0.38;

  await page.locator(interaction.selector).waitFor({ state: "visible" });
  await page.locator(measureSelector).waitFor({ state: "visible" });

  const viewportPosition = await page.evaluate(
    ({ measureSelector, selector, viewportAnchor }) => {
      const element = document.querySelector(measureSelector) || document.querySelector(selector);
      if (!element) {
        return null;
      }

      const beforeRect = element.getBoundingClientRect();
      const absoluteTop = beforeRect.top + window.scrollY;
      const nextScrollY = Math.max(0, Math.round(absoluteTop - window.innerHeight * viewportAnchor));
      window.scrollTo(0, nextScrollY);
      const afterRect = element.getBoundingClientRect();

      return {
        viewportAnchor,
        requestedScrollY: nextScrollY,
        actualScrollY: window.scrollY,
        targetRectBeforePositioning: {
          x: beforeRect.x,
          y: beforeRect.y,
          width: beforeRect.width,
          height: beforeRect.height,
          top: beforeRect.top,
          left: beforeRect.left,
          right: beforeRect.right,
          bottom: beforeRect.bottom
        },
        targetRectAfterPositioning: {
          x: afterRect.x,
          y: afterRect.y,
          width: afterRect.width,
          height: afterRect.height,
          top: afterRect.top,
          left: afterRect.left,
          right: afterRect.right,
          bottom: afterRect.bottom
        }
      };
    },
    { measureSelector, selector: interaction.selector, viewportAnchor }
  );

  await page.waitForTimeout(100);
  return viewportPosition;
}

async function captureInteractionSnapshot(page, interaction, phase) {
  const measureSelector = interaction.measureSelector ?? interaction.selector;

  return page.evaluate(
    ({ measureSelector, phase, selector }) => {
      function rectFor(element) {
        if (!element) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom
        };
      }

      function stylesFor(element) {
        if (!element) {
          return null;
        }

        const style = window.getComputedStyle(element);
        return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      transitionDelay: style.transitionDelay,
      transitionTimingFunction: style.transitionTimingFunction,
      transition: style.transition,
      boxShadow: style.boxShadow,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineOffset: style.outlineOffset,
          transform: style.transform,
          borderTopWidth: style.borderTopWidth,
          borderRightWidth: style.borderRightWidth,
          borderBottomWidth: style.borderBottomWidth,
          borderLeftWidth: style.borderLeftWidth,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight
        };
      }

      function elementKey(role, element, index) {
        const id = element.id ? `#${element.id}` : "";
        const forAttribute = element.getAttribute("for");
        const name = element.getAttribute("name");
        const heading = element.querySelector("h2")?.textContent?.trim();
        const stablePart =
          id ||
          (forAttribute ? `[for="${forAttribute}"]` : "") ||
          (name ? `[name="${name}"]` : "") ||
          (heading ? `:${heading}` : "");

        return `${role}${stablePart || `:${index}`}`;
      }

      function summarizeElement(role, element, index) {
        return {
          key: elementKey(role, element, index),
          role,
          tagName: element.tagName.toLowerCase(),
          id: element.id || "",
          className: element.className || "",
          forAttribute: element.getAttribute("for") || "",
          name: element.getAttribute("name") || "",
          type: element.getAttribute("type") || "",
          checked: "checked" in element ? Boolean(element.checked) : null,
          disabled: "disabled" in element ? Boolean(element.disabled) : null,
          ariaInvalid: element.getAttribute("aria-invalid") || "",
          text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) || "",
          rect: rectFor(element),
          styles: stylesFor(element)
        };
      }

      const trackedRects = [];
      const seenElements = new Set();

      function addTrackedElement(role, element, index = trackedRects.length) {
        if (!element || seenElements.has(element)) {
          return;
        }

        seenElements.add(element);
        trackedRects.push(summarizeElement(role, element, index));
      }

      const target = document.querySelector(selector);
      const measure = document.querySelector(measureSelector) || target;
      const primary = measure || target;
      const targetLabel = target?.closest("label") || primary?.closest("label");
      const field = primary?.closest(".field");
      const group = primary?.closest(".choice-group");
      const section = primary?.closest(".section");

      addTrackedElement("target", target);
      addTrackedElement("measure", measure);
      addTrackedElement("label", targetLabel);
      addTrackedElement("field", field);
      addTrackedElement("choice-group", group);
      addTrackedElement("section", section);
      addTrackedElement("form", document.querySelector("form"));

      Array.from(group?.querySelectorAll(".choice-item") || []).forEach((element, index) => {
        addTrackedElement(`choice-neighbor-${index}`, element, index);
      });

      Array.from(
        section?.querySelectorAll(".field input, .field select, .field textarea, .choice-item") || []
      ).forEach((element, index) => {
        addTrackedElement(`section-control-${index}`, element, index);
      });

      const allSectionRects = Array.from(document.querySelectorAll("form .section")).map(
        (element, index) => ({
          key: `section-${index}`,
          heading: element.querySelector("h2")?.textContent?.trim() || "",
          rect: rectFor(element)
        })
      );

      const activeElement = document.activeElement;
      const documentElement = document.documentElement;
      const body = document.body;

      return {
        phase,
        performanceNow: window.performance.now(),
        pageMetrics: {
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          documentElementScrollHeight: documentElement.scrollHeight,
          documentElementClientHeight: documentElement.clientHeight,
          bodyScrollHeight: body.scrollHeight,
          bodyRect: rectFor(body),
          documentElementRect: rectFor(documentElement)
        },
        activeElement: activeElement
          ? {
              tagName: activeElement.tagName.toLowerCase(),
              id: activeElement.id || "",
              name: activeElement.getAttribute("name") || "",
              type: activeElement.getAttribute("type") || ""
            }
          : null,
        allSectionRects,
        trackedRects,
        layoutShiftSupported: Boolean(window.__customerLayoutShiftSupported),
        layoutShiftEntries: Array.from(window.__customerLayoutShiftEntries || [])
      };
    },
    { measureSelector, phase, selector: interaction.selector }
  );
}

function compareRectEntries(beforeEntries, afterEntries) {
  const beforeByKey = new Map(beforeEntries.map((entry) => [entry.key, entry]));
  const deltas = [];

  afterEntries.forEach((afterEntry) => {
    const beforeEntry = beforeByKey.get(afterEntry.key);
    if (!beforeEntry?.rect || !afterEntry.rect) {
      return;
    }

    const delta = rectDelta(beforeEntry.rect, afterEntry.rect);
    deltas.push({
      key: afterEntry.key,
      role: afterEntry.role || "",
      delta,
      maxDelta: maxDelta(delta)
    });
  });

  return deltas;
}

function maxRectDeltaFromEntries(beforeEntries, afterEntries) {
  return Math.max(0, ...compareRectEntries(beforeEntries, afterEntries).map((entry) => entry.maxDelta));
}

function collectGeometryIssues(before, snapshot) {
  const issues = [];
  const pageMetricPairs = [
    ["body", before.pageMetrics.bodyRect, snapshot.pageMetrics.bodyRect],
    [
      "documentElement",
      before.pageMetrics.documentElementRect,
      snapshot.pageMetrics.documentElementRect
    ]
  ];

  pageMetricPairs.forEach(([key, beforeRect, afterRect]) => {
    if (!beforeRect || !afterRect) {
      return;
    }

    const delta = rectDelta(beforeRect, afterRect);
    const max = maxDelta(delta);
    if (max > geometryTolerancePx) {
      issues.push({ key, maxDelta: max, delta });
    }
  });

  const scrollHeightDelta = Math.abs(
    snapshot.pageMetrics.documentElementScrollHeight -
      before.pageMetrics.documentElementScrollHeight
  );
  if (scrollHeightDelta > geometryTolerancePx) {
    issues.push({
      key: "documentElementScrollHeight",
      maxDelta: scrollHeightDelta,
      delta: { scrollHeight: scrollHeightDelta }
    });
  }

  compareRectEntries(before.allSectionRects, snapshot.allSectionRects).forEach((entry) => {
    if (entry.maxDelta > geometryTolerancePx) {
      issues.push(entry);
    }
  });

  compareRectEntries(before.trackedRects, snapshot.trackedRects).forEach((entry) => {
    if (entry.maxDelta > geometryTolerancePx) {
      issues.push(entry);
    }
  });

  return issues;
}

function collectRiskyTransitionIssues(snapshot) {
  return snapshot.trackedRects
    .filter((entry) => entry.styles && hasRiskyActiveTransition(entry.styles))
    .map((entry) => ({
      key: entry.key,
      role: entry.role,
      transitionProperty: entry.styles.transitionProperty,
      transitionDuration: entry.styles.transitionDuration,
      transitionDelay: entry.styles.transitionDelay
    }));
}

function collectVisualStyleJitterIssues(samples) {
  const baseline = samples[0];
  if (!baseline) {
    return [];
  }

  const baselineByKey = new Map(baseline.trackedRects.map((entry) => [entry.key, entry]));
  const issues = [];

  samples.slice(1).forEach((sample) => {
    sample.trackedRects.forEach((entry) => {
      const baselineEntry = baselineByKey.get(entry.key);
      if (!baselineEntry?.styles || !entry.styles) {
        return;
      }

      const changedProperties = visualJitterStyleProperties.filter(
        (property) => baselineEntry.styles[property] !== entry.styles[property]
      );
      if (changedProperties.length > 0) {
        issues.push({
          key: entry.key,
          role: entry.role,
          phase: sample.phase,
          changedProperties
        });
      }
    });
  });

  return issues;
}

function summarizeIssues(issues, limit = 6) {
  return issues
    .slice(0, limit)
    .map((issue) => `${issue.key}${issue.phase ? `@${issue.phase}` : ""}`)
    .join(", ");
}

function assertInteractionSnapshotsStable(interaction, before, samples) {
  const maxScrollDelta = Math.max(
    0,
    ...samples.map((snapshot) => Math.abs(snapshot.pageMetrics.scrollY - before.pageMetrics.scrollY))
  );
  const geometryIssues = samples.flatMap((snapshot) =>
    collectGeometryIssues(before, snapshot).map((issue) => ({
      ...issue,
      phase: snapshot.phase
    }))
  );
  const maxGeometryDelta = Math.max(0, ...geometryIssues.map((issue) => issue.maxDelta));
  const finalSample = samples[samples.length - 1];
  const layoutShiftValue = finalSample.layoutShiftEntries.reduce(
    (sum, entry) => sum + (Number(entry.value) || 0),
    0
  );
  const riskyTransitionIssues = samples.flatMap((snapshot) =>
    collectRiskyTransitionIssues(snapshot).map((issue) => ({
      ...issue,
      phase: snapshot.phase
    }))
  );
  const visualStyleJitterIssues = collectVisualStyleJitterIssues(samples);

  if (maxScrollDelta > scrollTolerancePx) {
    fail(
      `scroll-stable:${interaction.name}`,
      `scrollY changed by up to ${maxScrollDelta}px; tolerance is ${scrollTolerancePx}px`
    );
  } else {
    pass(`scroll-stable:${interaction.name}`);
  }

  if (geometryIssues.length > 0) {
    fail(
      `page-and-neighbor-geometry-stable:${interaction.name}`,
      `geometry changed by up to ${maxGeometryDelta}px; examples: ${summarizeIssues(geometryIssues)}`
    );
  } else {
    pass(`page-and-neighbor-geometry-stable:${interaction.name}`);
  }

  if (!finalSample.layoutShiftSupported) {
    pass(`layout-instability-api-recorded:${interaction.name}`);
  } else if (layoutShiftValue > layoutShiftTolerance) {
    fail(
      `layout-instability-api-stable:${interaction.name}`,
      `layout-shift value ${layoutShiftValue} exceeded ${layoutShiftTolerance}`
    );
  } else {
    pass(`layout-instability-api-stable:${interaction.name}`);
  }

  if (riskyTransitionIssues.length > 0) {
    fail(
      `no-risky-animated-states:${interaction.name}`,
      `risk-prone transitions are active on ${summarizeIssues(riskyTransitionIssues)}`
    );
  } else {
    pass(`no-risky-animated-states:${interaction.name}`);
  }

  pass(`post-click-visual-style-diffs-recorded:${interaction.name}`);

  return {
    visualStyleDeltas: visualStyleJitterIssues
  };
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function checkInteraction(page, interaction) {
  const actionLocator = page.locator(interaction.selector);
  const measureSelector = interaction.measureSelector ?? interaction.selector;
  const measureLocator = page.locator(measureSelector);

  await actionLocator.waitFor({ state: "visible" });
  await measureLocator.waitFor({ state: "visible" });
  const viewportPosition = await positionInteractionViewport(page, interaction);
  await clearLayoutShiftEntries(page);

  const before = await captureInteractionSnapshot(page, interaction, "before");
  await interaction.action(actionLocator, page);

  const samples = [];
  for (const sample of postClickSampleDelays) {
    if (sample.delayMs > 0) {
      await page.waitForTimeout(sample.delayMs);
    }
    samples.push(await captureInteractionSnapshot(page, interaction, sample.phase));
  }

  const assertionEvidence = assertInteractionSnapshotsStable(interaction, before, samples);

  evidence.interactions.push({
    name: interaction.name,
    selector: interaction.selector,
    measureSelector,
    viewportPosition,
    before,
    samples,
    visualStyleDeltas: assertionEvidence.visualStyleDeltas,
    maxTrackedRectDelta: Math.max(
      0,
      ...samples.map((sample) => maxRectDeltaFromEntries(before.trackedRects, sample.trackedRects))
    ),
    maxSectionRectDelta: Math.max(
      0,
      ...samples.map((sample) =>
        maxRectDeltaFromEntries(before.allSectionRects, sample.allSectionRects)
      )
    )
  });

  await page.screenshot({
    path: path.join(artifactDir, `${slugify(interaction.name)}.png`),
    fullPage: false
  });
}

function isKnownExternalTurnstileConsoleNoise(message) {
  const location = message.location();
  if (!location.url.startsWith("https://challenges.cloudflare.com/")) {
    return false;
  }

  const text = message.text();
  return (
    text === "%c%d font-size:0;color:transparent NaN" ||
    text === "Failed to load resource: the server responded with a status of 401 ()"
  );
}

async function runBrowserCheck() {
  await ensurePlaywrightHostPlatformOverride();
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 }
  });

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    if (isKnownExternalTurnstileConsoleNoise(message)) {
      evidence.ignoredConsoleMessages.push({
        text: message.text(),
        location: message.location()
      });
      return;
    }

    evidence.consoleErrors.push({
      text: message.text(),
      location: message.location()
    });
  });

  page.on("pageerror", (error) => {
    evidence.pageErrors.push(error.stack || error.message);
  });

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:8787" && url.pathname === "/submit") {
      evidence.forbiddenRequests.push({
        method: request.method(),
        url: request.url()
      });
    }
  });

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      evidence.mainFrameNavigations.push(frame.url());
    }
  });

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.locator("form").waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(artifactDir, "before.png"), fullPage: true });

    const interactions = [
      {
        name: "phone input focus and typing",
        selector: "#phone",
        action: async (locator) => {
          await locator.click();
          await locator.fill("01012345678");
        }
      },
      {
        name: "email input focus and typing",
        selector: "#email",
        action: async (locator) => {
          await locator.click();
          await locator.fill("qa@example.com");
        }
      },
      {
        name: "accident date input focus and value",
        selector: "#occurred-date",
        measureSelector: "#occurred-date-shell",
        action: async (locator) => {
          await locator.click();
          await locator.fill("2026-06-10");
        }
      },
      {
        name: "time select focus and value",
        selector: "#occurred-time-hour",
        action: async (locator) => {
          await locator.click();
          await locator.selectOption("10");
        }
      },
      {
        name: "machine serial input focus and typing",
        selector: "#saw-serial-number",
        action: async (locator) => {
          await locator.click();
          await locator.fill("C123456789");
        }
      },
      {
        name: "visible injury radio option",
        selector: "#visibleInjuryMark-0",
        measureSelector: "label[for=\"visibleInjuryMark-0\"]",
        action: async (locator) => {
          await locator.click();
        }
      },
      {
        name: "other device checkbox-style option",
        selector: "#otherDevicesUsed-0",
        measureSelector: "label[for=\"otherDevicesUsed-0\"]",
        action: async (locator) => {
          await locator.click();
        }
      },
      {
        name: "time unknown checkbox",
        selector: "#time-unknown",
        measureSelector: "label[for=\"time-unknown\"]",
        action: async (locator) => {
          await locator.click();
        }
      }
    ];

    for (const interaction of interactions) {
      await checkInteraction(page, interaction);
    }

    await page.screenshot({ path: path.join(artifactDir, "after.png"), fullPage: true });
  } finally {
    await browser.close();
  }
}

try {
  await fs.mkdir(artifactDir, { recursive: true });
  await ensureServer();
  await runBrowserCheck();

  if (evidence.mainFrameNavigations.some((url) => url !== targetUrl)) {
    fail(
      "navigation-localhost-only",
      `main frame navigated outside ${targetUrl}: ${evidence.mainFrameNavigations.join(", ")}`
    );
  } else {
    pass("navigation-localhost-only");
  }

  if (evidence.forbiddenRequests.length > 0) {
    fail(
      "no-submit-request",
      `browser QA must not call /submit. Requests: ${JSON.stringify(evidence.forbiddenRequests)}`
    );
  } else {
    pass("no-submit-request");
  }

  if (evidence.pageErrors.length > 0) {
    fail("no-uncaught-js-errors", evidence.pageErrors.join("\n"));
  } else {
    pass("no-uncaught-js-errors");
  }

  if (evidence.consoleErrors.length > 0) {
    fail(
      "no-console-page-errors",
      evidence.consoleErrors.map((entry) => entry.text).join("\n")
    );
  } else {
    pass("no-console-page-errors");
  }
} catch (error) {
  const detail = isPlaywrightHostDependencyError(error)
    ? formatPlaywrightHostDependencyHold(error)
    : error instanceof Error
      ? error.message
      : String(error);
  fail("customer-click-layout-stability-runner", detail);
} finally {
  await stopServer().catch((error) => {
    fail(
      "local-dev-server-cleanup",
      error instanceof Error ? error.message : String(error)
    );
  });
  await writeEvidence().catch((error) => {
    console.error("Failed to write Playwright evidence:", error);
  });
}

console.log(`Evidence written to ${artifactDir}`);

if (failures > 0) {
  console.error(`Customer click layout stability check failed with ${failures} failure(s).`);
  process.exit(1);
}

console.log("Customer click layout stability check passed.");

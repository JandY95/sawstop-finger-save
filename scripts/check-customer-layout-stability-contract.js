#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const renderPath = path.join(root, "src", "render.ts");
const runnerPath = path.join(root, "scripts", "check-customer-click-layout-stability.mjs");
const renderSource = fs.readFileSync(renderPath, "utf8");
const runnerSource = fs.readFileSync(runnerPath, "utf8");

let failures = 0;

function fail(rule, detail) {
  failures += 1;
  console.error(`FAIL ${rule}: ${detail}`);
}

function pass(rule) {
  console.log(`PASS ${rule}`);
}

function extractStyle(source) {
  const match = source.match(/<style>([\s\S]*?)<\/style>/);
  if (!match) {
    fail("customer-style-extract", "src/render.ts must include the customer page inline style block");
    return "";
  }

  pass("customer-style-extract");
  return match[1];
}

function parseDeclarations(block) {
  const declarations = new Map();

  block
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex === -1) {
        return;
      }

      const property = entry.slice(0, separatorIndex).trim().toLowerCase();
      const value = entry.slice(separatorIndex + 1).trim();
      declarations.set(property, value);
    });

  return declarations;
}

function parseRules(css) {
  const rules = [];
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;

  while ((match = rulePattern.exec(withoutComments)) !== null) {
    const selectorText = match[1].trim();
    if (!selectorText || selectorText.startsWith("@")) {
      continue;
    }

    const selectors = selectorText
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean);

    rules.push({
      selectors,
      declarations: parseDeclarations(match[2])
    });
  }

  return rules;
}

function declarationsForSelector(rules, selector) {
  const declarations = new Map();

  rules.forEach((rule) => {
    if (!rule.selectors.includes(selector)) {
      return;
    }

    rule.declarations.forEach((value, property) => {
      declarations.set(property, value);
    });
  });

  return declarations;
}

function expectDeclaration(rule, declarations, property, expectedPattern, detail) {
  const value = declarations.get(property);
  if (!value || !expectedPattern.test(value)) {
    fail(rule, detail);
    return;
  }

  pass(rule);
}

function expectNoDeclaration(rule, declarations, properties, detail) {
  const found = properties.filter((property) => declarations.has(property));
  if (found.length > 0) {
    fail(rule, `${detail} Found: ${found.join(", ")}`);
    return;
  }

  pass(rule);
}

function expectIncludes(rule, source, needle, detail) {
  if (!source.includes(needle)) {
    fail(rule, detail);
    return;
  }

  pass(rule);
}

function expectNoPattern(rule, source, pattern, detail) {
  if (pattern.test(source)) {
    fail(rule, detail);
    return;
  }

  pass(rule);
}

const jitterProneTransitionProperties = [
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

function hasJitterProneTransition(declarations) {
  const transition = declarations.get("transition");
  const transitionProperty = declarations.get("transition-property");
  const values = [transition, transitionProperty]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  if (values.length === 0) {
    return false;
  }

  return values.some((value) => {
    if (value === "none") {
      return false;
    }

    return jitterProneTransitionProperties.some((property) => {
      const escapedProperty = property.replaceAll("-", "\\-");
      return new RegExp(`(^|[^a-z-])${escapedProperty}([^a-z-]|$)`).test(value);
    });
  });
}

function expectNoJitterProneTransition(rule, declarations, detail) {
  if (hasJitterProneTransition(declarations)) {
    fail(rule, detail);
    return;
  }

  pass(rule);
}

function extractFunctionSource(source, functionName) {
  const functionStart = source.indexOf(`function ${functionName}`);
  if (functionStart === -1) {
    fail(
      `runner-function-present:${functionName}`,
      `${functionName} must exist in scripts/check-customer-click-layout-stability.mjs`
    );
    return "";
  }

  const bodyStart = source.indexOf("{", functionStart);
  if (bodyStart === -1) {
    fail(
      `runner-function-body-present:${functionName}`,
      `${functionName} must have a function body`
    );
    return "";
  }

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        pass(`runner-function-present:${functionName}`);
        return source.slice(functionStart, index + 1);
      }
    }
  }

  fail(
    `runner-function-closed:${functionName}`,
    `${functionName} must have balanced braces`
  );
  return "";
}

const css = extractStyle(renderSource);
const rules = parseRules(css);

const choiceBase = declarationsForSelector(rules, ".choice-item");
expectDeclaration(
  "choice-card-base-border-width",
  choiceBase,
  "border",
  /\b1px\b/,
  ".choice-item must reserve a constant 1px border in the base state"
);
expectDeclaration(
  "choice-card-explicit-border-box",
  choiceBase,
  "box-sizing",
  /^border-box$/,
  ".choice-item must explicitly use border-box so border feedback cannot resize cards"
);
expectNoJitterProneTransition(
  "choice-card-no-jitter-prone-transition",
  choiceBase,
  ".choice-item must not transition border/background/shadow/color/opacity or layout-sensitive properties"
);

const choiceStateSelectors = [
  ".choice-item:hover",
  ".choice-item:focus-within",
  ".choice-item:has(input:checked)",
  ".choice-item:has(input[aria-invalid=\"true\"])",
  ".choice-item:has(input:disabled)"
];
const layoutChangingProperties = [
  "border",
  "border-width",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
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
  "font-size",
  "font-weight",
  "line-height",
  "transform",
  "scale",
  "translate",
  "animation",
  "animation-name"
];

choiceStateSelectors.forEach((selector) => {
  const declarations = declarationsForSelector(rules, selector);
  if (declarations.size === 0) {
    fail(
      `choice-card-state-present:${selector}`,
      `${selector} must be explicit so option interactions use stable visual feedback`
    );
    return;
  }

  pass(`choice-card-state-present:${selector}`);
  expectNoDeclaration(
    `choice-card-state-geometry-stable:${selector}`,
    declarations,
    layoutChangingProperties,
    `${selector} must not change dimensions; use color, background, outline, or box-shadow`
  );
});

const interactiveSelectorPattern =
  /(:hover|:focus|:focus-visible|:focus-within|:active|:checked|\[aria-invalid|\.invalid|\.drag-over|\.is-selected)/;
rules.forEach((rule) => {
  const interactiveSelectors = rule.selectors.filter((selector) =>
    interactiveSelectorPattern.test(selector)
  );
  if (interactiveSelectors.length === 0) {
    return;
  }

  expectNoDeclaration(
    `interactive-state-no-layout-properties:${interactiveSelectors.join(",")}`,
    rule.declarations,
    layoutChangingProperties,
    "interactive CSS states must not change layout-affecting properties"
  );
});

const checkedOptionRules = rules.filter((rule) =>
  rule.selectors.some((selector) => /choice-item.*(:checked|is-selected)/.test(selector))
);
if (checkedOptionRules.length === 0) {
  fail(
    "checked-option-card-state-present",
    "checked choice cards must have an explicit non-layout selected style"
  );
} else {
  pass("checked-option-card-state-present");
  checkedOptionRules.forEach((rule) => {
    expectNoDeclaration(
      `checked-option-no-font-weight:${rule.selectors.join(",")}`,
      rule.declarations,
      ["font-weight"],
      "checked/selected option-card states must not increase font weight"
    );
  });
}

[".field input", ".field select", ".field textarea"].forEach((selector) => {
  const declarations = declarationsForSelector(rules, selector);
  expectDeclaration(
    `form-control-border-box:${selector}`,
    declarations,
    "box-sizing",
    /^border-box$/,
    `${selector} must explicitly use border-box to keep focus/error borders dimension-stable`
  );
  expectDeclaration(
    `form-control-base-border-width:${selector}`,
    declarations,
    "border",
    /\b1px\b/,
    `${selector} must reserve a constant 1px border in the base state`
  );
  expectNoJitterProneTransition(
    `form-control-no-jitter-prone-transition:${selector}`,
    declarations,
    `${selector} must not transition border/background/shadow/color/opacity or layout-sensitive properties`
  );
});

const choiceNativeInput = declarationsForSelector(rules, ".choice-item input");
expectDeclaration(
  "choice-native-input-inline-size",
  choiceNativeInput,
  "inline-size",
  /^16px$/,
  ".choice-item input must use stable inline-size"
);
expectDeclaration(
  "choice-native-input-block-size",
  choiceNativeInput,
  "block-size",
  /^16px$/,
  ".choice-item input must use stable block-size"
);
expectDeclaration(
  "choice-native-input-width",
  choiceNativeInput,
  "width",
  /^16px$/,
  ".choice-item input must keep legacy width stable"
);
expectDeclaration(
  "choice-native-input-height",
  choiceNativeInput,
  "height",
  /^16px$/,
  ".choice-item input must keep legacy height stable"
);
expectDeclaration(
  "choice-native-input-min-width",
  choiceNativeInput,
  "min-width",
  /^16px$/,
  ".choice-item input must reserve native control width"
);
expectDeclaration(
  "choice-native-input-margin",
  choiceNativeInput,
  "margin",
  /^0$/,
  ".choice-item input must not rely on browser default margins"
);
expectDeclaration(
  "choice-native-input-flex-basis",
  choiceNativeInput,
  "flex",
  /^0\s+0\s+16px$/,
  ".choice-item input must keep a fixed flex basis"
);
expectDeclaration(
  "choice-native-input-align-self",
  choiceNativeInput,
  "align-self",
  /^center$/,
  ".choice-item input must align without changing card geometry"
);
expectDeclaration(
  "choice-native-input-accent-color",
  choiceNativeInput,
  "accent-color",
  /^var\(--accent\)$/,
  ".choice-item input must use the form accent color"
);
expectDeclaration(
  "choice-native-input-transform-none",
  choiceNativeInput,
  "transform",
  /^none$/,
  ".choice-item input must not use transforms for selection feedback"
);

[".field input:focus", ".field select:focus", ".field textarea:focus"].forEach((selector) => {
  const declarations = declarationsForSelector(rules, selector);
  if (declarations.size === 0) {
    fail(`form-control-focus-state-present:${selector}`, `${selector} focus state must be explicit`);
    return;
  }

  pass(`form-control-focus-state-present:${selector}`);
  expectNoDeclaration(
    `form-control-focus-geometry-stable:${selector}`,
    declarations,
    layoutChangingProperties,
    `${selector} focus state must not change dimensions`
  );
});

const scrollMatches = [...renderSource.matchAll(/scrollIntoView/g)];
if (scrollMatches.length !== 1) {
  fail(
    "scroll-into-view-submit-only-count",
    `scrollIntoView must appear exactly once in the submit invalid focus helper. Found ${scrollMatches.length}.`
  );
} else {
  pass("scroll-into-view-submit-only-count");
}

const focusHelperStart = renderSource.indexOf("function focusInvalidField");
const focusHelperEnd = renderSource.indexOf("function setSubmitError", focusHelperStart);
const scrollIndex = scrollMatches[0]?.index ?? -1;
if (
  focusHelperStart === -1 ||
  focusHelperEnd === -1 ||
  scrollIndex < focusHelperStart ||
  scrollIndex > focusHelperEnd
) {
  fail(
    "scroll-into-view-submit-helper-scope",
    "scrollIntoView must be scoped to focusInvalidField, which is used by submit validation"
  );
} else {
  pass("scroll-into-view-submit-helper-scope");
}

const validateStart = renderSource.indexOf("function validateCustomerSubmitFields()");
const validateEnd = renderSource.indexOf("function clearFormErrors()", validateStart);
const validateSource =
  validateStart === -1 || validateEnd === -1 || validateEnd <= validateStart
    ? ""
    : renderSource.slice(validateStart, validateEnd);

if (!validateSource.includes("focusInvalidField(firstInvalidResult.focusElement)")) {
  fail(
    "submit-validation-focus-helper-call",
    "focusInvalidField must only be called from the submit validation failure path"
  );
} else {
  pass("submit-validation-focus-helper-call");
}

const focusInvalidCalls = [...renderSource.matchAll(/\bfocusInvalidField\s*\(/g)].filter(
  (match) => !renderSource.slice(Math.max(0, match.index - 20), match.index).includes("function ")
);
if (focusInvalidCalls.length !== 1) {
  fail(
    "focus-invalid-field-call-count",
    `focusInvalidField must have exactly one non-declaration call. Found ${focusInvalidCalls.length}.`
  );
} else if (
  focusInvalidCalls[0].index < validateStart ||
  focusInvalidCalls[0].index > validateEnd
) {
  fail(
    "focus-invalid-field-call-submit-scope",
    "focusInvalidField must not be called by normal click/focus/change handlers"
  );
} else {
  pass("focus-invalid-field-call-submit-scope");
}

const turnstileConsoleAllowlistSource = extractFunctionSource(
  runnerSource,
  "isKnownExternalTurnstileConsoleNoise"
);
if (turnstileConsoleAllowlistSource) {
  expectIncludes(
    "turnstile-console-allowlist-cloudflare-origin",
    turnstileConsoleAllowlistSource,
    'location.url.startsWith("https://challenges.cloudflare.com/")',
    "Turnstile console allowlist must be scoped to challenges.cloudflare.com"
  );
  expectIncludes(
    "turnstile-console-allowlist-nan-exact",
    turnstileConsoleAllowlistSource,
    'text === "%c%d font-size:0;color:transparent NaN"',
    "Turnstile console allowlist must match the known formatting noise exactly"
  );
  expectIncludes(
    "turnstile-console-allowlist-401-exact",
    turnstileConsoleAllowlistSource,
    'text === "Failed to load resource: the server responded with a status of 401 ()"',
    "Turnstile console allowlist must match only the known Turnstile 401 resource noise"
  );
  expectNoPattern(
    "turnstile-console-allowlist-no-return-true",
    turnstileConsoleAllowlistSource,
    /\breturn\s+true\s*;/,
    "Turnstile console allowlist must not contain a blanket return true"
  );
}

expectIncludes(
  "turnstile-console-ignored-evidence-field",
  runnerSource,
  "ignoredConsoleMessages: []",
  "Runner evidence must include an ignoredConsoleMessages array"
);
expectIncludes(
  "runner-samples-multiple-post-click-frames",
  runnerSource,
  'phase: "after-50ms"',
  "Runner must sample multiple post-click frames, including after 50ms"
);
expectIncludes(
  "runner-samples-300ms-frame",
  runnerSource,
  'phase: "after-300ms"',
  "Runner must sample post-click state through 300ms"
);
expectIncludes(
  "runner-page-neighbor-geometry-check",
  runnerSource,
  "page-and-neighbor-geometry-stable",
  "Runner must keep page and neighbor geometry assertions"
);
expectIncludes(
  "runner-layout-instability-api-check",
  runnerSource,
  "layout-instability-api-stable",
  "Runner must keep the Layout Instability API assertion"
);
expectIncludes(
  "runner-no-risky-animated-states-check",
  runnerSource,
  "no-risky-animated-states",
  "Runner must still fail active risky transitions"
);
expectIncludes(
  "runner-visual-style-diffs-evidence-only",
  runnerSource,
  "visualStyleDeltas",
  "Runner must record computed visual style diffs in evidence"
);
expectNoPattern(
  "runner-no-post-click-visual-style-stable-failure",
  runnerSource,
  /post-click-visual-style-stable/,
  "Runner must not fail legitimate focus/checked style changes as visual-style instability"
);
expectIncludes(
  "turnstile-console-ignored-evidence-push",
  runnerSource,
  "evidence.ignoredConsoleMessages.push",
  "Ignored Turnstile console noise must be recorded in evidence"
);
expectIncludes(
  "console-errors-still-collected",
  runnerSource,
  "evidence.consoleErrors.push",
  "Non-allowlisted console errors must still be collected for failure"
);
expectIncludes(
  "console-errors-still-fail",
  runnerSource,
  'fail(\n      "no-console-page-errors"',
  "Collected console errors must still fail no-console-page-errors"
);

if (failures > 0) {
  console.error(`Customer layout stability contract failed with ${failures} failure(s).`);
  process.exit(1);
}

console.log("Customer layout stability contract check passed.");

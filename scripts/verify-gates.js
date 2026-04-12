#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const args = process.argv.slice(2);
const statePath = path.join(root, '.project-state.json');
const requiredFiles = ['AGENTS.md', 'MVP_CHECKLIST.md', 'PLAN_PROMPT.txt', '.gitignore'];

function fail(message) {
  console.error(`FAIL: ${message}`);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function fileExistsNonEmpty(rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) && fs.statSync(p).size > 0;
}

function gitRepoReady() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function gitOriginExists() {
  try {
    const out = execSync('git remote get-url origin', { stdio: 'pipe' }).toString().trim();
    return Boolean(out);
  } catch {
    return false;
  }
}

function gitignoreProtectsSecrets() {
  const p = path.join(root, '.gitignore');
  if (!fs.existsSync(p)) return false;
  const body = fs.readFileSync(p, 'utf8');
  return body.includes('.dev.vars');
}

function trackedSecretFile() {
  if (!gitRepoReady()) return false;
  try {
    const out = execSync('git ls-files .dev.vars', { stdio: 'pipe' }).toString().trim();
    return Boolean(out);
  } catch {
    return false;
  }
}

function hasState() {
  return fs.existsSync(statePath);
}

function qualityPass(value) {
  return value === 'pass';
}

function stagePrereqs(state, stage) {
  const cs = state.coreState || {};
  switch (stage) {
    case 'stage4_role_split':
      return [
        ['docsLocked', cs.docsLocked],
        ['planApproved', cs.planApproved],
        ['githubReady', cs.githubReady],
        ['notionReady', cs.notionReady],
        ['baseStructureReady', cs.baseStructureReady],
        ['contextHygieneReady', cs.contextHygieneReady],
        ['sessionSplitDefined', cs.sessionSplitDefined],
        ['handoffDisciplineReady', cs.handoffDisciplineReady],
        ['frontendDesignAutoApply', cs.frontendDesignAutoApply]
      ];
    case 'stage1_parallel':
      return [
        ['stage4Unlocked', state.stageGates?.stage4_role_split?.status === 'unlocked'],
        ['roleSplitApplied', cs.roleSplitApplied],
        ['fileBoundariesDefined', cs.fileBoundariesDefined],
        ['singleFlowImplemented', cs.singleFlowImplemented],
        ['singleFlowVerified', cs.singleFlowVerified],
        ['automatedTestingStrategyDefined', cs.automatedTestingStrategyDefined],
        ['automatedTestingReady', cs.automatedTestingReady]
      ];
    case 'stage6_skills':
      return [
        ['stage1Unlocked', state.stageGates?.stage1_parallel?.status === 'unlocked'],
        ['repeatedPatternDetected', cs.repeatedPatternDetected],
        ['repeatedPatternStable', cs.repeatedPatternStable],
        ['singleFlowVerified', cs.singleFlowVerified],
        ['automatedTestingReady', cs.automatedTestingReady]
      ];
    case 'stage7_hooks':
      return [
        ['stage1Unlocked', state.stageGates?.stage1_parallel?.status === 'unlocked'],
        ['toolchainLocked', cs.toolchainLocked],
        ['firstDeployVerified', cs.firstDeployVerified],
        ['vitestConfigured', cs.vitestConfigured],
        ['automatedTestingReady', cs.automatedTestingReady]
      ];
    default:
      return [];
  }
}

function stageQualityRequirements(state, stage) {
  const qs = state.qualitySignals || {};
  switch (stage) {
    case 'stage4_role_split':
      return [
        ['gateReview', qualityPass(qs.gateReview)]
      ];
    case 'stage1_parallel':
      return [
        ['manualVerify', qualityPass(qs.manualVerify)]
      ];
    case 'stage6_skills':
      return [
        ['unitTest', qualityPass(qs.unitTest)],
        ['integrationTest', qualityPass(qs.integrationTest)]
      ];
    case 'stage7_hooks':
      return [
        ['format', qualityPass(qs.format)],
        ['lint', qualityPass(qs.lint)],
        ['typecheck', qualityPass(qs.typecheck)],
        ['build', qualityPass(qs.build)],
        ['unitTest', qualityPass(qs.unitTest)],
        ['integrationTest', qualityPass(qs.integrationTest)],
        ['manualVerify', qualityPass(qs.manualVerify)]
      ];
    default:
      return [];
  }
}

function gateVerificationReady(stageGate) {
  return [
    ['structureVerification', stageGate?.structureVerification === 'pass'],
    ['functionalVerification', stageGate?.functionalVerification === 'pass'],
    ['manualApproval', stageGate?.manualApproval === true]
  ];
}

function handoffReady(state, stage) {
  if (stage === 'stage4_role_split') return true;
  return Boolean(state.evidence?.lastHandoffSummary && state.evidence.lastHandoffSummary.trim().length > 0);
}

function updateStage(state, stage, ok, notes) {
  const now = new Date().toISOString();
  state.stageGates[stage].lastCheckedAt = now;
  state.stageGates[stage].notes = notes.join(' | ');
  state.stageGates[stage].status = ok ? 'unlocked' : 'locked';
  if (ok) state.stageGates[stage].lastApprovedAt = state.stageGates[stage].lastApprovedAt || now;
}

function run(stage) {
  if (!hasState()) {
    console.error('Missing .project-state.json in project root.');
    process.exit(1);
  }
  const state = readJson(statePath);
  if (!state.stageGates || !state.stageGates[stage]) {
    console.error(`Unknown stage: ${stage}`);
    process.exit(1);
  }

  const notes = [];
  let ok = true;

  requiredFiles.forEach((f) => {
    if (!fileExistsNonEmpty(f)) {
      ok = false;
      notes.push(`missing_or_empty:${f}`);
      fail(`${f} is missing or empty`);
    } else {
      pass(`${f} exists and is not empty`);
    }
  });

  if (!gitRepoReady()) {
    ok = false;
    notes.push('git_repo_not_ready');
    fail('Git repository is not initialized or not accessible');
  } else {
    pass('Git repository is ready');
  }

  if (!gitOriginExists()) {
    ok = false;
    notes.push('git_origin_missing');
    fail('Git remote origin is missing');
  } else {
    pass('Git remote origin exists');
  }

  if (!gitignoreProtectsSecrets()) {
    ok = false;
    notes.push('gitignore_missing_dev_vars');
    fail('.gitignore does not appear to protect .dev.vars');
  } else {
    pass('.gitignore protects .dev.vars');
  }

  if (trackedSecretFile()) {
    ok = false;
    notes.push('dev_vars_tracked');
    fail('.dev.vars is tracked by git');
  } else {
    pass('.dev.vars is not tracked by git');
  }

  for (const [name, passed] of stagePrereqs(state, stage)) {
    if (!passed) {
      ok = false;
      notes.push(`prereq_failed:${name}`);
      fail(`Prerequisite failed: ${name}`);
    } else {
      pass(`Prerequisite passed: ${name}`);
    }
  }

  for (const [name, passed] of stageQualityRequirements(state, stage)) {
    if (!passed) {
      ok = false;
      notes.push(`quality_failed:${name}`);
      fail(`Quality requirement failed: ${name}`);
    } else {
      pass(`Quality requirement passed: ${name}`);
    }
  }

  for (const [name, passed] of gateVerificationReady(state.stageGates[stage])) {
    if (!passed) {
      ok = false;
      notes.push(`gate_failed:${name}`);
      fail(`Gate verification failed: ${name}`);
    } else {
      pass(`Gate verification passed: ${name}`);
    }
  }

  if (!handoffReady(state, stage)) {
    ok = false;
    notes.push('handoff_summary_missing');
    fail('Handoff summary is missing for stage transition');
  } else {
    pass('Handoff summary is ready');
  }

  updateStage(state, stage, ok, notes);
  writeJson(statePath, state);

  if (!ok) {
    console.error(`\nStage ${stage} remains LOCKED.`);
    process.exit(1);
  }

  console.log(`\nStage ${stage} is UNLOCKED.`);
}

if (args[0] === '--status') {
  if (!hasState()) {
    console.error('Missing .project-state.json in project root.');
    process.exit(1);
  }
  const state = readJson(statePath);
  console.log(JSON.stringify(state.stageGates, null, 2));
  process.exit(0);
}

if (!args[0]) {
  console.error('Usage: node scripts/verify-gates.js <stage_name>');
  console.error('Example: node scripts/verify-gates.js stage4_role_split');
  process.exit(1);
}

run(args[0]);

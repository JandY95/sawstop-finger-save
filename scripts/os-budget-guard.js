#!/usr/bin/env node
import { projectRoot, projectState, runCore, printAndExit } from './os-common.js';

const state = projectState();
const budget = state.usageBudget || {};
if (typeof budget.remainingPercent !== 'number' || !budget.tool) {
  console.log(JSON.stringify({ skipped: true, reason: 'usageBudget not initialized' }, null, 2));
  process.exit(0);
}

const args = [
  '--project', projectRoot,
  '--tool', String(budget.tool),
  '--percent', String(budget.remainingPercent),
  '--limit-type', String(budget.limitType || '5h'),
  '--resume-mode', String(budget.resumeMode || 'local'),
  '--schedule', 'false'
];
if (budget.resetAt) args.push('--reset-at', String(budget.resetAt));
if (state.resumeState?.resumeCommand) args.push('--resume-command', String(state.resumeState.resumeCommand));
if (state.recommendedNextAction) args.push('--next', String(state.recommendedNextAction));

const result = runCore('check-budget-and-pause.js', args);
printAndExit(result, 'budget guard failed');

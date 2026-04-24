#!/usr/bin/env node
import { projectRoot, projectState, runCore, printAndExit } from './os-common.js';

const state = projectState();
const next = state.recommendedNextAction || '다음 1개 행동을 handoff에 남긴다.';
printAndExit(runCore('write-handoff.js', ['--project', projectRoot, '--next', next]), 'write-handoff failed');
printAndExit(runCore('prepare-resume-plan.js', ['--project', projectRoot]), 'prepare-resume-plan failed');

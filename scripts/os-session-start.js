#!/usr/bin/env node
import { projectRoot, runCore, printAndExit } from './os-common.js';

const result = runCore('check-stage.js', ['--project', projectRoot, '--mode', 'auto-session-start']);
printAndExit(result, 'os-session-start failed');

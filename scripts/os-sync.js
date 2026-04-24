#!/usr/bin/env node
import path from 'path';
import { projectRoot, runCore, printAndExit, loadJson } from './os-common.js';

const projectProfile = loadJson(path.join(projectRoot, 'project.profile.json'), {});
const harnessLink = loadJson(path.join(projectRoot, '.harness-link.json'), {});
const rawToolProfile = projectProfile.toolProfile || harnessLink.toolProfile || projectProfile.hostMode || harnessLink.hostMode || 'both';
const toolProfile = ['claude', 'codex', 'both'].includes(String(rawToolProfile).toLowerCase())
  ? String(rawToolProfile).toLowerCase()
  : 'both';

printAndExit(runCore('sync-project.js', ['--project', projectRoot]), 'project sync failed');
printAndExit(runCore('sync-engine-assets.js', ['--project', projectRoot, '--tool', toolProfile]), 'engine assets sync failed');
printAndExit(runCore('generate-engine-routing-doc.js', ['--project', projectRoot]), 'engine routing generation failed');
printAndExit(runCore('generate-host-overlays.js', ['--project', projectRoot]), 'overlay regeneration failed');

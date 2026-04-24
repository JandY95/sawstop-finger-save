#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { projectRoot, runCore, printAndExit, loadJson } from './os-common.js';

const pendingIncidentPath = path.join(projectRoot, 'docs', 'harness', 'local', 'incidents', 'pending.json');
if (fs.existsSync(pendingIncidentPath)) {
  const pending = loadJson(pendingIncidentPath, null);
  if (pending && pending.title && pending.summary) {
    const result = runCore('post-incident.js', [
      '--project', projectRoot,
      '--title', pending.title,
      '--summary', pending.summary,
      '--scope', pending.scope || 'project',
      '--apply', String(pending.apply !== false)
    ]);
    printAndExit(result, 'auto incident promotion failed');
    fs.rmSync(pendingIncidentPath, { force: true });
  }
}

const pendingEngineFeedbackPath = path.join(projectRoot, 'docs', 'harness', 'local', 'engine-feedback', 'pending.json');
if (fs.existsSync(pendingEngineFeedbackPath)) {
  const pending = loadJson(pendingEngineFeedbackPath, null);
  if (pending && pending.title) {
    const postArgs = [
      '--project', projectRoot,
      '--title', pending.title
    ];

    if (pending.summary) postArgs.push('--summary', pending.summary);
    if (pending.fingerprint) postArgs.push('--fingerprint', pending.fingerprint);
    if (pending.engine) postArgs.push('--engine', pending.engine);
    if (pending.channel) postArgs.push('--channel', pending.channel);
    if (pending.scope) postArgs.push('--scope', pending.scope);
    if (Object.prototype.hasOwnProperty.call(pending, 'applyToFutureProjects')) {
      postArgs.push('--apply', String(pending.applyToFutureProjects));
    }
    if (pending.status) postArgs.push('--status', pending.status);
    if (Array.isArray(pending.assetRefs) && pending.assetRefs.length > 0) {
      postArgs.push('--assets', pending.assetRefs.join('||'));
    }
    if (pending.notes) postArgs.push('--notes', pending.notes);

    const postResult = runCore('post-engine-feedback.js', postArgs);
    printAndExit(postResult, 'auto engine feedback intake failed');

    const postedId = (postResult.stdout || '').match(/\[engine-feedback:posted\]\s+(\S+)/)?.[1];
    if (postedId) {
      const promoteResult = runCore('promote-engine-feedback.js', ['--feedback', postedId]);
      printAndExit(promoteResult, 'auto engine feedback promotion failed');
    }

    fs.rmSync(pendingEngineFeedbackPath, { force: true });
  }
}

printAndExit(runCore('sync-project.js', ['--project', projectRoot]), 'project sync failed');
printAndExit(runCore('sync-engine-assets.js', ['--project', projectRoot]), 'engine asset sync failed');
printAndExit(runCore('generate-engine-routing-doc.js', ['--project', projectRoot]), 'engine routing generation failed');
printAndExit(runCore('generate-host-overlays.js', ['--project', projectRoot]), 'overlay regeneration failed');
printAndExit(runCore('check-stage.js', ['--project', projectRoot, '--mode', 'auto-post-tool']), 'stage re-check failed');
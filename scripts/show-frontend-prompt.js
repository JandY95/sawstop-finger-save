#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
const file = path.join(process.cwd(), 'FRONTEND_START_PROMPT.txt');
if (!fs.existsSync(file)) {
  console.error('FRONTEND_START_PROMPT.txt not found in project root.');
  process.exit(1);
}
console.log(fs.readFileSync(file, 'utf8'));

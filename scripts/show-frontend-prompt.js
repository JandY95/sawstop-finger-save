#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'FRONTEND_START_PROMPT.txt');
if (!fs.existsSync(file)) {
  console.error('FRONTEND_START_PROMPT.txt not found in project root.');
  process.exit(1);
}
console.log(fs.readFileSync(file, 'utf8'));

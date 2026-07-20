'use strict';

// Color only when stdout is a TTY and NO_COLOR isn't set, so piped/CI output stays
// clean for jq and logs.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const CODES = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function color(str, name) {
  if (!useColor || !CODES[name]) return str;
  return CODES[name] + str + CODES.reset;
}

// Data → stdout as JSON (pretty for TTY, compact when piped or --compact), so it pipes
// cleanly into jq. Scalars print bare.
function print(value, flags = {}) {
  if (value === null || value === undefined) return;
  if (typeof value !== 'object') return console.log(String(value));
  const compact = flags.compact || (!process.stdout.isTTY && !flags.pretty);
  console.log(JSON.stringify(value, null, compact ? 0 : 2));
}

function printErr(msg) {
  process.stderr.write((useColor ? CODES.red + msg + CODES.reset : msg) + '\n');
}

module.exports = { print, printErr, color };

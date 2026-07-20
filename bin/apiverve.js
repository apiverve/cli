#!/usr/bin/env node
'use strict';

const { main } = require('../src/cli');

Promise.resolve(main(process.argv.slice(2))).catch((err) => {
  process.stderr.write((err && err.message ? err.message : String(err)) + '\n');
  process.exit(err && err.exitCode ? err.exitCode : 1);
});

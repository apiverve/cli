'use strict';

// APIVerve CLI — one command, 350+ APIs. Zero runtime deps by design so the container
// stays tiny and `npm i -g` is instant. The catalog is baked into manifest.json and, when
// online, refreshed from assets.apiverve.com (see catalog.js) — so list/--help/validation
// work offline, only the actual call hits origin, and staleness never blocks a call.

const fs = require('fs');
const path = require('path');
const { request } = require('./request');
const { validate, passthroughValues } = require('./validate');
const { print, printErr, color } = require('./format');
const catalog = require('./catalog');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

// Populated in main() before any command runs, so the rest of the module reads it freely.
let manifest = { apiBase: 'https://api.apiverve.com', apis: {} };
let APIS = {};

function setManifest(m) {
  manifest = m || manifest;
  APIS = manifest.apis || {};
}

function resolveKey(flags) {
  return flags['api-key'] || process.env.APIVERVE_API_KEY || process.env.APIVERVE_KEY || null;
}

// Split argv into positionals and flags. A `--name` consumes the next token as its value
// unless that token is another `--flag`. Negative numbers (`--lon -37.6`) are single-dash,
// so they're consumed as values.
function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      if (eq !== -1) {
        flags[tok.slice(2, eq)] = tok.slice(eq + 1);
      } else {
        const name = tok.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[name] = next;
          i++;
        } else {
          flags[name] = true;
        }
      }
    } else if (tok.startsWith('-') && tok.length === 2 && isNaN(Number(tok))) {
      flags[tok.slice(1)] = true;
    } else {
      positionals.push(tok);
    }
  }
  return { positionals, flags };
}

async function main(argv) {
  const { positionals, flags } = parseArgs(argv);

  if (flags.version || flags.v) return console.log(pkg.version);
  const cmd = positionals[0];

  // `update` refreshes the local catalog on demand — its own path, no catalog load first.
  if (cmd === 'update') return update();

  // Load the catalog with no network — baked (or a previously cached refresh). A refresh
  // only happens reactively, inside callApi, when we actually hit an unknown id/param.
  setManifest(catalog.loadLocal());

  if (!cmd || cmd === 'help' || flags.help || flags.h) {
    if (cmd && cmd !== 'help' && APIS[cmd]) return apiHelp(cmd);
    return usage();
  }
  if (cmd === 'list' || cmd === 'ls') return list(positionals.slice(1), flags);
  if (cmd === 'categories') return categories();
  if (cmd === 'search') return list(positionals.slice(1), { ...flags, search: positionals[1] });

  const id = cmd;
  const allowRefresh = !flags['no-refresh'];

  if (flags.help || flags.h) {
    let api = APIS[id];
    if (!api && allowRefresh) {
      const fresh = await catalog.reactiveRefresh();
      if (fresh) { setManifest(fresh); api = APIS[id]; }
    }
    if (!api) return printErr(`Unknown API '${id}'. Run 'apiverve list' to see all APIs.`);
    return apiHelp(id);
  }
  return callApi(id, flags);
}

async function callApi(id, flags) {
  const allowRefresh = !flags['no-refresh'];
  let api = APIS[id];
  let values;
  const warnings = [];

  // Unknown id is evidence the catalog is behind — refresh once and retry before giving up.
  if (!api && allowRefresh) {
    const fresh = await catalog.reactiveRefresh();
    if (fresh) { setManifest(fresh); api = APIS[id]; }
  }

  if (!api) {
    // Still unknown after a refresh: forward to origin anyway (server is authoritative).
    warnings.push(
      `'${id}' isn't in this CLI's catalog — forwarding to the API without local validation. ` +
        `Run 'apiverve update' to refresh.`
    );
    const near = suggest(id);
    if (near.length) warnings.push(`Close matches: ${near.join(', ')}`);
    api = { title: id, method: 'GET', path: `/v1/${id}`, params: [] };
    values = passthroughValues(flags);
  } else {
    let v = validate(api, flags);
    // Unknown params can also mean the catalog is behind — refresh once and re-validate,
    // so a legitimately-new param resolves cleanly instead of just warning.
    if (v.warnings.length && allowRefresh) {
      const fresh = await catalog.reactiveRefresh();
      if (fresh) { setManifest(fresh); api = APIS[id] || api; v = validate(api, flags); }
    }
    if (v.errors.length) {
      printErr(`Invalid input for '${id}':`);
      v.errors.forEach((e) => printErr('  - ' + e));
      printErr(`\nRun 'apiverve ${id} --help' for the parameters.`);
      process.exit(2);
    }
    values = v.values;
    warnings.push(...v.warnings);
  }

  warnings.forEach((w) => printErr('warning: ' + w));

  const key = resolveKey(flags);
  if (!key) {
    printErr('No API key. Set APIVERVE_API_KEY or pass --api-key <key>.');
    printErr('Get a free key at https://apiverve.com');
    process.exit(2);
  }

  try {
    const res = await request({ base: manifest.apiBase, api, values, key });
    if (flags.raw) return print(res.body, flags);
    print(res.body && 'data' in res.body ? res.body.data : res.body, flags);
  } catch (err) {
    printErr(err.message);
    process.exit(err.exitCode || 1);
  }
}

async function update() {
  if (catalog.isOffline()) {
    printErr('APIVERVE_OFFLINE is set — refresh skipped.');
    process.exit(2);
  }
  process.stderr.write(`Refreshing catalog from ${catalog.REMOTE_URL} ...\n`);
  const r = await catalog.refresh();
  if (!r.ok) {
    printErr(`Update failed: ${r.reason}. The baked catalog is still in use.`);
    process.exit(1);
  }
  console.log(r.updated ? `Updated — ${r.count} APIs now cached locally.` : `Already up to date (${r.count} APIs).`);
}

function list(rest, flags) {
  let ids = Object.keys(APIS).sort();
  const cat = flags.category || flags.c;
  const term = (flags.search || rest[0] || '').toLowerCase();
  if (cat) ids = ids.filter((i) => (APIS[i].category || '').toLowerCase() === String(cat).toLowerCase());
  if (term)
    ids = ids.filter(
      (i) =>
        i.includes(term) ||
        (APIS[i].title || '').toLowerCase().includes(term) ||
        (APIS[i].description || '').toLowerCase().includes(term)
    );

  if (flags.json) {
    return console.log(
      JSON.stringify(ids.map((i) => ({ id: i, title: APIS[i].title, category: APIS[i].category })), null, 2)
    );
  }
  if (!ids.length) return console.log('No APIs match.');
  const width = Math.max(...ids.map((i) => i.length));
  for (const i of ids) console.log(`  ${color(i.padEnd(width), 'cyan')}  ${APIS[i].title}`);
  console.log(`\n${ids.length} API${ids.length === 1 ? '' : 's'}. Run 'apiverve <id> --help' for details.`);
}

function categories() {
  const counts = {};
  for (const i of Object.keys(APIS)) {
    const c = APIS[i].category || 'Uncategorized';
    counts[c] = (counts[c] || 0) + 1;
  }
  const names = Object.keys(counts).sort();
  const width = Math.max(...names.map((n) => n.length));
  for (const n of names) console.log(`  ${color(n.padEnd(width), 'cyan')}  ${counts[n]}`);
  console.log(`\n${names.length} categories. Filter with 'apiverve list --category "<name>"'.`);
}

function apiHelp(id) {
  const api = APIS[id];
  console.log(`\n${color(api.title, 'bold')}  ${color('(' + id + ')', 'gray')}`);
  if (api.category) console.log(color(api.category, 'gray'));
  if (api.description) console.log('\n' + api.description);
  console.log(`\n${color('Usage:', 'bold')}\n  apiverve ${id}` + (api.params.length ? ' [options]' : ''));

  if (api.params.length) {
    console.log(`\n${color('Parameters:', 'bold')}`);
    const width = Math.max(...api.params.map((p) => p.name.length));
    for (const p of api.params) {
      const req = p.required ? color(' (required)', 'yellow') : '';
      const type = color('<' + (p.type || 'string') + '>', 'gray');
      console.log(`  --${color(p.name.padEnd(width), 'cyan')} ${type}${req}`);
      if (p.description) console.log(`      ${p.description}`);
    }
    const example = api.params
      .filter((p) => p.required && p.example !== undefined)
      .map((p) => `--${p.name} ${JSON.stringify(p.example)}`)
      .join(' ');
    if (example) console.log(`\n${color('Example:', 'bold')}\n  apiverve ${id} ${example}`);
  } else {
    console.log('\nNo parameters.');
  }
  console.log(`\nDocs: https://docs.apiverve.com/api/${id}\n`);
}

function suggest(id) {
  return Object.keys(APIS).filter((i) => i.includes(id) || id.includes(i)).slice(0, 5);
}

function usage() {
  console.log(`
${color('APIVerve CLI', 'bold')} — ${Object.keys(APIS).length}+ APIs from one command.

${color('Usage:', 'bold')}
  apiverve <api> [--param value ...]   Call an API
  apiverve list [--category <c>] [--search <t>] [--json]
  apiverve categories                  List categories with counts
  apiverve <api> --help                Show an API's parameters
  apiverve update                      Refresh the catalog from apiverve.com
  apiverve --version

${color('Auth:', 'bold')}
  export APIVERVE_API_KEY=your_key     (or pass --api-key)
  Free key: https://apiverve.com

${color('Examples:', 'bold')}
  apiverve marineweather --lat 29.48 --lon -37.62
  apiverve emailvalidator --email support@myspace.com | jq .
  docker run --rm -e APIVERVE_API_KEY=$APIVERVE_API_KEY apiverve/cli list

${color('Output:', 'bold')}
  Prints the response 'data' as JSON to stdout (--raw for the full envelope).
  Errors go to stderr. Exit 0 = ok, 1 = API error, 2 = usage/validation.

${color('Catalog:', 'bold')}
  The catalog is built in and works offline. It refreshes automatically only when
  it sees an unknown API or parameter; 'apiverve update' refreshes on demand.
  APIVERVE_OFFLINE=1 disables all network; --no-refresh skips it for one command.
`);
}

module.exports = { main };

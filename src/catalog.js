'use strict';

// Catalog resolution: baked floor + reactive (evidence-driven) refresh.
//
//   1. Baked manifest.json ships in the package/image — always works, offline, forever.
//      A previously cached refresh (~/.apiverve) is preferred when newer (by generatedAt).
//   2. There is NO timer/poll. A normal call to a known API does zero network. Refresh is
//      triggered ONLY by evidence of staleness — an unknown API id or unknown param — at
//      which point the CLI fetches once (blocking, this run only) and re-resolves. This
//      behaves identically native and in an ephemeral container (no persistent throttle
//      state to lose), and browsing (list/--help) never phones home.
//   3. `apiverve update` forces a full refresh on demand. APIVERVE_OFFLINE=1 and
//      --no-refresh disable all network. APIVERVE_MANIFEST_URL overrides the source.
//
// Fetch failures fail open: the baked/cached catalog is used and the call proceeds
// (origin is authoritative — see passthrough in validate.js).

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');

const BAKED = path.join(__dirname, '..', 'manifest.json');
const CACHE_DIR = path.join(os.homedir(), '.apiverve');
const CACHE_FILE = path.join(CACHE_DIR, 'manifest.json');
const REMOTE_URL = process.env.APIVERVE_MANIFEST_URL || 'https://assets.apiverve.com/cli-manifest.json';

let refreshedThisRun = false; // at most one network refresh per invocation

function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

const gen = (m) => (m && m.generatedAt) || 0;
const isOffline = () => process.env.APIVERVE_OFFLINE === '1' || process.env.APIVERVE_OFFLINE === 'true';

// Freshest manifest already on disk (cache vs baked) — no network.
function loadLocal() {
  const baked = readJSON(BAKED);
  const cached = readJSON(CACHE_FILE);
  if (cached && cached.apis && gen(cached) >= gen(baked)) return cached;
  return baked || { apiBase: 'https://api.apiverve.com', apis: {} };
}

function writeCache(m) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(m));
  } catch {
    /* cache is best-effort */
  }
}

function fetchRemote(timeoutMs) {
  const client = REMOTE_URL.startsWith('http://') ? http : https;
  return new Promise((resolve, reject) => {
    const req = client.get(REMOTE_URL, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

// Reactive refresh: called when the CLI hits an unknown id/param. Blocking, at most once
// per run, fails silent. Returns the newer manifest if it adopted one, else null.
async function reactiveRefresh() {
  if (isOffline() || refreshedThisRun) return null;
  refreshedThisRun = true;
  try {
    const remote = await fetchRemote(2500);
    if (remote && remote.apis && gen(remote) > gen(loadLocal())) {
      writeCache(remote);
      return remote;
    }
  } catch {
    /* fail open */
  }
  return null;
}

// Explicit refresh for `apiverve update`. Longer timeout; reports status.
async function refresh() {
  refreshedThisRun = true;
  const before = loadLocal();
  try {
    const remote = await fetchRemote(6000);
    if (!remote || !remote.apis) return { ok: false, reason: 'empty response' };
    writeCache(remote);
    return { ok: true, updated: gen(remote) > gen(before), count: Object.keys(remote.apis).length, from: REMOTE_URL };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = { loadLocal, reactiveRefresh, refresh, isOffline, REMOTE_URL };

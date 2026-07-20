'use strict';

const https = require('https');
const { URL } = require('url');

// Maps origin HTTP status to the real meaning. Per APIVerve semantics, 403 almost
// always means out of credits, not a bad key — 401 is the only auth verdict.
function statusMessage(status, body) {
  const apiErr = body && (body.error || body.message);
  switch (status) {
    case 401:
      return 'Unauthorized (401): the API key is invalid. Check APIVERVE_API_KEY.';
    case 403:
      return 'Forbidden (403): out of credits for this API. Top up at https://apiverve.com';
    case 404:
      return 'Not found (404): this API is not available on your plan.';
    case 429:
      return 'Rate limited (429): slow down and retry shortly.';
    default:
      return `API error (${status})${apiErr ? ': ' + apiErr : ''}`;
  }
}

function request({ base, api, values, key }) {
  return new Promise((resolve, reject) => {
    const url = new URL(base.replace(/\/$/, '') + api.path);
    const method = (api.method || 'GET').toUpperCase();

    let payload = null;
    const headers = {
      'x-api-key': key,
      Accept: 'application/json',
      'User-Agent': 'apiverve-cli',
    };

    if (method === 'GET' || method === 'DELETE') {
      for (const [k, v] of Object.entries(values)) url.searchParams.set(k, v);
    } else {
      payload = JSON.stringify(values);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(
      url,
      { method, headers, timeout: 30000 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let body = null;
          try {
            body = data ? JSON.parse(data) : null;
          } catch {
            body = data;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, body });
          } else {
            const err = new Error(statusMessage(res.statusCode, body));
            err.exitCode = 1;
            reject(err);
          }
        });
      }
    );

    req.on('error', (e) => {
      const err = new Error(`Network error: ${e.message}`);
      err.exitCode = 1;
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      const err = new Error('Request timed out after 30s.');
      err.exitCode = 1;
      reject(err);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { request };

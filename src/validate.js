'use strict';

// Pre-flight validation of KNOWN params, plus lenient pass-through of unknown ones.
// The origin is the source of truth: the baked schema is advisory, so a param the CLI
// hasn't heard of yet (added to the API after this build) is forwarded with a warning
// rather than rejected. That way a stale catalog never blocks a call — see catalog.js.

const RESERVED = new Set([
  'api-key', 'raw', 'json', 'compact', 'pretty', 'help', 'h', 'quiet', 'q', 'no-refresh',
]);

function coerce(type, raw) {
  const t = (type || 'string').toLowerCase();
  if (t === 'number') {
    const n = Number(raw);
    return Number.isNaN(n) ? { err: 'must be a number' } : { value: n };
  }
  if (t === 'integer') {
    const n = Number(raw);
    if (!Number.isInteger(n)) return { err: 'must be an integer' };
    return { value: n };
  }
  if (t === 'boolean') {
    if (raw === true || raw === 'true') return { value: true };
    if (raw === false || raw === 'false') return { value: false };
    return { err: 'must be true or false' };
  }
  return { value: String(raw) };
}

// Returns { values, errors, warnings }. errors block the call (missing required / wrong
// type on a KNOWN param); warnings don't (unknown param forwarded as-is).
function validate(api, flags) {
  const values = {};
  const errors = [];
  const warnings = [];
  const known = new Set(api.params.map((p) => p.name));

  for (const p of api.params) {
    const raw = flags[p.name];
    const missing = raw === undefined || raw === true; // `--flag` with no value, for non-boolean
    if (missing && (p.type || 'string') !== 'boolean') {
      if (p.required) errors.push(`--${p.name} is required (${p.type || 'string'})`);
      continue;
    }
    if (raw === undefined) continue;
    const { value, err } = coerce(p.type, raw);
    if (err) errors.push(`--${p.name} ${err}`);
    else values[p.name] = value;
  }

  // Unknown flags: forward to origin (as strings) and warn, rather than fail. A typo and
  // a newly-added param look identical here, so we can't hard-error without blocking
  // legitimate new params on a stale catalog.
  for (const [name, raw] of Object.entries(flags)) {
    if (known.has(name) || RESERVED.has(name)) continue;
    if (raw === true) continue; // bare boolean-ish flag with no value — nothing to send
    values[name] = String(raw);
    warnings.push(`--${name} isn't in this CLI's known parameters; forwarding to the API anyway.`);
  }

  return { values, errors, warnings };
}

// For an unknown API id: forward every non-reserved flag verbatim, no schema to check.
function passthroughValues(flags) {
  const values = {};
  for (const [name, raw] of Object.entries(flags)) {
    if (RESERVED.has(name) || raw === true) continue;
    values[name] = String(raw);
  }
  return values;
}

module.exports = { validate, coerce, passthroughValues, RESERVED };

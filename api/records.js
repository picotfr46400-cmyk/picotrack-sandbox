const { getSupabaseConfig, json, setCors, bearer, requireAuth, readJsonBody } = require('./_server-supabase');

const ALLOWED_TABLES = new Set([
  'appointments',
  'database_rows',
  'databases',
  'environment_license_limits',
  'forms',
  'licenses',
  'mail_logs',
  'service_instances',
  'services',
  'submissions',
  'user_profiles',
  'app_roles'
]);
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const FORBIDDEN_QUERY_KEYS = new Set(['apikey', 'api_key', 'service_role', 'service_key']);
const MAX_PATH_LENGTH = 2500;

function sanitizePath(value) {
  const path = String(value || '').trim();
  if (!path || path.length > MAX_PATH_LENGTH) return '';
  if (path.includes('..') || path.startsWith('/') || /^https?:/i.test(path)) return '';
  return path;
}

function tableFromPath(path) {
  return String(path || '').split('?')[0].split('/')[0].trim();
}

function validateQuery(path) {
  const query = String(path || '').split('?')[1] || '';
  if (!query) return true;
  const params = new URLSearchParams(query);
  for (const key of params.keys()) {
    const clean = String(key || '').toLowerCase();
    if (FORBIDDEN_QUERY_KEYS.has(clean)) return false;
    if (clean.includes('rpc') || clean.includes('sql')) return false;
  }
  return true;
}

function normalizeBody(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function safePrefer(value, method) {
  const raw = String(value || '').trim();
  if (!raw) return method === 'DELETE' ? 'return=minimal' : 'return=representation';
  const allowed = ['return=representation', 'return=minimal', 'resolution=merge-duplicates,return=representation', 'resolution=merge-duplicates,return=minimal'];
  return allowed.includes(raw) ? raw : (method === 'DELETE' ? 'return=minimal' : 'return=representation');
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return json(res, 500, { error: 'Configuration Supabase serveur manquante' });

  try {
    await requireAuth(req);
    const body = await readJsonBody(req, 2_000_000);
    const path = sanitizePath(body.path || body.resource || '');
    const method = String(body.method || 'GET').toUpperCase();
    const table = tableFromPath(path);

    if (!path) return json(res, 400, { error: 'Requête invalide' });
    if (!ALLOWED_METHODS.has(method)) return json(res, 405, { error: 'Méthode refusée' });
    if (!ALLOWED_TABLES.has(table)) return json(res, 403, { error: 'Ressource non autorisée côté navigateur' });
    if (!validateQuery(path)) return json(res, 400, { error: 'Paramètres interdits' });

    const token = bearer(req);
    const upstream = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: safePrefer(body.prefer, method)
      },
      body: normalizeBody(body.body)
    });

    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(text);
  } catch (err) {
    return json(res, err.status || 500, { error: err.message || 'Erreur API records' });
  }
};

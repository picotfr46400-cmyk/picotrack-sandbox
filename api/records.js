const { getSupabaseConfig, json, setCors, bearer, requireAuth, readJsonBody } = require('./_server-supabase');

const ENTITIES = new Set([
  'appointments', 'database_rows', 'databases', 'environment_license_limits', 'forms',
  'licenses', 'mail_logs', 'service_instances', 'services', 'submissions', 'user_profiles', 'app_roles', 'tenants'
]);

const SELECT_ALLOW = /^[a-zA-Z0-9_.*,()\-\s]+$/;
const COL_ALLOW = /^[a-zA-Z0-9_]+$/;
const OP_ALLOW = new Set(['eq','neq','gt','gte','lt','lte','like','ilike','is','in','cs','cd','ov']);

function cleanEntity(value) {
  const entity = String(value || '').trim();
  return ENTITIES.has(entity) ? entity : '';
}

function cleanSelect(value) {
  const select = String(value || '*').trim();
  if (!select || select.length > 600 || !SELECT_ALLOW.test(select)) return '*';
  return select;
}

function cleanLimit(value, fallback = 1000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), 1000));
}

function cleanOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Math.trunc(n), 100000));
}

function cleanOrder(value, entity = '') {
  const order = String(value || '').trim();
  if (!order) return '';
  const parts = order.split('.');
  let col = parts[0];
  if (entity === 'app_roles' && col === 'nom') col = 'name';
  if (entity === 'app_roles' && col === 'desc') col = 'description';
  if (!COL_ALLOW.test(col)) return '';
  const dir = parts[1] === 'desc' ? 'desc' : 'asc';
  return `${col}.${dir}`;
}

function cleanFilters(filters) {
  const out = [];
  if (!Array.isArray(filters)) return out;
  for (const f of filters.slice(0, 20)) {
    const column = String(f?.column || '').trim();
    const op = String(f?.op || '').trim();
    const value = f?.value;
    if (!COL_ALLOW.test(column)) continue;
    if (!OP_ALLOW.has(op)) continue;
    if (value === undefined) continue;
    out.push({ column, op, value: String(value).slice(0, 1000) });
  }
  return out;
}

function mapColumn(entity, column) {
  if (entity === 'app_roles' && column === 'nom') return 'name';
  if (entity === 'app_roles' && column === 'desc') return 'description';

  // Table forms: le schéma Supabase historique utilise des noms français.
  // Le front peut manipuler des noms anglais selon les écrans.
  if (entity === 'forms' && column === 'name') return 'nom';
  if (entity === 'forms' && column === 'label') return 'nom';
  if (entity === 'forms' && column === 'color') return 'couleur';
  if (entity === 'forms' && column === 'active') return 'actif';
  return column;
}

function mapFilters(entity, filters) {
  return cleanFilters(filters).map(f => ({ ...f, column: mapColumn(entity, f.column) }));
}

function buildReadPath(entity, { select='*', filters=[], order='', limit=1000, offset=0 } = {}) {
  const params = new URLSearchParams();
  params.set('select', cleanSelect(select));
  for (const f of mapFilters(entity, filters)) params.append(f.column, `${f.op}.${f.value}`);
  const safeOrder = cleanOrder(order, entity);
  if (safeOrder) params.set('order', safeOrder);
  params.set('limit', String(cleanLimit(limit)));
  const off = cleanOffset(offset);
  if (off) params.set('offset', String(off));
  return `${entity}?${params.toString()}`;
}

function normalizeRecord(record, entity = '') {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  const allowedByEntity = {
    forms: new Set(['id','nom','description','couleur','actif','modules','fields','created_at','visible_roles','triggers','version','published','tenant_id','environment_code']),
    submissions: new Set(['form_id','values','device','tenant_id','environment_code']),
    app_roles: new Set(['id','tenant_id','environment_code','name','permissions','active','created_at','description','updated_at']),
    environment_license_limits: new Set(['id','environment_code','supervision_limit','pad_limit','lecture_limit','updated_at','tenant_id']),
    licenses: new Set(['id','environment_code','license_key','license_type','label','active','device_name','last_seen','created_at','email','password_hash','role','scope','roles']),
    user_profiles: new Set(['id','email','role','environment_code','active','created_at','tenant_id','label','firstname','lastname','license_key','password_hash','roles','scope','updated_at','login_user','first_name','last_name','username','license_type','resolved_permissions'])
  };
  const allow = allowedByEntity[entity] || null;
  const out = {};
  for (let [k, v] of Object.entries(record)) {
    if (!COL_ALLOW.test(k)) continue;
    k = mapColumn(entity, k);
    if (entity === 'app_roles' && (k === 'nom' || k === 'desc')) continue;
    if (allow && !allow.has(k)) continue;
    out[k] = v;
  }
  if (entity === 'submissions') {
    if (!out.device) out.device = 'desktop';
  }
  if (entity === 'forms') {
    if ((record.name || record.label) && !out.nom) out.nom = record.name || record.label;
    if (record.color && !out.couleur) out.couleur = record.color;
    if (record.active !== undefined && out.actif === undefined) out.actif = !!record.active;
    if (!out.environment_code) out.environment_code = String(record.environment_code || '').trim() || 'DEMO';
    if (out.actif === undefined) out.actif = true;
    if (!Array.isArray(out.modules)) out.modules = Array.isArray(record.modules) ? record.modules : [];
    if (!out.fields || typeof out.fields !== 'object') out.fields = Array.isArray(record.fields) ? record.fields : [];
    if (!out.visible_roles || typeof out.visible_roles !== 'object') out.visible_roles = record.visible_roles || [];
    if (!out.triggers || typeof out.triggers !== 'object') out.triggers = record.triggers || {};
    if (out.version === undefined) out.version = 1;
    if (out.published === undefined) out.published = true;
  }
  if (entity === 'app_roles') {
    if (record.nom && !out.name) out.name = record.nom;
    if (record.desc && !out.description) out.description = record.desc;
  }
  return out;
}

async function userRest(req, path, { method='GET', body, prefer='return=representation' } = {}) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) throw Object.assign(new Error('Configuration Supabase serveur manquante'), { status: 500 });
  const token = bearer(req);
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=representation'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }
  if (!r.ok) {
    const err = new Error(payload?.message || payload?.error || text || `Supabase ${r.status}`);
    err.status = r.status;
    err.payload = payload;
    throw err;
  }
  return payload || [];
}

async function handleList(req, body) {
  const entity = cleanEntity(body.entity);
  if (!entity) throw Object.assign(new Error('Ressource non autorisée'), { status: 403 });
  const path = buildReadPath(entity, body);
  return await userRest(req, path, { method: 'GET', prefer: '' });
}

async function handleSave(req, body) {
  const entity = cleanEntity(body.entity);
  if (!entity) throw Object.assign(new Error('Ressource non autorisée'), { status: 403 });
  const record = normalizeRecord(body.record || body.body, entity);
  const id = String(body.id || '').trim();
  const method = id ? 'PATCH' : 'POST';
  const path = id ? `${entity}?id=eq.${encodeURIComponent(id)}` : entity;
  return await userRest(req, path, { method, body: record, prefer: 'return=representation' });
}

async function handleDelete(req, body) {
  const entity = cleanEntity(body.entity);
  const id = String(body.id || '').trim();
  if (!entity || !id) throw Object.assign(new Error('Suppression invalide'), { status: 400 });
  return await userRest(req, `${entity}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
}

async function handleInitialLoad(req, body) {
  const env = String(body.environment_code || 'DEMO').trim().slice(0, 80);
  const envFilter = [{ column: 'environment_code', op: 'eq', value: env }];
  const [forms, services, submissions, serviceInstances, databases] = await Promise.all([
    userRest(req, buildReadPath('forms', { filters: envFilter, select: '*', order: 'created_at.asc', limit: 1000 }), { prefer: '' }),
    userRest(req, buildReadPath('services', { filters: envFilter, select: '*', order: 'created_at.asc', limit: 1000 }), { prefer: '' }),
    userRest(req, buildReadPath('submissions', { filters: envFilter, select: '*', order: 'created_at.desc', limit: 1000 }), { prefer: '' }),
    userRest(req, buildReadPath('service_instances', { filters: envFilter, select: '*', order: 'created_at.desc', limit: 1000 }), { prefer: '' }),
    userRest(req, buildReadPath('databases', { filters: envFilter, select: '*', limit: 1000 }), { prefer: '' })
  ]);
  return { forms, services, submissions, serviceInstances, databases };
}

async function handleCurrentProfile(req) {
  const user = await requireAuth(req);
  const rows = await userRest(req, buildReadPath('user_profiles', {
    filters: [{ column: 'id', op: 'eq', value: user.id }],
    select: '*',
    limit: 1
  }), { prefer: '' });
  return Array.isArray(rows) ? rows : [];
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    await requireAuth(req);
    const body = await readJsonBody(req, 2_000_000);

    if ('path' in body || 'resource' in body || 'method' in body) {
      return json(res, 400, { error: 'Proxy générique désactivé. Utiliser une action métier.' });
    }

    const action = String(body.action || '').trim();
    let result;
    switch (action) {
      case 'health':
        result = await userRest(req, buildReadPath('forms', { select: 'id', limit: 1 }), { prefer: '' });
        break;
      case 'current_profile':
        result = await handleCurrentProfile(req);
        break;
      case 'initial_load':
        result = await handleInitialLoad(req, body);
        break;
      case 'list':
        result = await handleList(req, body);
        break;
      case 'save':
        result = await handleSave(req, body);
        break;
      case 'delete':
        result = await handleDelete(req, body);
        break;
      default:
        return json(res, 400, { error: 'Action non autorisée' });
    }

    return json(res, 200, result);
  } catch (err) {
    return json(res, err.status || 500, { error: err.message || 'Erreur API records' });
  }
};

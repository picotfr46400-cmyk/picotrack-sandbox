const { getSupabaseConfig, json, decodeQ, setCors, bearer, requireAuth, readJsonBody } = require('./_server-supabase');
const ALLOWED_TABLES = new Set([
  'app_roles','appointments','database_rows','databases','environment_license_limits','forms','licenses','mail_logs','service_instances','services','submissions','user_profiles'
]);
const ALLOWED_METHODS = new Set(['GET','POST','PATCH','PUT','DELETE']);
function firstSegment(path){return String(path||'').split('?')[0].split('/')[0].trim()}
function cleanHeaders(h){const out={};const allow=['range','prefer'];for(const [k,v] of Object.entries(h||{})){if(allow.includes(String(k).toLowerCase()))out[k]=String(v)}return out}
module.exports=async function handler(req,res){
  setCors(req,res);
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
  if(req.method!=='POST') return json(res,405,{error:'Method not allowed'});
  const {url,anonKey}=getSupabaseConfig();
  if(!url||!anonKey) return json(res,500,{error:'Configuration Supabase serveur manquante'});
  try{
    await requireAuth(req);
    const body=await readJsonBody(req);
    const path=decodeQ(body.q);
    const method=String(body.method||'GET').toUpperCase();
    const table=firstSegment(path);
    if(!path||path.includes('..')||/^https?:/i.test(path)||path.startsWith('/')) return json(res,400,{error:'Requête invalide'});
    if(!ALLOWED_METHODS.has(method)) return json(res,405,{error:'Méthode refusée'});
    if(!ALLOWED_TABLES.has(table)) return json(res,403,{error:'Table non autorisée côté navigateur'});
    const token=bearer(req);
    const headers={apikey:anonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:body.prefer!==undefined?String(body.prefer):'return=representation',...cleanHeaders(body.headers)};
    const upstream=await fetch(`${url}/rest/v1/${path}`,{method,headers,body:body.body||undefined});
    const text=await upstream.text();
    res.statusCode=upstream.status;
    res.setHeader('Content-Type',upstream.headers.get('content-type')||'application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.end(text);
  }catch(e){ json(res,e.status||500,{error:e.message||'Erreur proxy sécurisé'}); }
};

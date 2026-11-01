// lib/api-auth.js — proteção comum das funções de IA (/api/scan-receipt, coach, parse-workout).
// 1) CORS restrito às origens do app (o app no GitHub Pages chama a Vercel).
// 2) Login obrigatório: valida o token do Supabase ANTES de chamar a IA, então ninguém
//    de fora consegue gastar o crédito da ANTHROPIC_API_KEY só conhecendo a URL.
// Variáveis na Vercel: SUPABASE_URL e SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_ROLE, já existente).
// Origens extras (ex.: domínio próprio): ALLOWED_ORIGINS="https://app.com,https://www.app.com".

const DEFAULT_ORIGINS = ['https://samdouglas99.github.io', 'https://body-tracker-samdouglas99.vercel.app'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function allowedOrigins() {
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return DEFAULT_ORIGINS.concat(extra);
}

// Devolve true quando já respondeu (preflight OPTIONS) e o handler deve parar.
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins().includes(origin) || LOCAL_ORIGIN.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

// Devolve o usuário do Supabase ({ id, email, ... }) ou null depois de já ter respondido o erro.
// `extra` entra no corpo do erro p/ manter o formato que cada cliente espera (ex.: { items: [] }).
async function requireUser(req, res, extra = {}, fetchImpl = fetch) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE;
  const fail = (status, error) => { res.status(status).json({ error, ...extra }); return null; };
  if (!url || !key) return fail(503, 'Validação de login não configurada no servidor (SUPABASE_URL).');
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!m) return fail(401, 'Entre na sua conta para usar a IA.');
  let r;
  try {
    r = await fetchImpl(url.replace(/\/+$/, '') + '/auth/v1/user', {
      headers: { apikey: key, authorization: 'Bearer ' + m[1] }
    });
  } catch (e) {
    return fail(503, 'Não consegui validar seu login agora. Tente de novo em instantes.');
  }
  if (r.status === 401 || r.status === 403) return fail(401, 'Sua sessão expirou. Entre de novo na sua conta.');
  if (!r.ok) return fail(503, 'Não consegui validar seu login agora. Tente de novo em instantes.');
  let user = null;
  try { user = await r.json(); } catch (e) { /* corpo inválido: tratado abaixo */ }
  if (!user || !user.id) return fail(401, 'Sua sessão expirou. Entre de novo na sua conta.');
  return user;
}

module.exports = { applyCors, requireUser, allowedOrigins };

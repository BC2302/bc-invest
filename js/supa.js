// Cliente leve do Supabase (Auth + REST), sem dependências externas.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const STORE_KEY = 'bcinvest.session';
const listeners = new Set();
let session = loadSession();
let refreshing = null;

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function loadSession() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORE_KEY);
  } catch { /* armazenamento indisponível */ }
  listeners.forEach((fn) => fn(session));
}

function normalizeSession(data) {
  if (!data || !data.access_token) return null;
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || now + (data.expires_in || 3600),
    user: data.user || null,
  };
}

export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getSession() { return session; }
export function getUser() { return session?.user || null; }

// ---------- Mensagens de erro em português ----------
const ERROS = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'],
  [/user already registered|already been registered/i, 'Já existe uma conta com este e-mail.'],
  [/password should be at least|weak.?password/i, 'A senha precisa ter pelo menos 6 caracteres.'],
  [/unable to validate email|invalid email|email address .* is invalid/i, 'E-mail inválido.'],
  [/rate limit|too many requests|security purposes/i, 'Muitas tentativas. Aguarde um pouco e tente de novo.'],
  [/same.?password|should be different/i, 'A nova senha precisa ser diferente da atual.'],
  [/jwt expired|invalid jwt|not authenticated/i, 'Sua sessão expirou. Entre novamente.'],
  [/categoria inv/i, 'Categoria inválida. Recarregue a página e tente de novo.'],
  [/failed to fetch|networkerror|load failed/i, 'Sem conexão com o servidor. Verifique sua internet.'],
];

export function mensagemErro(err) {
  const msg = String(err?.message || err || '');
  for (const [re, txt] of ERROS) if (re.test(msg)) return txt;
  return 'Algo deu errado. Tente novamente.';
}

async function parse(res) {
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.msg || data.message || data.error_description || data.error)) || res.statusText;
    const e = new Error(msg);
    e.status = res.status;
    e.code = data?.code || data?.error_code;
    throw e;
  }
  return data;
}

function baseHeaders(extra = {}) {
  return { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...extra };
}

async function refresh() {
  if (!session?.refresh_token) throw new Error('not authenticated');
  if (!refreshing) {
    refreshing = fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: baseHeaders(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
      .then(parse)
      .then((data) => { saveSession(normalizeSession(data)); return session; })
      .catch((e) => {
        if (e.status && e.status < 500) saveSession(null);
        throw e;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function token() {
  if (!session) throw new Error('not authenticated');
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at - 60 < now) await refresh();
  return session.access_token;
}

// ---------- Autenticação ----------
function redirectTo() {
  return encodeURIComponent(location.origin + location.pathname);
}

export async function signUp({ nome, email, password }) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup?redirect_to=${redirectTo()}`, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify({ email, password, data: { nome } }),
  });
  const data = await parse(res);
  const s = normalizeSession(data);
  if (s) { saveSession(s); return { session: s, confirmar: false }; }
  // Supabase devolve usuário sem identidades quando o e-mail já existe (proteção contra enumeração)
  const user = data?.user || data;
  if (user && Array.isArray(user.identities) && user.identities.length === 0) {
    throw new Error('User already registered');
  }
  return { session: null, confirmar: true };
}

export async function signIn({ email, password }) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const s = normalizeSession(await parse(res));
  saveSession(s);
  return s;
}

export async function signOut() {
  const t = session?.access_token;
  saveSession(null);
  if (t) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: baseHeaders({ Authorization: `Bearer ${t}` }) })
      .catch(() => {});
  }
}

export async function recoverPassword(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${redirectTo()}`, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify({ email }),
  });
  await parse(res);
}

export async function updatePassword(password) {
  const t = await token();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: baseHeaders({ Authorization: `Bearer ${t}` }),
    body: JSON.stringify({ password }),
  });
  const user = await parse(res);
  if (session) saveSession({ ...session, user });
}

// Lê tokens que o Supabase coloca na URL (confirmação de e-mail / redefinir senha)
export function consumeUrlSession() {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  if (!hash.includes('access_token=') && !hash.includes('error=')) return null;
  const p = new URLSearchParams(hash);
  history.replaceState(null, '', location.pathname + location.search);
  if (p.get('error')) return { error: p.get('error_description') || p.get('error') };
  const s = normalizeSession({
    access_token: p.get('access_token'),
    refresh_token: p.get('refresh_token'),
    expires_in: Number(p.get('expires_in')) || 3600,
    expires_at: Number(p.get('expires_at')) || undefined,
  });
  saveSession(s);
  return { type: p.get('type') || 'signup' };
}

export async function loadUser() {
  const t = await token();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: baseHeaders({ Authorization: `Bearer ${t}` }) });
  const user = await parse(res);
  if (session) saveSession({ ...session, user });
  return user;
}

// ---------- Banco de dados (REST) ----------
async function rest(path, { method = 'GET', body, prefer, retry = true } = {}) {
  const t = await token();
  const headers = baseHeaders({ Authorization: `Bearer ${t}` });
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && retry) {
    await refresh();
    return rest(path, { method, body, prefer, retry: false });
  }
  return parse(res);
}

export const db = {
  select: (table, query = '') => rest(`${table}?${query}`),
  insert: (table, row) => rest(table, { method: 'POST', body: row, prefer: 'return=representation' }).then((r) => r?.[0]),
  update: (table, id, patch) =>
    rest(`${table}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, prefer: 'return=representation' }).then((r) => r?.[0]),
  remove: (table, id) => rest(`${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }),
  rpc: (fn, args = {}) => rest(`rpc/${fn}`, { method: 'POST', body: args }),
};

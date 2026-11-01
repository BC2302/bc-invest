// Avisos no aparelho (Web Push): ativar, desativar e testar.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { db, getSession } from './supa.js';
import { icon, toast, busy, esc } from './ui.js';

function chaveBytes(b64u) {
  const pad = '='.repeat((4 - (b64u.length % 4)) % 4);
  const bin = atob((b64u + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalado = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export function suportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// 'ativo' | 'inativo' | 'bloqueado' | 'ios-instalar' | 'sem-suporte'
export async function estado() {
  if (!suportado()) return ehIOS() && !instalado() ? 'ios-instalar' : 'sem-suporte';
  if (Notification.permission === 'denied') return 'bloqueado';
  if (Notification.permission !== 'granted') return 'inativo';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  return sub ? 'ativo' : 'inativo';
}

const FUNCAO = `${SUPABASE_URL}/functions/v1/notificar-vencimentos`;

async function chavePublica() {
  const r = await fetch(FUNCAO, { headers: { apikey: SUPABASE_ANON_KEY } });
  if (!r.ok) throw new Error('chave');
  return (await r.json()).publicKey;
}

const mesmaChave = (sub, bytes) => {
  const atual = sub.options?.applicationServerKey && new Uint8Array(sub.options.applicationServerKey);
  return !atual || (atual.length === bytes.length && atual.every((b, i) => b === bytes[i]));
};

export async function ativar() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('permissao');
  const chave = chaveBytes(await chavePublica());
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !mesmaChave(sub, chave)) { await sub.unsubscribe(); sub = null; }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
  }
  const j = sub.toJSON();
  await db.rpc('salvar_inscricao', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent,
  });
}

// Usado ao sair da conta: este aparelho para de receber avisos desse usuário.
export async function desativar() {
  try {
    if (!suportado()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub) return;
    try { await db.rpc('remover_inscricao', { p_endpoint: sub.endpoint }); } catch { /* segue */ }
    await sub.unsubscribe();
  } catch { /* sem bloqueio */ }
}

export async function testar() {
  const res = await fetch(FUNCAO, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${getSession()?.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ teste: true }),
  });
  if (!res.ok) throw new Error('teste');
  return res.json();
}

// Cartão com o estado dos avisos e os botões, para colocar em qualquer tela.
export async function cartaoAvisos(el) {
  const st = await estado();
  const textos = {
    inativo: 'Receba um aviso no celular e no computador 3 dias antes do vencimento, 3 dias depois se ficar em aberto e no fim do mês.',
    bloqueado: 'As notificações deste site estão bloqueadas. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço) e volte aqui.',
    'ios-instalar': 'No iPhone, os avisos só funcionam com o app instalado: toque em Compartilhar › "Adicionar à Tela de Início" e abra a BC INVEST pelo ícone.',
    'sem-suporte': 'Este navegador não recebe notificações. Use o Chrome, Edge ou Firefox, ou o app instalado no celular.',
  };
  if (st === 'ativo') {
    el.innerHTML = `<div class="notice ok">${icon('bell', 18)}<span>Avisos ativados neste aparelho.</span>
      <button class="link-btn" type="button" id="av-teste">Enviar teste</button></div>`;
    el.querySelector('#av-teste').addEventListener('click', async (e) => {
      try {
        const r = await busy(e.currentTarget, testar);
        toast(r.enviados ? 'Teste enviado. Confira a notificação.' : 'Não foi possível enviar. Tente ativar de novo.');
      } catch { toast('Não foi possível enviar o teste agora.'); }
    });
    return;
  }
  el.innerHTML = `<div class="notice">${icon('bell', 18)}<div class="notice-body">
      <strong>Avisos de vencimento</strong><span>${esc(textos[st])}</span>
      ${st === 'inativo' ? '<button class="btn outline" type="button" id="av-ativar">Ativar avisos neste aparelho</button>' : ''}
    </div></div>`;
  el.querySelector('#av-ativar')?.addEventListener('click', async (e) => {
    try {
      await busy(e.currentTarget, ativar);
      toast('Avisos ativados!');
      cartaoAvisos(el);
      testar().catch(() => {});
    } catch (err) {
      toast(err.message === 'permissao' ? 'Você não permitiu as notificações.' : 'Não foi possível ativar os avisos.');
      cartaoAvisos(el);
    }
  });
}

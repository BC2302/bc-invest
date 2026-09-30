// BC INVEST — inicialização e rotas
import * as supa from './supa.js';
import { closeSheet, toast, esc } from './ui.js';
import { renderAuth, renderNovaSenha } from './views/auth.js';
import { renderInicio } from './views/inicio.js';
import { renderGastos } from './views/gastos.js';
import { renderMetas } from './views/metas.js';
import { renderSimulador } from './views/simulador.js';
import { renderConta } from './views/conta.js';

const VIEWS = {
  inicio: renderInicio,
  gastos: renderGastos,
  metas: renderMetas,
  simulador: renderSimulador,
  conta: renderConta,
};

const root = document.getElementById('app');
const state = { perfil: null, recovery: false, authMsg: null };
let seq = 0;
let wasLogged = false;

async function carregarPerfil() {
  if (state.perfil) return state.perfil;
  const user = supa.getUser();
  let nome = user?.user_metadata?.nome || '';
  try {
    const rows = await supa.db.select('perfis', 'select=nome&limit=1');
    if (rows?.[0]?.nome) nome = rows[0].nome;
  } catch { /* segue com o nome do cadastro */ }
  state.perfil = { nome };
  return state.perfil;
}

async function route() {
  const my = ++seq;
  closeSheet();
  const session = supa.getSession();

  if (session && state.recovery) {
    renderNovaSenha(root, {
      done: () => { state.recovery = false; location.hash = '#/inicio'; route(); },
    });
    return;
  }
  if (!session) {
    renderAuth(root, { mensagem: state.authMsg });
    state.authMsg = null;
    return;
  }

  const perfil = await carregarPerfil();
  if (my !== seq) return;
  const nome = location.hash.replace(/^#\/?/, '').split('?')[0] || 'inicio';
  const view = VIEWS[nome] || VIEWS.inicio;
  window.scrollTo(0, 0);
  const ctx = {
    perfil,
    user: supa.getUser(),
    alive: () => my === seq,
    setPerfil: (p) => { state.perfil = { ...state.perfil, ...p }; },
    refresh: () => route(),
  };
  try {
    await view(root, ctx);
  } catch (e) {
    if (my !== seq) return;
    if (!supa.getSession()) return; // sessão caiu; o ouvinte de autenticação já redesenha
    root.innerHTML = `<main class="screen"><div class="empty">${esc(supa.mensagemErro(e))}<br><button class="link-btn" type="button" id="retry">Tentar novamente</button></div></main>`;
    root.querySelector('#retry').addEventListener('click', route);
  }
}

function telaConfiguracao() {
  root.innerHTML = `<main class="auth">
    <div class="auth-brand"><div class="logo-mark lg">BC</div>
    <span class="brand-name metal">BC INVEST</span></div>
    <div class="empty">O app ainda não está ligado ao servidor.<br>Preencha <strong>js/config.js</strong> com os dados do Supabase.</div>
  </main>`;
}

function boot() {
  if (!supa.configured) { telaConfiguracao(); return; }

  const vinda = supa.consumeUrlSession();
  if (vinda?.error) state.authMsg = { tipo: 'erro', texto: 'O link expirou ou é inválido. Peça um novo.' };
  if (vinda?.type === 'recovery') state.recovery = true;
  if (vinda && !vinda.error && vinda.type !== 'recovery') {
    setTimeout(() => toast('E-mail confirmado. Bem-vindo à BC INVEST!'), 300);
  }

  wasLogged = Boolean(supa.getSession());
  supa.onAuthChange((s) => {
    const logged = Boolean(s);
    if (logged === wasLogged) return;
    wasLogged = logged;
    if (!logged) { state.perfil = null; state.recovery = false; }
    if (!logged && location.hash) history.replaceState(null, '', location.pathname);
    route();
  });
  window.addEventListener('hashchange', route);

  if (supa.getSession()) supa.loadUser().catch(() => {});
  route();
}

boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

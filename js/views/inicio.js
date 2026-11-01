// Tela inicial
import * as data from '../data.js';
import { esc, brl, brlParts, icon, tabbar, nomeMes, dataLonga } from '../ui.js';
import { situacao, nomeVencimento } from './contas.js';

const DICAS = [
  'Antes de investir no longo prazo, monte sua reserva de emergência: o recomendado costuma ser de 6 a 12 meses do seu custo de vida.',
  'Pague-se primeiro: separe o valor de investir assim que o salário cair, e não com o que sobrar no fim do mês.',
  'Juros compostos precisam de tempo. Começar cedo, mesmo com pouco, costuma valer mais do que começar tarde com muito.',
  'Anote todos os gastos por um mês. Só de enxergar para onde o dinheiro vai, muita gente já encontra onde economizar.',
  'Diversificar é não depender de um único investimento: combinar tipos diferentes reduz o impacto de um deles ir mal.',
  'Dívidas com juros altos, como cartão de crédito rotativo e cheque especial, costumam custar mais do que qualquer investimento rende. Quite-as primeiro.',
  'Compare investimentos pelo rendimento líquido, depois de impostos e taxas, e não só pela taxa anunciada.',
  'Revise seu orçamento todo mês: gastos pequenos e frequentes somam mais do que parecem.',
];

function dicaDoDia() {
  const d = new Date();
  const dia = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return DICAS[dia % DICAS.length];
}

const SISTEMAS = [
  { id: 'gastos', nome: 'Gastos', ic: 'wallet' },
  { id: 'contas', nome: 'Contas a pagar', ic: 'calendar' },
  { id: 'metas', nome: 'Metas', ic: 'target' },
  { id: 'simulador', nome: 'Simuladores', ic: 'calc' },
  { nome: 'Carteira', ic: 'pie' },
  { nome: 'Aprender', ic: 'book' },
];

let ocultar = false;
try { ocultar = localStorage.getItem('bcinvest.ocultar') === '1'; } catch { /* ok */ }

export async function renderInicio(root, ctx) {
  const primeiroNome = (ctx.perfil?.nome || '').split(' ')[0];
  root.innerHTML = `<main class="screen"><div class="loading">Carregando…</div></main>${tabbar('inicio')}`;

  const hoje = new Date();
  const [lancs, metas, geral, proximos] = await Promise.all([
    data.lancamentosDoMes(hoje.getFullYear(), hoje.getMonth()),
    data.metas(),
    data.resumoGeral(),
    data.proximosVencimentos().catch(() => []),
  ]);
  if (!ctx.alive()) return;

  const r = data.resumo(lancs);
  const reserva = metas.find((m) => m.is_reserva);
  const guardadoMetas = metas.reduce((s, m) => s + Number(m.valor_atual), 0);
  const [inteiro, cents] = brlParts(geral.saldo);
  const mesAtual = nomeMes(hoje.getFullYear(), hoje.getMonth()).split(' ')[0];
  const mask = (txt) => (ocultar ? '•••••' : txt);

  root.innerHTML = `<main class="screen">
    <header class="topbar">
      <div class="brand">
        <div class="logo-mark">BC</div>
        <div class="brand-text"><span class="brand-name metal">BC INVEST</span>
        <span class="brand-sub">Patrimônio &amp; Futuro</span></div>
      </div>
      <a class="icon-btn" href="#/conta" aria-label="Minha conta">${icon('user')}</a>
    </header>

    <p class="greeting">Olá${primeiroNome ? `, ${esc(primeiroNome)}` : ''}</p>

    <section class="card" aria-label="Resumo financeiro">
      <div class="section-head">
        <span class="eyebrow">Saldo total disponível</span>
        <button class="icon-btn ghost" type="button" id="olho" aria-label="${ocultar ? 'Mostrar valores' : 'Ocultar valores'}" style="margin:-12px -12px -12px 0">${icon(ocultar ? 'eyeOff' : 'eye', 18)}</button>
      </div>
      <div class="big-number${geral.saldo < 0 ? ' neg' : ''}">${ocultar ? '•••••' : `${esc(inteiro)}<span class="cents">${esc(cents)}</span>`}</div>
      <div class="divider"></div>
      <div class="month-balance">
        <span class="stat-label">Saldo do mês · ${mesAtual}</span>
        <span class="month-value${r.saldo < 0 ? ' neg' : ''}">${mask(brl(r.saldo))}</span>
      </div>
      <div class="grid-2">
        <div class="stat"><span class="stat-label">Receitas do mês</span><span class="stat-value pos">${mask(brl(r.receitas))}</span></div>
        <div class="stat"><span class="stat-label">Despesas do mês</span><span class="stat-value neg">${mask(brl(r.despesas))}</span></div>
        <div class="stat"><span class="stat-label">Guardado em metas</span><span class="stat-value">${mask(brl(guardadoMetas))}</span></div>
        <div class="stat"><span class="stat-label">Lançamentos no mês</span><span class="stat-value">${lancs.length}</span></div>
      </div>
    </section>

    ${proximos.length ? `<section class="section">
      <div class="section-head"><h2 class="h-section">Contas a vencer</h2><a class="link-btn" href="#/contas">Ver todas</a></div>
      <div class="list">${proximos.map((v) => {
        const st = situacao(v);
        return `<a class="item" href="#/contas" style="text-decoration:none">
          <span class="item-icon ${st.cls}">${icon('calendar', 18, 'currentColor', 1.6)}</span>
          <span class="item-body"><span class="item-title">${esc(nomeVencimento(v))}</span><span class="item-sub">${dataLonga(v.vencimento)}</span></span>
          <span class="item-right"><span class="item-value">${mask(brl(v.valor))}</span><span class="chip ${st.cls}">${st.txt}</span></span>
        </a>`;
      }).join('')}</div>
    </section>` : ''}

    <section class="section">
      <h2 class="h-section">Seus sistemas</h2>
      <div class="systems">
        ${SISTEMAS.map((s) => (s.id
          ? `<a class="system" href="#/${s.id}">${icon(s.ic, 26, '#C9CCD1', 1.4)}${s.nome}</a>`
          : `<div class="system soon" aria-label="${s.nome}, em breve"><span class="badge">Em breve</span>${icon(s.ic, 26, '#C9CCD1', 1.4)}${s.nome}</div>`)).join('')}
      </div>
    </section>

    ${reserva ? (() => {
      const pct = Math.min(100, Math.round((Number(reserva.valor_atual) / Number(reserva.valor_alvo)) * 100));
      return `<a class="section" href="#/metas" style="text-decoration:none">
        <div class="section-head"><h2 class="h-section">Reserva de emergência</h2><span class="small">${pct}%</span></div>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <div class="section-head small"><span>${mask(brl(reserva.valor_atual))} guardados</span><span>Meta: ${mask(brl(reserva.valor_alvo))}</span></div>
      </a>`;
    })() : `<a class="empty" href="#/metas" style="text-decoration:none">Você ainda não tem uma reserva de emergência.<br><strong>Toque aqui para criar sua meta.</strong></a>`}

    <section class="tip">
      <span class="eyebrow">Dica do dia</span>
      <p>${esc(dicaDoDia())}</p>
    </section>
  </main>${tabbar('inicio')}`;

  root.querySelector('#olho').addEventListener('click', () => {
    ocultar = !ocultar;
    try { localStorage.setItem('bcinvest.ocultar', ocultar ? '1' : '0'); } catch { /* ok */ }
    renderInicio(root, ctx);
  });
}

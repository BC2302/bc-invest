// Contas a pagar: únicas, mensais e parceladas, com avisos de vencimento
import * as data from '../data.js';
import { db, mensagemErro } from '../supa.js';
import { cartaoAvisos } from '../push.js';
import { opcoesCategoria, campoNovaCategoria, ligarNovaCategoria, resolverCategoria } from '../categoria.js';
import {
  esc, brl, icon, tabbar, topbar, nomeMes, dataLonga, hojeISO, isoDate, diasEntre,
  parseValor, valorInput, openSheet, closeSheet, toast, busy,
} from '../ui.js';

const hoje = new Date();
let ano = hoje.getFullYear();
let mes = hoje.getMonth();

const REPETICAO = { unica: 'Única', mensal: 'Mensal', parcelada: 'Parcelada' };

export function situacao(v, hojeStr = hojeISO()) {
  if (v.pago_em) return { txt: 'Paga', cls: 'pos' };
  const d = diasEntre(hojeStr, v.vencimento);
  if (d < 0) return { txt: d === -1 ? 'Atrasada 1 dia' : `Atrasada ${-d} dias`, cls: 'neg' };
  if (d === 0) return { txt: 'Vence hoje', cls: 'warn' };
  if (d <= 3) return { txt: d === 1 ? 'Vence amanhã' : `Vence em ${d} dias`, cls: 'warn' };
  return { txt: `Vence ${dataLonga(v.vencimento).slice(0, 5)}`, cls: '' };
}

export const nomeVencimento = (v) => v.descricao + (v.parcela ? ` (${v.parcela}/${v.total_parcelas})` : '');

export async function renderContas(root, ctx) {
  root.innerHTML = `<main class="screen">${topbar('Contas a pagar')}<div class="loading">Carregando…</div></main>${tabbar('contas')}`;
  try { await db.rpc('gerar_vencimentos'); } catch { /* segue com o que já existe */ }
  const [cats, contas, vencs, atrasadas] = await Promise.all([
    data.categorias(), data.contas(), data.vencimentosDoMes(ano, mes), data.vencimentosAtrasados(),
  ]);
  if (!ctx.alive()) return;

  const contaPorId = new Map(contas.map((c) => [c.id, c]));
  const catPorId = new Map(cats.map((c) => [c.id, c]));
  const abertas = vencs.filter((v) => !v.pago_em);
  const totalAberto = abertas.reduce((s, v) => s + Number(v.valor), 0);
  const totalPago = vencs.filter((v) => v.pago_em).reduce((s, v) => s + Number(v.valor), 0);
  const totalAtrasado = atrasadas.reduce((s, v) => s + Number(v.valor), 0);

  const lista = vencs.length ? `<div class="list">${vencs.map((v) => {
    const st = situacao(v);
    const conta = contaPorId.get(v.conta_id);
    const cat = catPorId.get(v.categoria_id);
    return `<button class="item" type="button" data-id="${esc(v.id)}">
      <span class="item-icon ${st.cls}">${icon(v.pago_em ? 'check' : 'calendar', 18, 'currentColor', 1.6)}</span>
      <span class="item-body"><span class="item-title">${esc(nomeVencimento(v))}</span>
      <span class="item-sub">${dataLonga(v.vencimento)} · ${REPETICAO[conta?.repeticao] || 'Conta'}${cat ? ` · ${esc(cat.nome)}` : ''}</span></span>
      <span class="item-right"><span class="item-value">${brl(v.valor)}</span><span class="chip ${st.cls}">${st.txt}</span></span>
    </button>`;
  }).join('')}</div>` : '<div class="empty">Nenhuma conta com vencimento neste mês.<br>Toque em <strong>Nova conta</strong> para cadastrar aluguel, luz, parcelas e outras.</div>';

  root.innerHTML = `<main class="screen">
    ${topbar('Contas a pagar', { right: `<button class="icon-btn" type="button" id="nova-top" aria-label="Nova conta">${icon('plus')}</button>` })}
    <div id="avisos"></div>
    <div class="month-nav">
      <button class="icon-btn ghost" type="button" id="mes-ant" aria-label="Mês anterior">${icon('back', 18)}</button>
      <span class="label" aria-live="polite">${nomeMes(ano, mes)}</span>
      <button class="icon-btn ghost" type="button" id="mes-prox" aria-label="Próximo mês">${icon('next', 18)}</button>
    </div>
    <section class="card center" aria-label="Resumo das contas">
      <div class="result-box"><span class="eyebrow">Em aberto no mês</span>
      <span class="big-number">${brl(totalAberto)}</span>
      <span class="small">${abertas.length === 1 ? '1 conta' : `${abertas.length} contas`}</span></div>
      <div class="grid-2">
        <div class="stat boxed"><span class="stat-label">Pagas no mês</span><span class="stat-value pos">${brl(totalPago)}</span></div>
        <div class="stat boxed"><span class="stat-label">Atrasadas (todas)</span><span class="stat-value${atrasadas.length ? ' neg' : ''}">${atrasadas.length ? `${atrasadas.length} · ${brl(totalAtrasado)}` : 'Nenhuma'}</span></div>
      </div>
    </section>
    <button class="btn" type="button" id="nova">${icon('plus', 18, 'currentColor', 2)} Nova conta</button>
    <section class="section"><h2 class="h-section">Vencimentos do mês</h2>${lista}</section>
  </main>${tabbar('contas')}`;

  cartaoAvisos(root.querySelector('#avisos'));
  const recarregar = () => renderContas(root, ctx);
  root.querySelector('#mes-ant').addEventListener('click', () => { if (--mes < 0) { mes = 11; ano--; } recarregar(); });
  root.querySelector('#mes-prox').addEventListener('click', () => { if (++mes > 11) { mes = 0; ano++; } recarregar(); });
  const nova = () => formNovaConta(cats, recarregar);
  root.querySelector('#nova').addEventListener('click', nova);
  root.querySelector('#nova-top').addEventListener('click', nova);
  root.querySelectorAll('.item[data-id]').forEach((b) => b.addEventListener('click', () => {
    const v = vencs.find((x) => x.id === b.dataset.id);
    painelVencimento(v, contaPorId.get(v.conta_id), cats, recarregar);
  }));
}

function dataPadrao() {
  if (ano === hoje.getFullYear() && mes === hoje.getMonth()) return hojeISO();
  return isoDate(new Date(ano, mes, 1));
}

function formNovaConta(cats, recarregar) {
  let rep = 'mensal';
  const sheet = openSheet('Nova conta', `
    <form class="form" novalidate>
      <div class="segmented three" role="group" aria-label="Tipo de conta">
        <button type="button" data-rep="unica" aria-pressed="false">Única</button>
        <button type="button" data-rep="mensal" aria-pressed="true">Mensal</button>
        <button type="button" data-rep="parcelada" aria-pressed="false">Parcelada</button>
      </div>
      <p class="fine" id="rep-ajuda"></p>
      <label class="field">Descrição
        <input name="descricao" maxlength="80" autocomplete="off" placeholder="Ex.: Aluguel, luz, cartão" required></label>
      <div class="grid-2">
        <label class="field"><span id="lbl-valor">Valor (R$)</span>
          <input class="big" name="valor" inputmode="decimal" autocomplete="off" placeholder="0,00" required></label>
        <label class="field" id="campo-parcelas" hidden>Nº de parcelas
          <input class="big" name="parcelas" inputmode="numeric" autocomplete="off" placeholder="10"></label>
      </div>
      <div class="grid-2">
        <label class="field"><span id="lbl-data">Primeiro vencimento</span>
          <input name="inicio" type="date" value="${esc(dataPadrao())}" required></label>
        <label class="field">Categoria
          <select name="categoria">${opcoesCategoria(cats, 'despesa')}</select></label>
      </div>
      ${campoNovaCategoria()}
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">Salvar conta</button>
    </form>`);

  const form = sheet.querySelector('form');
  const err = form.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  ligarNovaCategoria(form);

  const ajustar = () => {
    sheet.querySelectorAll('[data-rep]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.rep === rep)));
    form.querySelector('#campo-parcelas').hidden = rep !== 'parcelada';
    form.querySelector('#lbl-valor').textContent = rep === 'parcelada' ? 'Valor da parcela (R$)' : 'Valor (R$)';
    form.querySelector('#lbl-data').textContent = rep === 'unica' ? 'Vencimento' : rep === 'mensal' ? 'Primeiro vencimento' : 'Vencimento da 1ª parcela';
    const dia = Number((form.inicio.value || '').slice(8, 10));
    form.querySelector('#rep-ajuda').textContent = {
      unica: 'Uma conta só, com uma data de vencimento.',
      mensal: `Repete todo mês${dia ? ` no dia ${dia}` : ''}, até você parar de repetir.`,
      parcelada: `Uma parcela por mês${dia ? `, sempre no dia ${dia}` : ''}.`,
    }[rep];
  };
  sheet.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => { rep = b.dataset.rep; ajustar(); }));
  form.inicio.addEventListener('change', ajustar);
  ajustar();
  form.descricao.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const descricao = form.descricao.value.trim();
    const valor = parseValor(form.valor.value);
    const inicio = form.inicio.value;
    const parcelas = rep === 'parcelada' ? Number(form.parcelas.value) : null;
    if (!descricao) return falha('Informe uma descrição.');
    if (!(valor > 0)) return falha('Informe um valor maior que zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return falha('Informe a data de vencimento.');
    if (rep === 'parcelada' && !(Number.isInteger(parcelas) && parcelas >= 2 && parcelas <= 120)) return falha('Informe o número de parcelas (2 a 120).');
    try {
      await busy(form.querySelector('button[type=submit]'), async () => {
        const categoria = await resolverCategoria(form, cats, 'despesa');
        await db.rpc('criar_conta', {
          p_descricao: descricao, p_valor: valor, p_categoria: categoria, p_repeticao: rep, p_inicio: inicio, p_parcelas: parcelas,
        });
      });
      closeSheet(); toast('Conta cadastrada.'); recarregar();
    } catch (ex) { falha(ex.message?.startsWith('Informe') ? ex.message : mensagemErro(ex)); }
  });
}

function painelVencimento(v, conta, cats, recarregar) {
  const st = situacao(v);
  const cat = cats.find((c) => c.id === v.categoria_id);
  const sheet = openSheet(nomeVencimento(v), `
    <div class="result-box"><span class="eyebrow">${v.pago_em ? `Paga em ${dataLonga(v.pago_em)}` : `Vence em ${dataLonga(v.vencimento)}`}</span>
      <span class="big-number">${brl(v.valor)}</span>
      <span class="chip ${st.cls}">${st.txt}</span></div>
    <p class="small" style="text-align:center;margin:0">${REPETICAO[conta?.repeticao] || 'Conta'}${conta?.repeticao === 'mensal' ? ` · todo dia ${conta.dia_vencimento}${conta.ativa ? '' : ' (encerrada)'}` : ''}${cat ? ` · ${esc(cat.nome)}` : ''}</p>
    ${v.pago_em
      ? '<button class="btn outline" type="button" id="desfazer">Desfazer pagamento</button>'
      : `<button class="btn" type="button" id="pagar">${icon('check', 18, 'currentColor', 2)} Marcar como paga</button>`}
    <p class="fine">${v.pago_em ? 'O pagamento entrou como despesa em Gastos. Ao desfazer, essa despesa é apagada.' : 'Ao marcar como paga, a conta entra automaticamente como despesa em Gastos, com a data de hoje.'}</p>
    <div class="btn-row">
      <button class="btn outline" type="button" id="editar">${icon('edit', 18)} Editar</button>
      <button class="btn danger" type="button" id="excluir">Excluir conta</button>
    </div>
    ${conta?.repeticao === 'mensal' && conta.ativa ? '<button class="link-btn" type="button" id="encerrar">Parar de repetir esta conta</button>' : ''}
    <p class="form-error" role="alert" hidden></p>`);

  const err = sheet.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  const acao = (btn, fn, msg) => btn?.addEventListener('click', async () => {
    try { await busy(btn, fn); closeSheet(); toast(msg); recarregar(); } catch (ex) { falha(mensagemErro(ex)); }
  });
  acao(sheet.querySelector('#pagar'), () => db.rpc('pagar_vencimento', { p_id: v.id }), 'Conta paga. Lançada em Gastos.');
  acao(sheet.querySelector('#desfazer'), () => db.rpc('desfazer_pagamento', { p_id: v.id }), 'Pagamento desfeito.');
  sheet.querySelector('#editar').addEventListener('click', () => formEditarConta(conta, v, cats, recarregar));

  const enc = sheet.querySelector('#encerrar');
  if (enc) {
    let armado = false;
    enc.addEventListener('click', async () => {
      if (!armado) { armado = true; enc.textContent = 'Toque de novo para confirmar (os meses futuros serão removidos)'; return; }
      try { await busy(enc, () => db.rpc('encerrar_conta', { p_id: conta.id })); closeSheet(); toast('Esta conta não vai mais se repetir.'); recarregar(); } catch (ex) { falha(mensagemErro(ex)); }
    });
  }
  const del = sheet.querySelector('#excluir');
  let armado = false;
  del.addEventListener('click', async () => {
    if (!armado) {
      armado = true;
      del.textContent = conta?.repeticao === 'unica' ? 'Confirmar exclusão' : 'Excluir todos os meses/parcelas?';
      return;
    }
    try { await busy(del, () => db.remove('contas', v.conta_id)); closeSheet(); toast('Conta excluída.'); recarregar(); } catch (ex) { falha(mensagemErro(ex)); }
  });
}

function formEditarConta(conta, v, cats, recarregar) {
  const sheet = openSheet('Editar conta', `
    <form class="form" novalidate>
      <p class="fine">As mudanças valem para ${conta?.repeticao === 'unica' ? 'esta conta' : 'todos os meses/parcelas que ainda não foram pagos'}.</p>
      <label class="field">Descrição
        <input name="descricao" maxlength="80" autocomplete="off" value="${esc(conta?.descricao ?? v.descricao)}" required></label>
      <div class="grid-2">
        <label class="field">${conta?.repeticao === 'parcelada' ? 'Valor da parcela (R$)' : 'Valor (R$)'}
          <input name="valor" inputmode="decimal" autocomplete="off" value="${esc(valorInput(conta?.valor ?? v.valor))}" required></label>
        <label class="field">Categoria
          <select name="categoria">${opcoesCategoria(cats, 'despesa', conta?.categoria_id ?? v.categoria_id)}</select></label>
      </div>
      ${campoNovaCategoria()}
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">Salvar alterações</button>
    </form>`);
  const form = sheet.querySelector('form');
  const err = form.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  ligarNovaCategoria(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const descricao = form.descricao.value.trim();
    const valor = parseValor(form.valor.value);
    if (!descricao) return falha('Informe uma descrição.');
    if (!(valor > 0)) return falha('Informe um valor maior que zero.');
    try {
      await busy(form.querySelector('button[type=submit]'), async () => {
        const categoria = await resolverCategoria(form, cats, 'despesa');
        await db.rpc('editar_conta', { p_id: v.conta_id, p_descricao: descricao, p_valor: valor, p_categoria: categoria });
      });
      closeSheet(); toast('Conta atualizada.'); recarregar();
    } catch (ex) { falha(ex.message?.startsWith('Informe') ? ex.message : mensagemErro(ex)); }
  });
}

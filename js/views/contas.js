// Contas a pagar (únicas, mensais e parceladas): situação, detalhe e edição.
// A lista fica na tela de Gastos.
import { db, mensagemErro } from '../supa.js';
import { opcoesCategoria, campoNovaCategoria, ligarNovaCategoria, resolverCategoria } from '../categoria.js';
import { opcoesCartao } from '../cartao.js';
import {
  esc, brl, icon, dataLonga, hojeISO, diasEntre, parseValor, valorInput, openSheet, closeSheet, toast, busy,
} from '../ui.js';

export const REPETICAO = { unica: 'Única', mensal: 'Mensal', parcelada: 'Parcelada' };

export function situacao(v, hojeStr = hojeISO()) {
  if (v.pago_em) return { txt: 'Paga', cls: 'pos' };
  const d = diasEntre(hojeStr, v.vencimento);
  if (d < 0) return { txt: d === -1 ? 'Atrasada 1 dia' : `Atrasada ${-d} dias`, cls: 'neg' };
  if (d === 0) return { txt: 'Vence hoje', cls: 'warn' };
  if (d <= 3) return { txt: d === 1 ? 'Vence amanhã' : `Vence em ${d} dias`, cls: 'warn' };
  return { txt: `Vence ${dataLonga(v.vencimento).slice(0, 5)}`, cls: '' };
}

// Prévia: o saldo disponível dá para pagar as contas em aberto?
export function previaHTML(saldo, aberto, rotulo, mask = (t) => t) {
  const total = aberto.total;
  const sobra = saldo - total;
  const falta = sobra < 0;
  const titulo = total === 0 ? (falta ? 'Saldo negativo' : 'Saldo livre') : falta ? 'Vai faltar' : 'Vai sobrar';
  const cobre = total > 0 && falta ? Math.max(0, Math.floor((Math.max(saldo, 0) / total) * 100)) : null;
  return `<div class="previa${falta ? ' falta' : ''}" role="status" aria-label="Prévia das contas">
    <span class="eyebrow">Prévia ${esc(rotulo)}</span>
    <div class="previa-linha"><span>Saldo disponível hoje</span><span>${mask(brl(saldo))}</span></div>
    <div class="previa-linha"><span>Contas a pagar${total ? ` (${aberto.qtd})` : ''}</span><span>${total ? `− ${mask(brl(total))}` : mask(brl(0))}</span></div>
    <div class="previa-total"><span>${titulo}</span><strong class="${falta ? 'neg' : 'pos'}">${mask(brl(Math.abs(sobra)))}</strong></div>
    ${cobre != null ? `<p class="fine">Seu saldo cobre ${cobre}% dessas contas. Registre suas receitas para a prévia ficar certa.</p>` : ''}
  </div>`;
}

export const nomeVencimento = (v) => v.descricao + (v.parcela ? ` (${v.parcela}/${v.total_parcelas})` : '');

export function painelVencimento(v, conta, cats, recarregar, cartoes = []) {
  const cartao = cartoes.find((c) => c.id === conta?.cartao_id);
  const st = situacao(v);
  const cat = cats.find((c) => c.id === v.categoria_id);
  const sheet = openSheet(nomeVencimento(v), `
    <div class="result-box"><span class="eyebrow">${v.pago_em ? `Paga em ${dataLonga(v.pago_em)}` : `Vence em ${dataLonga(v.vencimento)}`}</span>
      <span class="big-number">${brl(v.valor)}</span>
      <span class="chip ${st.cls}">${st.txt}</span></div>
    <p class="small" style="text-align:center;margin:0">${REPETICAO[conta?.repeticao] || 'Conta'}${conta?.repeticao === 'mensal' ? ` · todo dia ${conta.dia_vencimento}${conta.ativa ? '' : ' (encerrada)'}` : ''}${cat ? ` · ${esc(cat.nome)}` : ''}${cartao ? ` · ${esc(cartao.nome)}` : ''}</p>
    ${v.pago_em
      ? '<button class="btn outline" type="button" id="desfazer">Desfazer pagamento</button>'
      : `<button class="btn" type="button" id="pagar">${icon('check', 18, 'currentColor', 2)} Marcar como paga</button>`}
    <p class="fine">${v.pago_em ? 'O pagamento entrou como despesa em Gastos. Ao desfazer, essa despesa é apagada.' : 'Ao marcar como paga, a conta entra automaticamente como despesa em Gastos, com a data de hoje.'}</p>
    <div class="btn-row">
      ${v.pago_em ? '' : `<button class="btn outline" type="button" id="editar">${icon('edit', 18)} Editar valor ou data</button>`}
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
  sheet.querySelector('#editar')?.addEventListener('click', () => formEditarConta(conta, v, cats, recarregar, cartoes));

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

function formEditarConta(conta, v, cats, recarregar, cartoes = []) {
  const rep = conta?.repeticao || 'unica';
  const comEscopo = rep !== 'unica';
  let escopo = 'esta';
  const sheet = openSheet(`Editar ${nomeVencimento(v)}`, `
    <form class="form" novalidate>
      ${comEscopo ? `<div class="segmented" role="group" aria-label="Aplicar a mudança em">
        <button type="button" data-escopo="esta" aria-pressed="true">Só esta</button>
        <button type="button" data-escopo="seguintes" aria-pressed="false">Desta em diante</button>
      </div>
      <p class="fine" id="escopo-ajuda"></p>` : ''}
      <div class="grid-2">
        <label class="field">${rep === 'parcelada' ? 'Valor da parcela (R$)' : 'Valor (R$)'}
          <input class="big" name="valor" inputmode="decimal" autocomplete="off" value="${esc(valorInput(v.valor))}" required></label>
        <label class="field">Vencimento
          <input name="vencimento" type="date" value="${esc(v.vencimento)}" required></label>
      </div>
      <label class="field">Descrição
        <input name="descricao" maxlength="80" autocomplete="off" value="${esc(v.descricao)}" required></label>
      <label class="field">Categoria
        <select name="categoria">${opcoesCategoria(cats, 'despesa', v.categoria_id)}</select></label>
      ${campoNovaCategoria()}
      ${cartoes.length ? `<label class="field">Cartão de crédito (vale para a conta toda)
        <select name="cartao">${opcoesCartao(cartoes, conta?.cartao_id)}</select></label>` : ''}
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">Salvar alterações</button>
    </form>`);
  const form = sheet.querySelector('form');
  const err = form.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  ligarNovaCategoria(form);

  const ajustar = () => {
    if (!comEscopo) return;
    sheet.querySelectorAll('[data-escopo]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.escopo === escopo)));
    const dia = Number((form.vencimento.value || '').slice(8, 10));
    const este = rep === 'parcelada' ? `a parcela ${v.parcela}/${v.total_parcelas}` : 'este mês';
    sheet.querySelector('#escopo-ajuda').textContent = escopo === 'esta'
      ? `Muda só ${este}. ${rep === 'parcelada' ? 'As outras parcelas continuam' : 'Os outros meses continuam'} como estão.`
      : `Muda ${este} e ${rep === 'parcelada' ? 'as próximas parcelas ainda não pagas' : 'os próximos meses ainda não pagos'}.${dia ? ` O vencimento passa a ser todo dia ${dia}.` : ''} O que já foi pago não muda.`;
  };
  sheet.querySelectorAll('[data-escopo]').forEach((b) => b.addEventListener('click', () => { escopo = b.dataset.escopo; ajustar(); }));
  form.vencimento.addEventListener('input', ajustar);
  ajustar();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const descricao = form.descricao.value.trim();
    const valor = parseValor(form.valor.value);
    const data = form.vencimento.value;
    if (!(valor > 0)) return falha('Informe um valor maior que zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return falha('Informe a data de vencimento.');
    if (!descricao) return falha('Informe uma descrição.');
    let n = 1;
    try {
      await busy(form.querySelector('button[type=submit]'), async () => {
        const categoria = await resolverCategoria(form, cats, 'despesa');
        n = await db.rpc('editar_vencimento', {
          p_id: v.id, p_descricao: descricao, p_valor: valor, p_categoria: categoria, p_vencimento: data, p_escopo: escopo,
        });
        const novoCartao = form.cartao ? (form.cartao.value || null) : undefined;
        if (novoCartao !== undefined && novoCartao !== (conta?.cartao_id || null)) await db.update('contas', v.conta_id, { cartao_id: novoCartao });
      });
      closeSheet();
      toast(escopo === 'seguintes' && n > 1
        ? `${n} ${rep === 'parcelada' ? 'parcelas atualizadas' : 'meses atualizados'}.`
        : 'Conta atualizada.');
      recarregar();
    } catch (ex) { falha(ex.message?.startsWith('Informe') ? ex.message : mensagemErro(ex)); }
  });
}

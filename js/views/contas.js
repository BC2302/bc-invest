// Contas a pagar (únicas, mensais e parceladas): situação, detalhe e edição.
// A lista fica na tela de Gastos.
import { db, mensagemErro } from '../supa.js';
import { opcoesCategoria, campoNovaCategoria, ligarNovaCategoria, resolverCategoria } from '../categoria.js';
import { opcoesCartao } from '../cartao.js';
import {
  esc, brl, icon, dataLonga, hojeISO, diasEntre, parseValor, valorInput, openSheet, closeSheet, toast, busy,
} from '../ui.js';

export const REPETICAO = { unica: 'Única', mensal: 'Mensal', parcelada: 'Parcelada' };

export const ehReceita = (v) => v?.tipo === 'receita';

export function situacao(v, hojeStr = hojeISO()) {
  const d = diasEntre(hojeStr, v.vencimento);
  if (ehReceita(v)) {
    if (v.pago_em) return { txt: 'Recebido', cls: 'pos' };
    if (d < 0) return { txt: d === -1 ? 'Previsto ontem' : `Previsto há ${-d} dias`, cls: 'warn' };
    if (d === 0) return { txt: 'Previsto hoje', cls: 'pos' };
    if (d === 1) return { txt: 'Previsto amanhã', cls: '' };
    return { txt: `Previsto ${dataLonga(v.vencimento).slice(0, 5)}`, cls: '' };
  }
  if (v.pago_em) return { txt: 'Paga', cls: 'pos' };
  if (d < 0) return { txt: d === -1 ? 'Atrasada 1 dia' : `Atrasada ${-d} dias`, cls: 'neg' };
  if (d === 0) return { txt: 'Vence hoje', cls: 'warn' };
  if (d <= 3) return { txt: d === 1 ? 'Vence amanhã' : `Vence em ${d} dias`, cls: 'warn' };
  return { txt: `Vence ${dataLonga(v.vencimento).slice(0, 5)}`, cls: '' };
}

// Prévia: o saldo disponível dá para pagar as contas em aberto?
export function previaHTML(saldo, aberto, rotulo, mask = (t) => t) {
  const total = aberto.total;
  const receber = aberto.receber || 0;
  const sobra = saldo + receber - total;
  const falta = sobra < 0;
  const titulo = total === 0 ? (falta ? 'Saldo negativo' : 'Saldo livre') : falta ? 'Vai faltar' : 'Vai sobrar';
  const cobre = total > 0 && falta ? Math.max(0, Math.floor((Math.max(saldo + receber, 0) / total) * 100)) : null;
  return `<div class="previa${falta ? ' falta' : ''}" role="status" aria-label="Prévia das contas">
    <span class="eyebrow">Prévia ${esc(rotulo)}</span>
    <div class="previa-linha"><span>Saldo disponível hoje</span><span>${mask(brl(saldo))}</span></div>
    ${receber ? `<div class="previa-linha"><span>A receber (${aberto.qtdReceber})</span><span class="pos">+ ${mask(brl(receber))}</span></div>` : ''}
    <div class="previa-linha"><span>Contas a pagar${total ? ` (${aberto.qtd})` : ''}</span><span>${total ? `− ${mask(brl(total))}` : mask(brl(0))}</span></div>
    <div class="previa-total"><span>${titulo}</span><strong class="${falta ? 'neg' : 'pos'}">${mask(brl(Math.abs(sobra)))}</strong></div>
    ${cobre != null ? `<p class="fine">Seu saldo${receber ? ' com o que vai receber' : ''} cobre ${cobre}% dessas contas.${receber ? '' : ' Cadastre seu salário em "+ Novo → Receita → Vou receber" para a prévia contar com ele.'}</p>` : ''}
  </div>`;
}

export const nomeVencimento = (v) => v.descricao + (v.parcela ? ` (${v.parcela}/${v.total_parcelas})` : '');

export function painelVencimento(v, conta, cats, recarregar, cartoes = []) {
  const cartao = cartoes.find((c) => c.id === conta?.cartao_id);
  const st = situacao(v);
  const cat = cats.find((c) => c.id === v.categoria_id);
  const rec = ehReceita(v);
  const sheet = openSheet(nomeVencimento(v), `
    <div class="result-box"><span class="eyebrow">${rec
      ? (v.pago_em ? `Recebido em ${dataLonga(v.pago_em)}` : `Previsto para ${dataLonga(v.vencimento)}`)
      : (v.pago_em ? `Paga em ${dataLonga(v.pago_em)}` : `Vence em ${dataLonga(v.vencimento)}`)}</span>
      <span class="big-number">${brl(v.valor)}</span>
      <span class="chip ${st.cls}">${st.txt}</span></div>
    <p class="small" style="text-align:center;margin:0">${rec ? 'Receita · ' : ''}${REPETICAO[conta?.repeticao] || 'Conta'}${conta?.repeticao === 'mensal' ? ` · todo dia ${conta.dia_vencimento}${conta.ativa ? '' : ' (encerrada)'}` : ''}${cat ? ` · ${esc(cat.nome)}` : ''}${cartao ? ` · ${esc(cartao.nome)}` : ''}</p>
    ${v.pago_em
      ? `<button class="btn outline" type="button" id="desfazer">${rec ? 'Desfazer recebimento' : 'Desfazer pagamento'}</button>`
      : rec ? `<button class="btn" type="button" id="receber">${icon('check', 18, 'currentColor', 2)} Recebi</button>`
        : `<button class="btn" type="button" id="pagar">${icon('check', 18, 'currentColor', 2)} Marcar como paga</button>`}
    <p class="fine">${rec
      ? (v.pago_em ? 'O valor entrou como receita em Gastos. Ao desfazer, essa receita é apagada.' : 'Quando o dinheiro cair, toque em "Recebi". Se vier um valor diferente, você ajusta na hora.')
      : (v.pago_em ? 'O pagamento entrou como despesa em Gastos. Ao desfazer, essa despesa é apagada.' : 'Ao marcar como paga, a conta entra automaticamente como despesa em Gastos, com a data de hoje.')}</p>
    <div class="btn-row">
      ${v.pago_em ? '' : `<button class="btn outline" type="button" id="editar">${icon('edit', 18)} Editar valor ou data</button>`}
      <button class="btn danger" type="button" id="excluir">${rec ? 'Excluir receita' : 'Excluir conta'}</button>
    </div>
    ${conta?.repeticao === 'mensal' && conta.ativa ? `<button class="link-btn" type="button" id="encerrar">${rec ? 'Parar de repetir esta receita' : 'Parar de repetir esta conta'}</button>` : ''}
    <p class="form-error" role="alert" hidden></p>`);

  const err = sheet.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  const acao = (btn, fn, msg) => btn?.addEventListener('click', async () => {
    try { await busy(btn, fn); closeSheet(); toast(msg); recarregar(); } catch (ex) { falha(mensagemErro(ex)); }
  });
  acao(sheet.querySelector('#pagar'), () => db.rpc('pagar_vencimento', { p_id: v.id }), 'Conta paga. Lançada em Gastos.');
  acao(sheet.querySelector('#desfazer'), () => db.rpc('desfazer_pagamento', { p_id: v.id }), rec ? 'Recebimento desfeito.' : 'Pagamento desfeito.');
  sheet.querySelector('#receber')?.addEventListener('click', () => formReceber(v, recarregar));
  sheet.querySelector('#editar')?.addEventListener('click', () => formEditarConta(conta, v, cats, recarregar, cartoes));

  const enc = sheet.querySelector('#encerrar');
  if (enc) {
    let armado = false;
    enc.addEventListener('click', async () => {
      if (!armado) { armado = true; enc.textContent = 'Toque de novo para confirmar (os meses futuros serão removidos)'; return; }
      try { await busy(enc, () => db.rpc('encerrar_conta', { p_id: conta.id })); closeSheet(); toast(rec ? 'Esta receita não vai mais se repetir.' : 'Esta conta não vai mais se repetir.'); recarregar(); } catch (ex) { falha(mensagemErro(ex)); }
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
        <label class="field">${ehReceita(v) ? 'Data prevista' : 'Vencimento'}
          <input name="vencimento" type="date" value="${esc(v.vencimento)}" required></label>
      </div>
      <label class="field">Descrição
        <input name="descricao" maxlength="80" autocomplete="off" value="${esc(v.descricao)}" required></label>
      <label class="field">Categoria
        <select name="categoria">${opcoesCategoria(cats, ehReceita(v) ? 'receita' : 'despesa', v.categoria_id)}</select></label>
      ${campoNovaCategoria()}
      ${cartoes.length && !ehReceita(v) ? `<label class="field">Cartão de crédito (vale para a conta toda)
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
        const categoria = await resolverCategoria(form, cats, ehReceita(v) ? 'receita' : 'despesa');
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

// Receber uma receita prevista (ex.: salário), ajustando o valor se veio diferente
export function formReceber(v, recarregar) {
  const sheet = openSheet(`Recebi: ${nomeVencimento(v)}`, `
    <form class="form" novalidate>
      <div class="grid-2">
        <label class="field">Valor recebido (R$)
          <input class="big" name="valor" inputmode="decimal" autocomplete="off" value="${esc(valorInput(v.valor))}" required></label>
        <label class="field">Data
          <input name="data" type="date" value="${esc(hojeISO())}" required></label>
      </div>
      <p class="fine">Previsto: ${brl(v.valor)}. Se caiu um valor diferente, é só mudar. Entra como receita em Gastos.</p>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">${icon('check', 18, 'currentColor', 2)} Confirmar recebimento</button>
    </form>`);
  const form = sheet.querySelector('form');
  const err = form.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const valor = parseValor(form.valor.value);
    const data = form.data.value;
    if (!(valor > 0)) return falha('Informe um valor maior que zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return falha('Informe a data.');
    try {
      await busy(form.querySelector('button[type=submit]'), () => db.rpc('pagar_vencimento', { p_id: v.id, p_data: data, p_valor: valor }));
      closeSheet(); toast('Recebimento registrado.'); recarregar();
    } catch (ex) { falha(mensagemErro(ex)); }
  });
}

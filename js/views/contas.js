// Contas a pagar (únicas, mensais e parceladas): situação, detalhe e edição.
// A lista fica na tela de Gastos.
import { db, mensagemErro } from '../supa.js';
import { opcoesCategoria, campoNovaCategoria, ligarNovaCategoria, resolverCategoria } from '../categoria.js';
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

export const nomeVencimento = (v) => v.descricao + (v.parcela ? ` (${v.parcela}/${v.total_parcelas})` : '');

export function painelVencimento(v, conta, cats, recarregar) {
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

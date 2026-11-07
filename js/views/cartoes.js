// Cartões de crédito: limite, quanto está usado e quanto sobra
import * as data from '../data.js';
import { db, mensagemErro } from '../supa.js';
import { calcularUso, vencimentoDaFatura } from '../cartao.js';
import {
  esc, brl, icon, tabbar, topbar, dataLonga, hojeISO, parseValor, valorInput, openSheet, closeSheet, toast, busy, secao,
} from '../ui.js';

export async function renderCartoes(root, ctx) {
  root.innerHTML = `<main class="screen">${topbar('Cartões')}<div class="loading">Carregando…</div></main>${tabbar('inicio')}`;
  const dados = await data.dadosCartoes();
  if (!ctx.alive()) return;
  const uso = calcularUso(dados);
  const recarregar = () => renderCartoes(root, ctx);

  const medidor = (usado, limite) => {
    const pct = limite > 0 ? (usado / limite) * 100 : 0;
    const cls = pct > 100 ? ' over' : pct >= 80 ? ' alerta' : '';
    return `<div class="bar limite${cls}" role="meter" aria-valuemin="0" aria-valuemax="${limite}" aria-valuenow="${usado}"
      aria-label="Limite usado: ${Math.round(pct)}%"><span style="width:${Math.min(100, Math.max(0, pct)).toFixed(1)}%"></span></div>`;
  };

  const cartaoHTML = (u) => {
    const c = u.cartao;
    const acima = u.disponivel < 0;
    return `<button class="goal cartao-item" type="button" data-cartao="${esc(c.id)}">
      <div class="goal-top"><span class="goal-name">${icon('card', 18)} ${esc(c.nome)}</span>
        <span class="small">Fecha dia ${c.dia_fechamento} · Vence dia ${c.dia_vencimento}</span></div>
      ${medidor(u.usado, Number(c.limite))}
      <div class="cartao-linha">
        <span>Usado <b>${brl(u.usado)}</b></span>
        <span>${acima ? 'Acima do limite' : 'Disponível'} <b class="${acima ? 'neg' : 'pos'}">${brl(Math.abs(u.disponivel))}</b></span>
      </div>
      <span class="small">Limite ${brl(c.limite)}</span>
    </button>`;
  };

  root.innerHTML = `<main class="screen">
    ${topbar('Cartões', { right: `<button class="icon-btn" type="button" id="novo-top" aria-label="Novo cartão">${icon('plus')}</button>` })}
    ${uso.lista.length ? `<section class="card" aria-label="Resumo dos cartões">
      <span class="eyebrow">Limite disponível</span>
      <span class="big-number${uso.disponivel < 0 ? ' neg' : ''}">${brl(uso.disponivel)}</span>
      ${medidor(uso.usado, uso.limite)}
      <div class="grid-3">
        <div class="stat boxed"><span class="stat-label">Limite total</span><span class="stat-value">${brl(uso.limite)}</span></div>
        <div class="stat boxed"><span class="stat-label">Usado</span><span class="stat-value neg">${brl(uso.usado)}</span></div>
        <div class="stat boxed"><span class="stat-label">Disponível</span><span class="stat-value ${uso.disponivel < 0 ? 'neg' : 'pos'}">${brl(uso.disponivel)}</span></div>
      </div>
    </section>
    ${secao('cartoes-lista', 'Seus cartões', `<div class="lista-cartoes">${uso.lista.map(cartaoHTML).join('')}</div>
      <p class="fine">Ao lançar uma despesa em Gastos, escolha o cartão. Compras ocupam o limite até o vencimento da fatura; contas parceladas, até cada parcela ser marcada como paga.</p>`)}` : `<section class="card center">
      <span class="eyebrow">Nenhum cartão</span>
      <p class="small" style="margin:0">Cadastre seus cartões de crédito para acompanhar quanto do limite já foi usado e quanto ainda sobra.</p>
    </section>`}
    <button class="btn" type="button" id="novo">${icon('plus', 18, 'currentColor', 2)} Cadastrar cartão</button>
  </main>${tabbar('inicio')}`;

  root.querySelector('#novo').addEventListener('click', () => formCartao(null, recarregar));
  root.querySelector('#novo-top').addEventListener('click', () => formCartao(null, recarregar));
  root.querySelectorAll('[data-cartao]').forEach((b) => b.addEventListener('click', () => {
    painelCartao(uso.lista.find((u) => u.cartao.id === b.dataset.cartao), recarregar);
  }));
}

function painelCartao(u, recarregar) {
  const c = u.cartao;
  const prox = vencimentoDaFatura(hojeISO(), c.dia_fechamento, c.dia_vencimento);
  const sheet = openSheet(c.nome, `
    <div class="grid-3">
      <div class="stat boxed"><span class="stat-label">Limite</span><span class="stat-value">${brl(c.limite)}</span></div>
      <div class="stat boxed"><span class="stat-label">Usado</span><span class="stat-value neg">${brl(u.usado)}</span></div>
      <div class="stat boxed"><span class="stat-label">Disponível</span><span class="stat-value ${u.disponivel < 0 ? 'neg' : 'pos'}">${brl(u.disponivel)}</span></div>
    </div>
    <p class="small" style="margin:0">Fecha dia ${c.dia_fechamento} · Vence dia ${c.dia_vencimento}. Compras feitas hoje vencem em ${dataLonga(prox)}.</p>
    <h3 class="h-sub">Ocupando o limite</h3>
    ${u.itens.length ? `<div class="list">${u.itens.map((i) => `<div class="item">
      <span class="item-body"><span class="item-title">${esc(i.descricao)}</span><span class="item-sub">${esc(i.info)}</span></span>
      <span class="item-value">${brl(i.valor)}</span></div>`).join('')}</div>` : '<div class="empty">Nada ocupando o limite agora.</div>'}
    <div class="btn-row">
      <button class="btn outline" type="button" id="editar">${icon('edit', 18)} Editar</button>
      <button class="btn danger" type="button" id="excluir">Excluir</button>
    </div>
    <p class="form-error" role="alert" hidden></p>`);
  sheet.querySelector('#editar').addEventListener('click', () => formCartao(c, recarregar));
  const del = sheet.querySelector('#excluir');
  let armado = false;
  del.addEventListener('click', async () => {
    if (!armado) { armado = true; del.textContent = 'Confirmar exclusão'; return; }
    try {
      await busy(del, () => db.remove('cartoes', c.id));
      closeSheet(); toast('Cartão excluído. As compras continuam em Gastos.'); recarregar();
    } catch (ex) {
      const err = sheet.querySelector('.form-error'); err.textContent = mensagemErro(ex); err.hidden = false;
    }
  });
}

function formCartao(c, recarregar) {
  const sheet = openSheet(c ? 'Editar cartão' : 'Novo cartão', `
    <form class="form" novalidate>
      <label class="field">Nome do cartão
        <input name="nome" maxlength="40" autocomplete="off" placeholder="Ex.: Nubank, Itaú Visa" value="${esc(c?.nome || '')}" required></label>
      <label class="field">Limite (R$)
        <input class="big" name="limite" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(valorInput(c?.limite))}" required></label>
      <div class="grid-2">
        <label class="field">Dia do fechamento
          <input name="fech" inputmode="numeric" autocomplete="off" placeholder="Ex.: 3" value="${esc(c?.dia_fechamento ?? '')}" required></label>
        <label class="field">Dia do vencimento
          <input name="venc" inputmode="numeric" autocomplete="off" placeholder="Ex.: 10" value="${esc(c?.dia_vencimento ?? '')}" required></label>
      </div>
      <p class="fine">O fechamento é o dia em que a fatura fecha (está na fatura ou no app do banco). Compras desse dia em diante vão para a fatura seguinte.</p>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">${c ? 'Salvar alterações' : 'Cadastrar cartão'}</button>
    </form>`);
  const form = sheet.querySelector('form');
  const err = form.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  form.nome.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = form.nome.value.trim();
    const limite = parseValor(form.limite.value);
    const fech = Number(form.fech.value);
    const venc = Number(form.venc.value);
    if (!nome) return falha('Informe o nome do cartão.');
    if (!(limite > 0)) return falha('Informe um limite maior que zero.');
    if (limite > 999999999999) return falha('Limite muito alto.');
    if (!(Number.isInteger(fech) && fech >= 1 && fech <= 31)) return falha('Dia do fechamento: de 1 a 31.');
    if (!(Number.isInteger(venc) && venc >= 1 && venc <= 31)) return falha('Dia do vencimento: de 1 a 31.');
    const row = { nome, limite, dia_fechamento: fech, dia_vencimento: venc };
    try {
      await busy(form.querySelector('button[type=submit]'), () => (c ? db.update('cartoes', c.id, row) : db.insert('cartoes', row)));
      closeSheet(); toast(c ? 'Cartão atualizado.' : 'Cartão cadastrado.'); recarregar();
    } catch (ex) { falha(mensagemErro(ex)); }
  });
}

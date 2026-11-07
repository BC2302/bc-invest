// Categorias: criar, renomear, definir limite mensal (despesas) e excluir
import * as data from '../data.js';
import { db, mensagemErro } from '../supa.js';
import {
  esc, brl, icon, tabbar, topbar, parseValor, valorInput, openSheet, closeSheet, toast, busy,
} from '../ui.js';

let aba = 'despesa';

export async function renderCategorias(root, ctx) {
  const voltar = (location.hash.split('?')[1] || '').includes('de=conta') ? '#/conta' : '#/gastos';
  root.innerHTML = `<main class="screen">${topbar('Categorias', { back: voltar })}<div class="loading">Carregando…</div></main>${tabbar('gastos')}`;
  const cats = await data.categorias();
  if (!ctx.alive()) return;
  const recarregar = () => renderCategorias(root, ctx);
  const lista = cats.filter((c) => c.tipo === aba).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const desp = aba === 'despesa';

  root.innerHTML = `<main class="screen">
    ${topbar('Categorias', { back: voltar, right: `<button class="icon-btn" type="button" id="nova-top" aria-label="Nova categoria">${icon('plus')}</button>` })}
    <div class="segmented" role="tablist" aria-label="Tipo de categoria">
      <button type="button" role="tab" data-aba="despesa" aria-selected="${desp}">Despesas</button>
      <button type="button" role="tab" data-aba="receita" aria-selected="${!desp}">Receitas</button>
    </div>
    <p class="fine">${desp
      ? 'Toque numa categoria para mudar o nome, definir quanto quer gastar no máximo por mês ou excluir.'
      : 'Toque numa categoria para mudar o nome ou excluir.'}</p>
    ${lista.length ? `<div class="list">${lista.map((c) => `<button class="item" type="button" data-cat="${esc(c.id)}">
      <span class="item-body"><span class="item-title">${esc(c.nome)}</span>
      ${desp ? `<span class="item-sub">${c.orcamento != null ? `Limite ${brl(c.orcamento)} por mês` : 'Sem limite'}</span>` : ''}</span>
      <span class="item-value">${icon('edit', 16)}</span>
    </button>`).join('')}</div>` : `<div class="empty">Nenhuma categoria de ${desp ? 'despesa' : 'receita'}.</div>`}
    <button class="btn" type="button" id="nova">${icon('plus', 18, 'currentColor', 2)} Nova categoria</button>
  </main>${tabbar('gastos')}`;

  root.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; recarregar(); }));
  const nova = () => formCategoria(null, aba, cats, recarregar);
  root.querySelector('#nova').addEventListener('click', nova);
  root.querySelector('#nova-top').addEventListener('click', nova);
  root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    formCategoria(cats.find((c) => c.id === b.dataset.cat), aba, cats, recarregar);
  }));
}

function formCategoria(cat, tipo, cats, recarregar) {
  const desp = tipo === 'despesa';
  const sheet = openSheet(cat ? 'Editar categoria' : `Nova categoria de ${desp ? 'despesa' : 'receita'}`, `
    <form class="form" novalidate>
      <label class="field">Nome
        <input name="nome" maxlength="40" autocomplete="off" placeholder="${desp ? 'Ex.: Farmácia, Pets, Academia' : 'Ex.: Freelance, Aluguel recebido'}" value="${esc(cat?.nome || '')}" required></label>
      ${desp ? `<label class="field">Limite por mês (R$)
        <input name="limite" inputmode="decimal" autocomplete="off" placeholder="Sem limite" value="${esc(valorInput(cat?.orcamento))}"></label>
      <p class="fine">Deixe em branco para não ter limite. O limite aparece em "Orçamento por categoria", na tela Gastos.</p>` : ''}
      ${cat ? '<p class="fine">Mudar o nome vale também para os lançamentos que já usam esta categoria.</p>' : ''}
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">${cat ? 'Salvar alterações' : 'Adicionar categoria'}</button>
      ${cat ? '<button class="btn danger" type="button" id="excluir">Excluir categoria</button>' : ''}
    </form>`);
  const form = sheet.querySelector('form');
  const err = form.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  form.nome.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = form.nome.value.trim();
    if (!nome) return falha('Informe o nome da categoria.');
    if (cats.some((c) => c.tipo === tipo && c.id !== cat?.id && c.nome.toLowerCase() === nome.toLowerCase())) {
      return falha('Já existe uma categoria com esse nome.');
    }
    const row = { nome };
    if (desp) {
      const txt = form.limite.value.trim();
      const limite = txt === '' ? null : parseValor(txt);
      if (txt !== '' && !(limite >= 0)) return falha('Limite inválido.');
      if (limite != null && limite > 999999999999) return falha('Limite muito alto.');
      row.orcamento = limite;
    }
    try {
      await busy(form.querySelector('button[type=submit]'), () => (cat ? db.update('categorias', cat.id, row) : db.insert('categorias', { ...row, tipo })));
      closeSheet(); toast(cat ? 'Categoria atualizada.' : 'Categoria adicionada.'); recarregar();
    } catch (ex) { falha(/duplicate|23505/i.test(`${ex.message} ${ex.code}`) ? 'Já existe uma categoria com esse nome.' : mensagemErro(ex)); }
  });

  const del = sheet.querySelector('#excluir');
  if (del) {
    let armado = false;
    del.addEventListener('click', async () => {
      if (!armado) { armado = true; del.textContent = 'Confirmar exclusão (os lançamentos ficam sem categoria)'; return; }
      try {
        await busy(del, () => db.remove('categorias', cat.id));
        closeSheet(); toast('Categoria excluída.'); recarregar();
      } catch (ex) { falha(mensagemErro(ex)); }
    });
  }
}

// Gestão de gastos: resumo do mês, orçamento por categoria e lançamentos
import * as data from '../data.js';
import { db, mensagemErro } from '../supa.js';
import {
  esc, brl, brlParts, icon, tabbar, topbar, nomeMes, dataCurta, hojeISO, isoDate,
  parseValor, valorInput, openSheet, closeSheet, toast, busy,
} from '../ui.js';

const hoje = new Date();
let ano = hoje.getFullYear();
let mes = hoje.getMonth();

export async function renderGastos(root, ctx) {
  root.innerHTML = `<main class="screen">${topbar('Gestão de gastos')}<div class="loading">Carregando…</div></main>${tabbar('gastos')}`;
  const [cats, lancs] = await Promise.all([data.categorias(), data.lancamentosDoMes(ano, mes)]);
  if (!ctx.alive()) return;

  const catPorId = new Map(cats.map((c) => [c.id, c]));
  const r = data.resumo(lancs);
  const [inteiro, cents] = brlParts(r.saldo);

  // Gasto por categoria de despesa
  const gasto = new Map();
  for (const l of lancs) {
    if (l.tipo !== 'despesa') continue;
    const k = l.categoria_id && catPorId.has(l.categoria_id) ? l.categoria_id : '_sem';
    gasto.set(k, (gasto.get(k) || 0) + Number(l.valor));
  }
  const linhas = cats
    .filter((c) => c.tipo === 'despesa' && (c.orcamento != null || gasto.has(c.id)))
    .map((c) => ({ nome: c.nome, gasto: gasto.get(c.id) || 0, limite: c.orcamento != null ? Number(c.orcamento) : null }));
  if (gasto.has('_sem')) linhas.push({ nome: 'Sem categoria', gasto: gasto.get('_sem'), limite: null });
  linhas.sort((a, b) => b.gasto - a.gasto);

  const orcamentoHTML = linhas.length ? linhas.map((l) => {
    if (l.limite == null) {
      return `<div class="budget"><div class="budget-row"><span class="name">${esc(l.nome)}</span><span class="val">${brl(l.gasto)} · sem limite</span></div></div>`;
    }
    const acima = l.gasto > l.limite;
    const pct = l.limite > 0 ? Math.min(100, Math.round((l.gasto / l.limite) * 100)) : 100;
    return `<div class="budget">
      <div class="budget-row"><span class="name">${esc(l.nome)}</span>
      <span class="val${acima ? ' neg' : ''}">${brl(l.gasto)} / ${brl(l.limite)}${acima ? ` · ${brl(l.gasto - l.limite)} acima` : ''}</span></div>
      <div class="bar thin${acima ? ' over' : ''}"><span style="width:${pct}%"></span></div>
    </div>`;
  }).join('') : '<div class="empty">Defina limites mensais para suas categorias e acompanhe aqui quanto já gastou.</div>';

  const listaHTML = lancs.length ? `<div class="list">${lancs.map((l) => {
    const cat = catPorId.get(l.categoria_id);
    const rec = l.tipo === 'receita';
    return `<button class="item" type="button" data-id="${esc(l.id)}">
      <span class="item-icon ${rec ? 'pos' : 'neg'}">${icon(rec ? 'up' : 'down', 18, 'currentColor', 1.6)}</span>
      <span class="item-body"><span class="item-title">${esc(l.descricao)}</span>
      <span class="item-sub">${dataCurta(l.data)} · ${esc(cat?.nome || (rec ? 'Receita' : 'Sem categoria'))}</span></span>
      <span class="item-value${rec ? ' pos' : ''}">${rec ? '+' : '−'} ${brl(l.valor)}</span>
    </button>`;
  }).join('')}</div>` : '<div class="empty">Nenhum lançamento neste mês.<br>Toque em <strong>Novo lançamento</strong> para registrar uma receita ou despesa.</div>';

  root.innerHTML = `<main class="screen">
    ${topbar('Gestão de gastos')}
    <div class="month-nav">
      <button class="icon-btn ghost" type="button" id="mes-ant" aria-label="Mês anterior">${icon('back', 18)}</button>
      <span class="label" aria-live="polite">${nomeMes(ano, mes)}</span>
      <button class="icon-btn ghost" type="button" id="mes-prox" aria-label="Próximo mês">${icon('next', 18)}</button>
    </div>

    <section class="card center" aria-label="Saldo do mês">
      <div class="result-box"><span class="eyebrow">Saldo do mês</span>
      <span class="big-number${r.saldo < 0 ? ' neg' : ''}">${esc(inteiro)}<span class="cents">${esc(cents)}</span></span></div>
      <div class="grid-2">
        <div class="stat boxed"><span class="stat-label">Receitas</span><span class="stat-value pos">${brl(r.receitas)}</span></div>
        <div class="stat boxed"><span class="stat-label">Despesas</span><span class="stat-value neg">${brl(r.despesas)}</span></div>
      </div>
    </section>

    <button class="btn" type="button" id="novo">${icon('plus', 18, 'currentColor', 2)} Novo lançamento</button>

    <section class="section">
      <div class="section-head"><h2 class="h-section">Orçamento por categoria</h2>
      <button class="link-btn" type="button" id="editar-cats">Editar</button></div>
      ${orcamentoHTML}
    </section>

    <section class="section">
      <h2 class="h-section">Lançamentos</h2>
      ${listaHTML}
    </section>
  </main>${tabbar('gastos')}`;

  const recarregar = () => renderGastos(root, ctx);
  root.querySelector('#mes-ant').addEventListener('click', () => { if (--mes < 0) { mes = 11; ano--; } recarregar(); });
  root.querySelector('#mes-prox').addEventListener('click', () => { if (++mes > 11) { mes = 0; ano++; } recarregar(); });
  root.querySelector('#novo').addEventListener('click', () => formLancamento(null, cats, recarregar));
  root.querySelector('#editar-cats').addEventListener('click', () => formCategorias(cats, recarregar));
  root.querySelectorAll('.item[data-id]').forEach((b) => b.addEventListener('click', () => {
    formLancamento(lancs.find((l) => l.id === b.dataset.id), cats, recarregar);
  }));
}

function dataPadrao() {
  if (ano === hoje.getFullYear() && mes === hoje.getMonth()) return hojeISO();
  return isoDate(new Date(ano, mes, 1));
}

function formLancamento(lanc, cats, recarregar) {
  let tipo = lanc?.tipo || 'despesa';
  const opcoes = (t) => `<option value="">Sem categoria</option>${cats.filter((c) => c.tipo === t)
    .map((c) => `<option value="${esc(c.id)}"${lanc?.categoria_id === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}`;

  const sheet = openSheet(lanc ? 'Editar lançamento' : 'Novo lançamento', `
    <form class="form" novalidate>
      <div class="segmented" role="group" aria-label="Tipo">
        <button type="button" data-tipo="despesa" aria-pressed="${tipo === 'despesa'}">Despesa</button>
        <button type="button" data-tipo="receita" aria-pressed="${tipo === 'receita'}">Receita</button>
      </div>
      <label class="field">Valor (R$)
        <input class="big" name="valor" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(valorInput(lanc?.valor))}" required></label>
      <label class="field">Descrição
        <input name="descricao" maxlength="80" autocomplete="off" placeholder="Ex.: Supermercado" value="${esc(lanc?.descricao || '')}" required></label>
      <div class="grid-2">
        <label class="field">Categoria
          <select name="categoria">${opcoes(tipo)}</select></label>
        <label class="field">Data
          <input name="data" type="date" value="${esc(lanc?.data || dataPadrao())}" required></label>
      </div>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">${lanc ? 'Salvar alterações' : 'Adicionar'}</button>
      ${lanc ? '<button class="btn danger" type="button" id="excluir">Excluir lançamento</button>' : ''}
    </form>`);

  const form = sheet.querySelector('form');
  const err = form.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  form.valor.focus();

  sheet.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => {
    tipo = b.dataset.tipo;
    sheet.querySelectorAll('[data-tipo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    form.categoria.innerHTML = opcoes(tipo);
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const valor = parseValor(form.valor.value);
    const descricao = form.descricao.value.trim();
    const dataISO = form.data.value;
    if (!(valor > 0)) return falha('Informe um valor maior que zero.');
    if (valor > 999999999999) return falha('Valor muito alto.');
    if (!descricao) return falha('Informe uma descrição.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return falha('Informe a data.');
    const row = { tipo, valor, descricao, data: dataISO, categoria_id: form.categoria.value || null };
    try {
      await busy(form.querySelector('button[type=submit]'), () => (lanc ? db.update('lancamentos', lanc.id, row) : db.insert('lancamentos', row)));
      closeSheet();
      toast(lanc ? 'Lançamento atualizado.' : 'Lançamento adicionado.');
      recarregar();
    } catch (ex) { falha(mensagemErro(ex)); }
  });

  const del = sheet.querySelector('#excluir');
  if (del) {
    let armado = false;
    del.addEventListener('click', async () => {
      if (!armado) { armado = true; del.textContent = 'Toque de novo para confirmar'; return; }
      try {
        await busy(del, () => db.remove('lancamentos', lanc.id));
        closeSheet(); toast('Lançamento excluído.'); recarregar();
      } catch (ex) { falha(mensagemErro(ex)); }
    });
  }
}

function formCategorias(cats, recarregar) {
  const despesas = cats.filter((c) => c.tipo === 'despesa');
  const receitas = cats.filter((c) => c.tipo === 'receita');
  const sheet = openSheet('Categorias e limites', `
    <p class="fine">Defina quanto você quer gastar, no máximo, por mês em cada categoria. Deixe em branco para não ter limite.</p>
    <form class="form" id="f-limites" novalidate>
      ${despesas.map((c) => `<div style="display:flex;gap:10px;align-items:flex-end">
        <label class="field" style="flex:1">${esc(c.nome)}
          <input data-cat="${esc(c.id)}" inputmode="decimal" placeholder="Sem limite" value="${esc(valorInput(c.orcamento))}"></label>
        <button class="icon-btn ghost" type="button" data-del="${esc(c.id)}" aria-label="Remover categoria ${esc(c.nome)}">${icon('close', 18)}</button>
      </div>`).join('')}
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">Salvar limites</button>
    </form>
    <div class="divider"></div>
    <div class="section">
      <h3 class="h-section">Categorias de receita</h3>
      <div class="list">${receitas.map((c) => `<div class="item" style="cursor:default">
        <span class="item-body"><span class="item-title">${esc(c.nome)}</span></span>
        <button class="icon-btn ghost" type="button" data-del="${esc(c.id)}" aria-label="Remover categoria ${esc(c.nome)}">${icon('close', 18)}</button></div>`).join('')
        || '<p class="fine">Nenhuma.</p>'}</div>
    </div>
    <div class="divider"></div>
    <form class="form" id="f-nova" novalidate>
      <h3 class="h-section">Nova categoria</h3>
      <div class="grid-2">
        <label class="field">Nome<input name="nome" maxlength="40" autocomplete="off"></label>
        <label class="field">Tipo<select name="tipo"><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label>
      </div>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn outline" type="submit">Adicionar categoria</button>
    </form>`);

  const fl = sheet.querySelector('#f-limites');
  const errL = fl.querySelector('.form-error');
  fl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const updates = [];
    for (const inp of fl.querySelectorAll('input[data-cat]')) {
      const c = despesas.find((x) => x.id === inp.dataset.cat);
      const txt = inp.value.trim();
      const novo = txt === '' ? null : parseValor(txt);
      if (txt !== '' && !(novo >= 0)) { errL.textContent = `Valor inválido em ${c.nome}.`; errL.hidden = false; inp.focus(); return; }
      const atual = c.orcamento == null ? null : Number(c.orcamento);
      if (novo !== atual) updates.push(db.update('categorias', c.id, { orcamento: novo }));
    }
    try {
      await busy(fl.querySelector('button[type=submit]'), () => Promise.all(updates));
      closeSheet(); toast('Limites salvos.'); recarregar();
    } catch (ex) { errL.textContent = mensagemErro(ex); errL.hidden = false; }
  });

  sheet.querySelectorAll('[data-del]').forEach((b) => {
    let armado = false;
    b.addEventListener('click', async () => {
      if (!armado) { armado = true; b.style.color = 'var(--neg)'; b.setAttribute('aria-label', 'Toque de novo para remover'); toast('Toque de novo no X para remover. Os lançamentos ficam sem categoria.'); return; }
      try {
        await db.remove('categorias', b.dataset.del);
        recarregar();
        const idx = cats.findIndex((c) => c.id === b.dataset.del);
        if (idx >= 0) cats.splice(idx, 1);
        formCategorias(cats, recarregar);
        toast('Categoria removida.');
      } catch (ex) { toast(mensagemErro(ex)); }
    });
  });

  const fn = sheet.querySelector('#f-nova');
  const errN = fn.querySelector('.form-error');
  fn.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = fn.nome.value.trim();
    if (!nome) { errN.textContent = 'Informe o nome da categoria.'; errN.hidden = false; return; }
    if (cats.some((c) => c.tipo === fn.tipo.value && c.nome.toLowerCase() === nome.toLowerCase())) {
      errN.textContent = 'Já existe uma categoria com esse nome.'; errN.hidden = false; return;
    }
    try {
      const nova = await busy(fn.querySelector('button'), () => db.insert('categorias', { nome, tipo: fn.tipo.value }));
      cats.push(nova);
      cats.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      recarregar();
      formCategorias(cats, recarregar);
      toast('Categoria adicionada.');
    } catch (ex) { errN.textContent = mensagemErro(ex); errN.hidden = false; }
  });
}

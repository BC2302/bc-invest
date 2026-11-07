// Relatório: escolhe o ano → escolhe o mês (ou todos) → gráficos
import * as data from '../data.js';
import { esc, brl, tabbar, topbar, secao } from '../ui.js';
import { somaPorCategoria, barrasCategoria, colunasMeses, ligarColunas, MESES_NOMES } from '../graficos.js';

function params() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const ano = Number(q.get('ano')) || null;
  const m = q.get('mes');
  const mes = m === 'todos' ? 'todos' : m != null && /^\d{1,2}$/.test(m) && Number(m) >= 0 && Number(m) <= 11 ? Number(m) : null;
  return { ano, mes };
}

const link = (ano, mes) => `#/relatorio${ano ? `?ano=${ano}${mes != null ? `&mes=${mes}` : ''}` : ''}`;

const totais = (lancs) => lancs.reduce((t, l) => {
  t[l.tipo === 'receita' ? 'receitas' : 'despesas'] += Number(l.valor);
  return t;
}, { receitas: 0, despesas: 0 });

function kpis({ receitas, despesas }) {
  const saldo = receitas - despesas;
  return `<div class="grid-3">
    <div class="stat boxed"><span class="stat-label">Receitas</span><span class="stat-value pos">${brl(receitas)}</span></div>
    <div class="stat boxed"><span class="stat-label">Despesas</span><span class="stat-value neg">${brl(despesas)}</span></div>
    <div class="stat boxed"><span class="stat-label">Saldo</span><span class="stat-value ${saldo < 0 ? 'neg' : 'pos'}">${brl(saldo)}</span></div>
  </div>`;
}

export async function renderRelatorio(root, ctx) {
  const { ano, mes } = params();
  const hoje = new Date();

  // 1) Escolher o ano
  if (!ano) {
    root.innerHTML = `<main class="screen">${topbar('Relatório', { back: '#/gastos' })}<div class="loading">Carregando…</div></main>${tabbar('gastos')}`;
    const primeiro = await data.primeiroAno().catch(() => null);
    if (!ctx.alive()) return;
    const atual = hoje.getFullYear();
    const anos = [];
    for (let a = atual; a >= Math.min(primeiro || atual, atual); a--) anos.push(a);
    root.innerHTML = `<main class="screen">
      ${topbar('Relatório', { back: '#/gastos' })}
      <p class="small" style="margin:0">Escolha o ano do relatório.</p>
      <div class="opcoes-grid">${anos.map((a) => `<a class="opcao" href="${link(a)}">${a}</a>`).join('')}</div>
    </main>${tabbar('gastos')}`;
    return;
  }

  // 2) Escolher o mês ou "Todos"
  if (mes == null) {
    root.innerHTML = `<main class="screen">
      ${topbar(`Relatório ${ano}`, { back: link() })}
      <p class="small" style="margin:0">Escolha um mês ou veja o ano todo.</p>
      <div class="opcoes-grid">${MESES_NOMES.map((n, i) => `<a class="opcao" href="${link(ano, i)}">${n.slice(0, 3)}</a>`).join('')}</div>
      <a class="btn" href="${link(ano, 'todos')}">Todos os meses</a>
    </main>${tabbar('gastos')}`;
    return;
  }

  const titulo = mes === 'todos' ? `${ano} · Todos` : `${MESES_NOMES[mes]} ${ano}`;
  root.innerHTML = `<main class="screen">${topbar(titulo, { back: link(ano) })}<div class="loading">Carregando…</div></main>${tabbar('gastos')}`;
  const [cats, doAno] = await Promise.all([data.categorias(), data.lancamentosDoAno(ano)]);
  if (!ctx.alive()) return;
  const mesDe = (l) => Number(l.data.slice(5, 7)) - 1;

  // 3a) Um mês
  if (mes !== 'todos') {
    const lancs = doAno.filter((l) => mesDe(l) === mes);
    const t = totais(lancs);
    root.innerHTML = `<main class="screen">
      ${topbar(titulo, { back: link(ano) })}
      <section class="card" aria-label="Resumo de ${esc(titulo)}">${kpis(t)}
        <p class="small" style="margin:0">${lancs.length} ${lancs.length === 1 ? 'lançamento' : 'lançamentos'}</p></section>
      ${secao('rel-mes-desp', 'Despesas por categoria', barrasCategoria(somaPorCategoria(lancs, 'despesa', cats), { tipo: 'despesa', vazio: 'Nenhuma despesa neste mês.' }))}
      ${secao('rel-mes-rec', 'Receitas por categoria', barrasCategoria(somaPorCategoria(lancs, 'receita', cats), { tipo: 'receita', vazio: 'Nenhuma receita neste mês.' }))}
      <div class="btn-row">
        ${mes > 0 ? `<a class="btn outline" href="${link(ano, mes - 1)}">‹ ${MESES_NOMES[mes - 1].slice(0, 3)}</a>` : ''}
        ${mes < 11 ? `<a class="btn outline" href="${link(ano, mes + 1)}">${MESES_NOMES[mes + 1].slice(0, 3)} ›</a>` : ''}
      </div>
    </main>${tabbar('gastos')}`;
    return;
  }

  // 3b) Todos: o ano unificado + cada mês
  const porMes = MESES_NOMES.map((_, i) => {
    const lancs = doAno.filter((l) => mesDe(l) === i);
    return { mes: i, lancs, ...totais(lancs) };
  });
  const ultimoMes = ano === hoje.getFullYear() ? hoje.getMonth() : ano > hoje.getFullYear() ? -1 : 11;
  const ateHoje = porMes.filter((m) => m.mes <= ultimoMes || m.lancs.length);
  const t = totais(doAno);
  const comDados = porMes.filter((m) => m.lancs.length);
  const semDados = ateHoje.filter((m) => !m.lancs.length).map((m) => MESES_NOMES[m.mes].slice(0, 3));

  const cartaoMes = (m) => {
    const saldo = m.receitas - m.despesas;
    return `<section class="card mes-card" aria-label="${MESES_NOMES[m.mes]}">
      <div class="section-head"><h3 class="h-sub">${MESES_NOMES[m.mes]}</h3>
        <a class="link-btn" href="${link(ano, m.mes)}">Abrir</a></div>
      <div class="mes-linha"><span>Receitas <b class="pos">${brl(m.receitas)}</b></span><span>Despesas <b class="neg">${brl(m.despesas)}</b></span><span>Saldo <b class="${saldo < 0 ? 'neg' : 'pos'}">${brl(saldo)}</b></span></div>
      ${barrasCategoria(somaPorCategoria(m.lancs, 'despesa', cats), { tipo: 'despesa', vazio: 'Nenhuma despesa.' })}
    </section>`;
  };

  root.innerHTML = `<main class="screen">
    ${topbar(titulo, { back: link(ano) })}
    <section class="card" aria-label="Resumo do ano">
      <span class="eyebrow">Ano todo · unificado</span>${kpis(t)}
      ${ateHoje.length ? colunasMeses(ateHoje) : ''}
    </section>
    ${secao('rel-ano-desp', 'Despesas por categoria no ano', barrasCategoria(somaPorCategoria(doAno, 'despesa', cats), { tipo: 'despesa', vazio: 'Nenhuma despesa neste ano.' }))}
    ${secao('rel-ano-rec', 'Receitas por categoria no ano', barrasCategoria(somaPorCategoria(doAno, 'receita', cats), { tipo: 'receita', vazio: 'Nenhuma receita neste ano.' }))}
    ${secao('rel-ano-meses', 'Mês a mês', `${comDados.length ? comDados.map(cartaoMes).join('') : '<div class="empty">Nenhum lançamento neste ano.</div>'}
      ${semDados.length && comDados.length ? `<p class="small" style="margin:0">Sem lançamentos: ${semDados.join(', ')}.</p>` : ''}`)}
  </main>${tabbar('gastos')}`;
  if (ateHoje.length) ligarColunas(root, ateHoje);
}

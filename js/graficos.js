// Gráficos simples em HTML/CSS/SVG (sem bibliotecas), com escolha do tipo de gráfico.
// Cores validadas para o fundo escuro: receitas = azul, despesas = laranja;
// gráficos com várias categorias usam 8 cores fixas (validadas para daltonismo) + cinza para "Outras".
import { esc, brl } from './ui.js';

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const CORES = ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181', '#008300', '#9085E9', '#E66767'];
const COR_OUTRAS = '#6E727A';

const TIPOS_CAT = [['barras', 'Barras'], ['pizza', 'Pizza'], ['colunas', 'Colunas'], ['empilhada', 'Empilhada']];
const TIPOS_MESES = [['colunas', 'Colunas'], ['linhas', 'Linhas']];

function pref(chave, validos, padrao) {
  try { const v = localStorage.getItem(`bcinvest.graf.${chave}`); return validos.some(([k]) => k === v) ? v : padrao; } catch { return padrao; }
}
function salvarPref(chave, v) { try { localStorage.setItem(`bcinvest.graf.${chave}`, v); } catch { /* ok */ } }

const seletor = (tipos, atual) => `<div class="graf-tipos" role="group" aria-label="Tipo de gráfico">${tipos
  .map(([k, n]) => `<button type="button" data-graf-tipo="${k}" aria-pressed="${k === atual}">${n}</button>`).join('')}</div>`;

// Soma por categoria: [{ nome, valor }] do maior para o menor
export function somaPorCategoria(lancs, tipo, cats) {
  const porId = new Map(cats.map((c) => [c.id, c.nome]));
  const soma = new Map();
  for (const l of lancs) {
    if (l.tipo !== tipo) continue;
    const nome = porId.get(l.categoria_id) || (tipo === 'receita' ? 'Outras receitas' : 'Sem categoria');
    soma.set(nome, (soma.get(nome) || 0) + Number(l.valor));
  }
  return [...soma].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
}

// ---------- Gráfico por categoria (com escolha de tipo) ----------
export function barrasCategoria(itens, { tipo = 'despesa', vazio = 'Nada registrado.' } = {}) {
  if (!itens.length) return `<div class="empty">${esc(vazio)}</div>`;
  const atual = pref('cat', TIPOS_CAT, 'barras');
  const serie = tipo === 'receita' ? 'rec' : 'desp';
  return `<div class="graf" data-graf="cat" data-serie="${serie}" data-dados="${esc(JSON.stringify(itens))}">
    ${seletor(TIPOS_CAT, atual)}
    <div class="graf-corpo">${desenharCat(atual, itens, serie)}</div>
  </div>`;
}

function desenharCat(tipo, itens, serie) {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  const pct = (v) => (total > 0 ? Math.round((v / total) * 100) : 0);
  if (tipo === 'pizza' || tipo === 'empilhada') {
    // até 8 cores; o resto vira "Outras"
    let lista = itens;
    if (itens.length > CORES.length) {
      const resto = itens.slice(CORES.length - 1);
      lista = [...itens.slice(0, CORES.length - 1), { nome: `Outras (${resto.length})`, valor: resto.reduce((s, i) => s + i.valor, 0), outras: true }];
    }
    const cor = (i, k) => (i.outras ? COR_OUTRAS : CORES[k]);
    const legenda = `<div class="graf-legenda" role="list">${lista.map((i, k) => `<div class="graf-leg" role="listitem">
      <i class="sw" style="background:${cor(i, k)}"></i><span class="graf-leg-nome">${esc(i.nome)}</span>
      <span class="graf-leg-val">${brl(i.valor)} <span class="hbar-pct">${pct(i.valor)}%</span></span></div>`).join('')}</div>`;
    if (tipo === 'empilhada') {
      return `<div class="stack" role="img" aria-label="Divisão por categoria">${lista.map((i, k) => `<span style="flex:${Math.max(i.valor, total * 0.004)};background:${cor(i, k)}" title="${esc(i.nome)}: ${brl(i.valor)} (${pct(i.valor)}%)"></span>`).join('')}</div>${legenda}`;
    }
    // rosca em SVG
    const r = 46; const circ = 2 * Math.PI * r; const gap = lista.length > 1 ? 1.6 : 0;
    let acum = 0;
    const fatias = lista.map((i, k) => {
      const len = total > 0 ? (i.valor / total) * circ : 0;
      const s = `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${cor(i, k)}" stroke-width="18"
        stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-acum).toFixed(2)}"><title>${esc(i.nome)}: ${brl(i.valor)} (${pct(i.valor)}%)</title></circle>`;
      acum += len; return s;
    }).join('');
    return `<div class="pizza"><svg viewBox="0 0 120 120" role="img" aria-label="Pizza por categoria" class="pizza-svg">
      <g transform="rotate(-90 60 60)">${fatias}</g>
      <text x="60" y="57" text-anchor="middle" class="pizza-rot">Total</text>
      <text x="60" y="72" text-anchor="middle" class="pizza-tot">${esc(rotuloCurto(total))}</text></svg>${legenda}</div>`;
  }
  const maior = Math.max(...itens.map((i) => i.valor));
  if (tipo === 'colunas') {
    return `<div class="vcols ${serie}" role="list">${itens.map((i) => `<div class="vcol" role="listitem" aria-label="${esc(i.nome)}: ${brl(i.valor)}, ${pct(i.valor)}%" title="${esc(i.nome)}: ${brl(i.valor)}">
      <span class="vcol-val">${esc(rotuloCurto(i.valor))}</span>
      <span class="vcol-area"><span class="vcol-bar" style="height:${maior > 0 ? Math.max(2, (i.valor / maior) * 100).toFixed(1) : 0}%"></span></span>
      <span class="vcol-nome">${esc(i.nome)}</span><span class="vcol-pct">${pct(i.valor)}%</span></div>`).join('')}</div>`;
  }
  return `<div class="hbars ${serie}" role="list">${itens.map((i) => {
    const w = maior > 0 ? Math.max(1.5, (i.valor / maior) * 100) : 0;
    return `<div class="hbar" role="listitem" aria-label="${esc(i.nome)}: ${brl(i.valor)}, ${pct(i.valor)}%">
      <div class="hbar-top"><span class="hbar-nome">${esc(i.nome)}</span><span class="hbar-val">${brl(i.valor)} <span class="hbar-pct">${pct(i.valor)}%</span></span></div>
      <div class="hbar-track"><span style="width:${w.toFixed(1)}%"></span></div>
    </div>`;
  }).join('')}</div>`;
}

// ---------- Mês a mês: receitas x despesas (colunas ou linhas) ----------
export function colunasMeses(meses) {
  const atual = pref('meses', TIPOS_MESES, 'colunas');
  const dados = meses.map((m) => ({ mes: m.mes, receitas: m.receitas, despesas: m.despesas }));
  return `<div class="graf cols-chart" data-graf="meses" data-dados="${esc(JSON.stringify(dados))}">
    ${seletor(TIPOS_MESES, atual)}
    <div class="legenda"><span><i class="sw rec"></i>Receitas</span><span><i class="sw desp"></i>Despesas</span></div>
    <div class="graf-corpo">${desenharMeses(atual, dados)}</div>
    <p class="cols-info small" aria-live="polite">Toque num mês para ver os valores.</p>
  </div>`;
}

function desenharMeses(tipo, meses) {
  const maior = Math.max(1, ...meses.flatMap((m) => [m.receitas, m.despesas]));
  const escala = escalaBonita(maior);
  const h = (v) => (v > 0 ? Math.max(tipo === 'linhas' ? 0 : 2, (v / escala) * 100) : 0);
  const grade = [1, 0.5].map((f) => `<div class="cols-grid" style="bottom:${f * 100}%"><span>${rotuloCurto(escala * f)}</span></div>`).join('');
  const n = meses.length;
  let linhas = '';
  if (tipo === 'linhas') {
    const pts = (k) => meses.map((m, i) => `${(((i + 0.5) / n) * 100).toFixed(2)},${(100 - h(m[k])).toFixed(2)}`).join(' ');
    linhas = `<svg class="linhas-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${pts('receitas')}" class="ln rec"/><polyline points="${pts('despesas')}" class="ln desp"/></svg>`;
  }
  return `<div class="cols-area${tipo === 'linhas' ? ' linhas' : ''}">${grade}${linhas}
    ${meses.map((m, i) => `<button type="button" class="cols-mes" data-mes-i="${i}"
        aria-label="${MESES_NOMES[m.mes]}: receitas ${brl(m.receitas)}, despesas ${brl(m.despesas)}">
      ${tipo === 'linhas'
        ? `<span class="pt rec" style="bottom:${h(m.receitas).toFixed(1)}%"></span><span class="pt desp" style="bottom:${h(m.despesas).toFixed(1)}%"></span>`
        : `<span class="cols-par"><span class="col rec" style="height:${h(m.receitas).toFixed(1)}%"></span><span class="col desp" style="height:${h(m.despesas).toFixed(1)}%"></span></span>`}
      <span class="cols-rot">${MESES_CURTOS[m.mes]}</span>
    </button>`).join('')}
  </div>`;
}

// Mantido por compatibilidade: a interação agora é ligada uma vez só, para a página toda.
export function ligarColunas() {}

if (typeof document !== 'undefined') {
  const lerDados = (g) => { try { return JSON.parse(g.dataset.dados); } catch { return []; } };
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-graf-tipo]');
    if (!b) return;
    const g = b.closest('.graf');
    const tipo = b.dataset.grafTipo;
    const qual = g.dataset.graf;
    salvarPref(qual, tipo);
    // a escolha vale para todos os gráficos do mesmo tipo na tela
    document.querySelectorAll(`.graf[data-graf="${qual}"]`).forEach((x) => {
      x.querySelectorAll('[data-graf-tipo]').forEach((y) => y.setAttribute('aria-pressed', String(y.dataset.grafTipo === tipo)));
      const corpo = x.querySelector('.graf-corpo');
      corpo.innerHTML = qual === 'cat' ? desenharCat(tipo, lerDados(x), x.dataset.serie) : desenharMeses(tipo, lerDados(x));
    });
  });
  const mostrarMes = (e) => {
    const b = e.target.closest?.('[data-mes-i]');
    if (!b) return;
    const g = b.closest('.graf');
    const i = Number(b.dataset.mesI);
    const m = lerDados(g)[i];
    if (!m) return;
    g.querySelectorAll('[data-mes-i]').forEach((x) => x.classList.toggle('ativo', x === b));
    const saldo = m.receitas - m.despesas;
    g.querySelector('.cols-info').innerHTML = `<strong>${MESES_NOMES[m.mes]}</strong> · Receitas ${brl(m.receitas)} · Despesas ${brl(m.despesas)} · Saldo <span class="${saldo < 0 ? 'neg' : 'pos'}">${brl(saldo)}</span>`;
  };
  document.addEventListener('click', mostrarMes);
  document.addEventListener('mouseover', mostrarMes);
  document.addEventListener('focusin', mostrarMes);
}

function escalaBonita(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function rotuloCurto(v) {
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (v >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

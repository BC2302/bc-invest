// Gráficos simples em HTML/CSS (sem bibliotecas).
// Cores validadas para o fundo escuro: receitas = azul, despesas = laranja.
import { esc, brl } from './ui.js';

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

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

// Barras horizontais em ordem (maior primeiro). Passa de `max` itens → junta o resto em "Outras".
export function barrasCategoria(itens, { tipo = 'despesa', max = 7, vazio = 'Nada registrado.' } = {}) {
  if (!itens.length) return `<div class="empty">${esc(vazio)}</div>`;
  let lista = itens;
  if (itens.length > max) {
    const resto = itens.slice(max - 1).reduce((s, i) => s + i.valor, 0);
    lista = [...itens.slice(0, max - 1), { nome: `Outras (${itens.length - max + 1})`, valor: resto }];
  }
  const total = itens.reduce((s, i) => s + i.valor, 0);
  const maior = Math.max(...lista.map((i) => i.valor));
  return `<div class="hbars ${tipo === 'receita' ? 'rec' : 'desp'}" role="list">${lista.map((i) => {
    const pct = total > 0 ? Math.round((i.valor / total) * 100) : 0;
    const w = maior > 0 ? Math.max(1.5, (i.valor / maior) * 100) : 0;
    return `<div class="hbar" role="listitem" aria-label="${esc(i.nome)}: ${brl(i.valor)}, ${pct}%">
      <div class="hbar-top"><span class="hbar-nome">${esc(i.nome)}</span><span class="hbar-val">${brl(i.valor)} <span class="hbar-pct">${pct}%</span></span></div>
      <div class="hbar-track"><span style="width:${w.toFixed(1)}%"></span></div>
    </div>`;
  }).join('')}</div>`;
}

// Colunas mês a mês (receitas x despesas). Toque/passe o mouse num mês para ver os valores.
export function colunasMeses(meses, id = 'colunas') {
  const maior = Math.max(1, ...meses.flatMap((m) => [m.receitas, m.despesas]));
  const escala = escalaBonita(maior);
  const h = (v) => (v > 0 ? Math.max(2, (v / escala) * 100) : 0).toFixed(1);
  const linhas = [1, 0.5].map((f) => `<div class="cols-grid" style="bottom:${f * 100}%"><span>${rotuloCurto(escala * f)}</span></div>`).join('');
  return `<div class="cols-chart" id="${id}">
    <div class="legenda"><span><i class="sw rec"></i>Receitas</span><span><i class="sw desp"></i>Despesas</span></div>
    <div class="cols-area">${linhas}
      ${meses.map((m, i) => `<button type="button" class="cols-mes" data-i="${i}"
          aria-label="${MESES_NOMES[m.mes]}: receitas ${brl(m.receitas)}, despesas ${brl(m.despesas)}">
        <span class="cols-par"><span class="col rec" style="height:${h(m.receitas)}%"></span><span class="col desp" style="height:${h(m.despesas)}%"></span></span>
        <span class="cols-rot">${MESES_CURTOS[m.mes]}</span>
      </button>`).join('')}
    </div>
    <p class="cols-info small" aria-live="polite">Toque num mês para ver os valores.</p>
  </div>`;
}

export function ligarColunas(root, meses, id = 'colunas') {
  const el = root.querySelector(`#${id}`);
  if (!el) return;
  const info = el.querySelector('.cols-info');
  const mostrar = (i) => {
    const m = meses[i];
    el.querySelectorAll('.cols-mes').forEach((b) => b.classList.toggle('ativo', Number(b.dataset.i) === i));
    const saldo = m.receitas - m.despesas;
    info.innerHTML = `<strong>${MESES_NOMES[m.mes]}</strong> · Receitas ${brl(m.receitas)} · Despesas ${brl(m.despesas)} · Saldo <span class="${saldo < 0 ? 'neg' : 'pos'}">${brl(saldo)}</span>`;
  };
  el.querySelectorAll('.cols-mes').forEach((b) => {
    const i = Number(b.dataset.i);
    b.addEventListener('click', () => mostrar(i));
    b.addEventListener('mouseenter', () => mostrar(i));
    b.addEventListener('focus', () => mostrar(i));
  });
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

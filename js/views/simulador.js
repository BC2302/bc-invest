// Simuladores: juros compostos e "quanto investir por mês"
import { brl0, esc, tabbar, topbar, parseValor } from '../ui.js';

const estado = {
  aba: 'juros',
  juros: { inicial: '1.000', aporte: '500', taxa: '10', anos: '20' },
  meta: { alvo: '100.000', inicial: '0', taxa: '10', anos: '10' },
};

const num = (s) => { const n = parseValor(s); return Number.isFinite(n) && n >= 0 ? n : 0; };
const taxaMensal = (aa) => Math.pow(1 + aa / 100, 1 / 12) - 1;
function fv(P, A, i, m) {
  if (i === 0) return P + A * m;
  const g = Math.pow(1 + i, m);
  return P * g + (A * (g - 1)) / i;
}

function campo(nome, label, valor, extra = '') {
  return `<label class="field">${label}<input name="${nome}" inputmode="decimal" autocomplete="off" value="${esc(valor)}" ${extra}></label>`;
}

export function renderSimulador(root) {
  const aba = estado.aba;
  const v = estado[aba];
  root.innerHTML = `<main class="screen">
    ${topbar('Simuladores')}
    <div class="segmented" role="tablist" aria-label="Simulador">
      <button type="button" role="tab" data-aba="juros" aria-selected="${aba === 'juros'}">Juros compostos</button>
      <button type="button" role="tab" data-aba="meta" aria-selected="${aba === 'meta'}">Quanto investir</button>
    </div>
    <form class="grid-2" id="sim" novalidate>
      ${aba === 'juros'
        ? campo('inicial', 'Valor inicial (R$)', v.inicial) + campo('aporte', 'Aporte mensal (R$)', v.aporte)
        : campo('alvo', 'Quero juntar (R$)', v.alvo) + campo('inicial', 'Já tenho (R$)', v.inicial)}
      ${campo('taxa', 'Rentabilidade (% ao ano)', v.taxa)}
      ${campo('anos', 'Prazo (anos)', v.anos, 'inputmode="numeric"')}
    </form>
    <section class="card" id="resultado" aria-live="polite"></section>
    <p class="fine">Simulação ilustrativa, sem impostos e taxas, com rentabilidade constante. Rentabilidade passada ou estimada não é garantia de resultado futuro.</p>
  </main>${tabbar('simulador')}`;

  root.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => {
    estado.aba = b.dataset.aba; renderSimulador(root);
  }));
  const form = root.querySelector('#sim');
  form.addEventListener('input', (e) => { v[e.target.name] = e.target.value; calcular(root); });
  form.addEventListener('submit', (e) => e.preventDefault());
  calcular(root);
}

function calcular(root) {
  const box = root.querySelector('#resultado');
  const aba = estado.aba;
  const v = estado[aba];
  const anos = Math.min(Math.max(Math.round(num(v.anos)), 1), 60);
  const i = taxaMensal(Math.min(num(v.taxa), 100));
  const P = num(v.inicial);
  const n = anos * 12;
  const anosTxt = anos === 1 ? '1 ano' : `${anos} anos`;

  let A; let final; let titulo; let destaque;
  if (aba === 'juros') {
    A = num(v.aporte);
    final = fv(P, A, i, n);
    titulo = `Em ${anosTxt} você terá`;
    destaque = brl0(final);
  } else {
    const alvo = num(v.alvo);
    const falta = alvo - P * (i === 0 ? 1 : Math.pow(1 + i, n));
    A = falta <= 0 ? 0 : (i === 0 ? falta / n : (falta * i) / (Math.pow(1 + i, n) - 1));
    final = fv(P, A, i, n);
    titulo = `Para juntar ${brl0(alvo)} em ${anosTxt}, invista por mês`;
    destaque = brl0(A);
  }
  const investido = P + A * n;
  const juros = Math.max(final - investido, 0);

  const max = final > 0 ? final : 1;
  const cols = [];
  for (let y = 1; y <= anos; y++) {
    const tot = fv(P, A, i, 12 * y);
    const inv = P + A * 12 * y;
    const hi = (inv / max) * 140;
    const hj = Math.max((tot / max) * 140 - hi, 0);
    cols.push(`<div class="col"><div class="j" style="height:${hj.toFixed(1)}px"></div><div class="i" style="height:${hi.toFixed(1)}px"></div></div>`);
  }

  box.innerHTML = `
    <div class="result-box" style="text-align:center"><span class="eyebrow">${esc(titulo)}</span>
    <span class="big-number">${destaque}</span></div>
    <div class="grid-2">
      <div class="stat boxed"><span class="stat-label"><span class="legend-dot" style="background:#6F747D"></span>Você investe</span><span class="stat-value">${brl0(investido)}</span></div>
      <div class="stat boxed"><span class="stat-label"><span class="legend-dot" style="background:#EDEEF0"></span>Juros ganhos</span><span class="stat-value pos">${brl0(juros)}</span></div>
    </div>
    ${aba === 'meta' ? `<div class="small" style="text-align:center">Valor final: ${brl0(final)}</div>` : ''}
    <div class="chart" role="img" aria-label="Evolução ano a ano: ${brl0(investido)} investidos e ${brl0(juros)} de juros ao final">${cols.join('')}</div>
    <div class="section-head small" style="margin-top:-6px"><span>Ano 1</span><span>Ano ${anos}</span></div>`;
}

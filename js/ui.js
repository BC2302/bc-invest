// Utilidades de interface: formatação, ícones, avisos e painéis.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const brl = (v) => fmtBRL.format(Number(v) || 0);
export const brl0 = (v) => fmtBRL0.format(Number(v) || 0);

// "R$ 1.234,56" dividido para destacar os centavos
export function brlParts(v) {
  const s = brl(v);
  const i = s.lastIndexOf(',');
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i)];
}

// Aceita "1.234,56", "1234,56", "1234.56" e "1.500"
export function parseValor(str) {
  let s = String(str ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export function valorInput(n) {
  if (n === null || n === undefined || n === '') return '';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- Datas (sempre no fuso local) ----------
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hojeISO = () => isoDate(new Date());
export function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const nomeMes = (y, m) => `${MESES[m]} ${y}`;
export function dataCurta(s) { const d = parseISO(s); return `${pad(d.getDate())} ${MESES_CURTOS[d.getMonth()]}`; }
export function dataLonga(s) { const d = parseISO(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; }
export function limitesMes(y, m) {
  return { inicio: isoDate(new Date(y, m, 1)), fim: isoDate(new Date(y, m + 1, 0)) };
}
export function addDias(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); }
export function diasEntre(deISO, ateISO) { return Math.round((parseISO(ateISO) - parseISO(deISO)) / 86400000); }
export function mesesAte(prazoISO) {
  const hoje = new Date();
  const p = parseISO(prazoISO);
  return (p.getFullYear() - hoje.getFullYear()) * 12 + (p.getMonth() - hoje.getMonth());
}

// ---------- Ícones (traço) ----------
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  chart: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V6M17 16v-8"/>',
  pie: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
  book: '<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  logout: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
};
export function icon(name, size = 20, stroke = 'currentColor', width = 1.5) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// ---------- Menu inferior ----------
const TABS = [
  ['inicio', 'Início', 'home'],
  ['gastos', 'Gastos', 'wallet'],
  ['metas', 'Metas', 'target'],
  ['simulador', 'Simular', 'calc'],
  ['conta', 'Conta', 'user'],
];
export function tabbar(active) {
  return `<nav class="tabbar" aria-label="Menu principal">${TABS.map(([id, label, ic]) =>
    `<a href="#/${id}"${id === active ? ' aria-current="page"' : ''}>${icon(ic, 22)}${label}</a>`).join('')}</nav>`;
}

export function topbar(title, { back = '#/inicio', right = '<div class="spacer-44"></div>' } = {}) {
  return `<header class="topbar">
    <a class="icon-btn" href="${back}" aria-label="Voltar">${icon('back')}</a>
    <h1>${esc(title)}</h1>
    ${right}
  </header>`;
}

// ---------- Aviso rápido ----------
let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- Painel inferior ----------
export function openSheet(title, bodyHTML, onMount) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.id = 'sheet';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet-head"><h2 id="sheet-title">${esc(title)}</h2>
    <button class="icon-btn ghost" type="button" data-close aria-label="Fechar">${icon('close')}</button></div>
    ${bodyHTML}</div>`;
  const prevFocus = document.activeElement;
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) closeSheet();
  });
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  wrap._prevFocus = prevFocus;
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  const sheet = wrap.querySelector('.sheet');
  onMount?.(sheet);
  const first = sheet.querySelector('input, select, button:not([data-close])');
  (first || sheet.querySelector('[data-close]'))?.focus();
  return sheet;
}
export function closeSheet() {
  const el = document.getElementById('sheet');
  if (!el) return;
  const prev = el._prevFocus;
  el.remove();
  document.body.style.overflow = '';
  if (prev && document.contains(prev)) prev.focus();
}

// Botão de envio com estado de carregamento
export async function busy(btn, fn) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Aguarde…';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
}

// ---------- Seções que dá para ocultar e mostrar (a escolha fica salva neste aparelho) ----------
const CHAVE_OCULTOS = 'bcinvest.ocultos';
function lerOcultos() {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_OCULTOS) || '[]')); } catch { return new Set(); }
}
export const estaOculto = (id) => lerOcultos().has(id);

export function botaoOcultar(id, nome = '') {
  const f = estaOculto(id);
  return `<button class="rec-btn" type="button" data-rec-btn="${esc(id)}" aria-expanded="${!f}"${nome ? ` aria-label="${f ? 'Mostrar' : 'Ocultar'} ${esc(nome)}"` : ''}>${f ? 'Mostrar' : 'Ocultar'}</button>`;
}

// Seção com título, informação à direita e botão Ocultar/Mostrar
export function secao(id, titulo, corpo, { info = '', sub = false, attrs = '' } = {}) {
  const f = estaOculto(id);
  const cab = sub ? `<h3 class="h-sub">${titulo}</h3>` : `<h2 class="h-section">${titulo}</h2>`;
  return `<section class="${sub ? 'lanc-grupo' : 'section'} rec${f ? ' fechado' : ''}" data-rec="${esc(id)}" ${attrs}>
    <div class="section-head${sub ? ' sub' : ''}">${cab}<span class="rec-dir">${info}${botaoOcultar(id, titulo.replace(/<[^>]+>/g, ''))}</span></div>
    <div class="rec-corpo"${f ? ' hidden' : ''}>${corpo}</div>
  </section>`;
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-rec-btn]');
    if (!b) return;
    const caixa = b.closest('[data-rec]');
    if (!caixa) return;
    const fechar = !caixa.classList.contains('fechado');
    caixa.classList.toggle('fechado', fechar);
    const corpo = caixa.querySelector(':scope > .rec-corpo');
    if (corpo) corpo.hidden = fechar;
    b.textContent = fechar ? 'Mostrar' : 'Ocultar';
    b.setAttribute('aria-expanded', String(!fechar));
    const rot = b.getAttribute('aria-label');
    if (rot) b.setAttribute('aria-label', rot.replace(/^(Mostrar|Ocultar)/, fechar ? 'Mostrar' : 'Ocultar'));
    const s = lerOcultos();
    if (fechar) s.add(caixa.dataset.rec); else s.delete(caixa.dataset.rec);
    try { localStorage.setItem(CHAVE_OCULTOS, JSON.stringify([...s])); } catch { /* ok */ }
  });
}

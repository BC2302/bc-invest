// Parcelamento: transformar um gasto lançado em parcelado e mudar o número de parcelas
import { db, mensagemErro } from './supa.js';
import { vencimentoDaFatura } from './cartao.js';
import {
  esc, brl, icon, dataLonga, isoDate, parseISO, parseValor, valorInput, openSheet, closeSheet, toast, busy,
} from './ui.js';

const mesQueVem = (iso) => { const d = parseISO(iso); d.setMonth(d.getMonth() + 1); return isoDate(d); };
const centavos = (v) => Math.round(v * 100) / 100;

// Liga "Nº de parcelas" ao "Valor da parcela": enquanto a pessoa não mexer no valor,
// ele é o total dividido pelas parcelas.
function ligarCalculo(form, total, resumo) {
  let valorMexido = false;
  form.valor.addEventListener('input', () => { valorMexido = true; atualizar(); });
  form.parcelas.addEventListener('input', () => {
    const n = Number(form.parcelas.value);
    if (!valorMexido && total > 0 && Number.isInteger(n) && n >= 2) form.valor.value = valorInput(centavos(total / n));
    atualizar();
  });
  function atualizar() {
    const n = Number(form.parcelas.value);
    const v = parseValor(form.valor.value);
    resumo.textContent = Number.isInteger(n) && n >= 2 && v > 0 ? `${n} × ${brl(v)} = ${brl(n * v)}` : '';
  }
  atualizar();
}

// 1) Gasto já lançado ("Já paguei") → compra parcelada
export function formParcelarLancamento(lanc, recarregar, cartoes = []) {
  const total = Number(lanc.valor);
  const cartao = cartoes.find((c) => c.id === lanc.cartao_id);
  let primeiraPaga = true;
  const sheet = openSheet(`Parcelar: ${lanc.descricao}`, `
    <form class="form" novalidate>
      <p class="fine">Valor lançado: ${brl(total)} em ${dataLonga(lanc.data)}. Escolha em quantas vezes foi a compra.</p>
      <div class="grid-2">
        <label class="field">Nº de parcelas
          <input class="big" name="parcelas" inputmode="numeric" autocomplete="off" placeholder="Ex.: 10" required></label>
        <label class="field">Valor da parcela (R$)
          <input class="big" name="valor" inputmode="decimal" autocomplete="off" placeholder="0,00" required></label>
      </div>
      <p class="small" id="resumo" style="margin:0"></p>
      <span class="stat-label">A 1ª parcela já foi paga?</span>
      <div class="segmented" role="group" aria-label="Primeira parcela">
        <button type="button" data-paga="sim" aria-pressed="true">Sim, já paguei</button>
        <button type="button" data-paga="nao" aria-pressed="false">Ainda não</button>
      </div>
      <label class="field"><span id="lbl-data">Data da 1ª parcela</span>
        <input name="inicio" type="date" value="${esc(lanc.data)}" required></label>
      <p class="fine" id="ajuda"></p>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">Parcelar</button>
    </form>`);
  const form = sheet.querySelector('form');
  const err = form.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  ligarCalculo(form, total, sheet.querySelector('#resumo'));
  form.parcelas.focus();

  const ajustar = () => {
    sheet.querySelectorAll('[data-paga]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.paga === 'sim') === primeiraPaga)));
    form.inicio.value = primeiraPaga ? lanc.data
      : cartao ? vencimentoDaFatura(lanc.data, cartao.dia_fechamento, cartao.dia_vencimento) : mesQueVem(lanc.data);
    sheet.querySelector('#ajuda').textContent = primeiraPaga
      ? 'Este lançamento vira a 1ª parcela (paga). As outras entram em "A pagar", uma por mês.'
      : 'Todas as parcelas entram em "A pagar", uma por mês, a partir da data acima. Este lançamento sai de "Pagos".';
  };
  sheet.querySelectorAll('[data-paga]').forEach((b) => b.addEventListener('click', () => { primeiraPaga = b.dataset.paga === 'sim'; ajustar(); }));
  ajustar();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = Number(form.parcelas.value);
    const valor = parseValor(form.valor.value);
    if (!(Number.isInteger(n) && n >= 2 && n <= 120)) return falha('Informe o número de parcelas (2 a 120).');
    if (!(valor > 0)) return falha('Informe o valor da parcela.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.inicio.value)) return falha('Informe a data da 1ª parcela.');
    try {
      await busy(form.querySelector('button[type=submit]'), () => db.rpc('parcelar_lancamento', {
        p_lanc: lanc.id, p_parcelas: n, p_valor_parcela: valor, p_inicio: form.inicio.value, p_primeira_paga: primeiraPaga,
      }));
      closeSheet(); toast(`Parcelado em ${n}x. As parcelas estão em "A pagar".`); recarregar();
    } catch (ex) { falha(/pagamento de uma conta|Só despesas/.test(ex.message) ? ex.message : mensagemErro(ex)); }
  });
}

// 2) Conta parcelada: mudar nº de parcelas. Conta única: parcelar.
export async function formParcelas(conta, v, recarregar) {
  const unica = conta.repeticao === 'unica';
  let vencs = [];
  try { vencs = await db.select('vencimentos', `select=parcela,pago_em&conta_id=eq.${conta.id}`); } catch { /* segue */ }
  const pagas = vencs.filter((x) => x.pago_em).length;
  const total = unica ? Number(v.valor) : 0;
  const sheet = openSheet(unica ? `Parcelar: ${conta.descricao}` : `Parcelas: ${conta.descricao}`, `
    <form class="form" novalidate>
      <p class="fine">${unica
        ? `Valor da conta: ${brl(total)}. Ela vira a 1ª parcela e as outras entram nos meses seguintes.`
        : `Hoje: ${conta.parcelas}x de ${brl(conta.valor)} · ${pagas} ${pagas === 1 ? 'paga' : 'pagas'}.`}</p>
      <div class="grid-2">
        <label class="field">Nº de parcelas
          <input class="big" name="parcelas" inputmode="numeric" autocomplete="off" value="${unica ? '' : esc(conta.parcelas)}" placeholder="Ex.: 10" required></label>
        <label class="field">Valor da parcela (R$)
          <input class="big" name="valor" inputmode="decimal" autocomplete="off" value="${unica ? '' : esc(valorInput(conta.valor))}" required></label>
      </div>
      <p class="small" id="resumo" style="margin:0"></p>
      <p class="fine">${unica ? '' : 'Ao diminuir, as últimas parcelas em aberto são removidas. Ao aumentar, as novas entram nos meses seguintes. Um valor novo vale só para as parcelas em aberto.'}</p>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">${icon('check', 18, 'currentColor', 2)} Salvar</button>
    </form>`);
  const form = sheet.querySelector('form');
  const err = form.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  ligarCalculo(form, total, sheet.querySelector('#resumo'));
  form.parcelas.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = Number(form.parcelas.value);
    const valor = parseValor(form.valor.value);
    if (!(Number.isInteger(n) && n >= 2 && n <= 120)) return falha('Informe o número de parcelas (2 a 120).');
    if (n < pagas) return falha(`Já existem ${pagas} parcelas pagas. O número não pode ser menor que isso.`);
    if (!(valor > 0)) return falha('Informe o valor da parcela.');
    const mudouValor = unica || centavos(valor) !== centavos(Number(conta.valor));
    try {
      await busy(form.querySelector('button[type=submit]'), () => db.rpc('alterar_parcelas', {
        p_conta: conta.id, p_total: n, ...(mudouValor ? { p_valor: valor } : {}),
      }));
      closeSheet(); toast(unica ? `Conta parcelada em ${n}x.` : `Agora são ${n} parcelas.`); recarregar();
    } catch (ex) { falha(/parcelas pagas|mensal/.test(ex.message) ? ex.message : mensagemErro(ex)); }
  });
}

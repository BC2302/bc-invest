// Gastos: tudo num lugar só — o que já foi pago/recebido e o que ainda vai vencer
import * as data from '../data.js';
import { db, mensagemErro } from '../supa.js';
import { cartaoAvisos } from '../push.js';
import { somaPorCategoria, barrasCategoria } from '../graficos.js';
import { opcoesCartao, vencimentoDaFatura } from '../cartao.js';
import { formParcelarLancamento } from '../parcelas.js';
import { opcoesCategoria, campoNovaCategoria, ligarNovaCategoria, resolverCategoria } from '../categoria.js';
import { situacao, nomeVencimento, painelVencimento, previaHTML, formReceber, ehReceita, REPETICAO } from './contas.js';
import {
  esc, brl, brlParts, icon, tabbar, topbar, nomeMes, dataCurta, dataLonga, hojeISO, isoDate, limitesMes,
  parseValor, valorInput, openSheet, closeSheet, toast, busy, secao,
} from '../ui.js';

const hoje = new Date();
let ano = hoje.getFullYear();
let mes = hoje.getMonth();

export async function renderGastos(root, ctx) {
  root.innerHTML = `<main class="screen">${topbar('Gastos')}<div class="loading">Carregando…</div></main>${tabbar('gastos')}`;
  try { await db.rpc('gerar_vencimentos'); } catch { /* segue com o que já existe */ }
  const mesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth();
  const futuroOuAtual = ano > hoje.getFullYear() || (ano === hoje.getFullYear() && mes >= hoje.getMonth());
  const fimMes = limitesMes(ano, mes).fim;
  const [cats, contas, lancs, vencsMes, atrasadas, geral, aberto, cartoes] = await Promise.all([
    data.categorias(), data.contas(), data.lancamentosDoMes(ano, mes), data.vencimentosDoMes(ano, mes),
    mesAtual ? data.vencimentosAtrasados() : Promise.resolve([]),
    futuroOuAtual ? data.resumoGeral().catch(() => null) : null,
    futuroOuAtual ? data.totalEmAbertoAte(fimMes).catch(() => null) : null,
    data.cartoes().catch(() => []),
  ]);
  const nomeCartao = new Map(cartoes.map((c) => [c.id, c.nome]));
  // contas pagas cujo pagamento caiu neste mês (para ligar o lançamento à conta)
  const pagas = lancs.length ? await data.vencimentosPorLancamento(lancs.map((l) => l.id)) : [];
  if (!ctx.alive()) return;

  const catPorId = new Map(cats.map((c) => [c.id, c]));
  const contaPorId = new Map(contas.map((c) => [c.id, c]));
  const vencPorLanc = new Map(pagas.map((v) => [v.lancamento_id, v]));
  const r = data.resumo(lancs);
  const { inicio } = limitesMes(ano, mes);

  // A pagar: atrasadas de meses anteriores (só no mês atual) + em aberto do mês
  const emAberto = [...atrasadas.filter((v) => v.vencimento < inicio), ...vencsMes.filter((v) => !v.pago_em)];
  const aPagar = emAberto.filter((v) => !ehReceita(v));
  // A receber: receitas previstas (ex.: salário) que ainda não caíram
  const aReceber = emAberto.filter(ehReceita);
  const totalAReceber = aReceber.reduce((s, v) => s + Number(v.valor), 0);
  const totalAPagar = aPagar.reduce((s, v) => s + Number(v.valor), 0);
  const [inteiro, cents] = brlParts(r.saldo);

  // Gasto por categoria de despesa (orçamento)
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

  const aPagarHTML = aPagar.length ? `<div class="list">${aPagar.map((v) => {
    const st = situacao(v);
    const conta = contaPorId.get(v.conta_id);
    const cat = catPorId.get(v.categoria_id);
    return `<div class="item item-row">
      <button class="item-main" type="button" data-venc="${esc(v.id)}">
        <span class="item-icon ${st.cls}">${icon('calendar', 18, 'currentColor', 1.6)}</span>
        <span class="item-body"><span class="item-title">${esc(nomeVencimento(v))}</span>
        <span class="item-sub"><span class="${st.cls}">${st.txt}</span> · ${REPETICAO[conta?.repeticao] || 'Conta'}${cat ? ` · ${esc(cat.nome)}` : ''}${conta?.cartao_id && nomeCartao.has(conta.cartao_id) ? ` · ${esc(nomeCartao.get(conta.cartao_id))}` : ''}</span></span>
        <span class="item-value">${brl(v.valor)}</span>
      </button>
      <button class="pay-btn" type="button" data-pagar="${esc(v.id)}" aria-label="Pagar ${esc(nomeVencimento(v))}">Pagar</button>
    </div>`;
  }).join('')}</div>` : '<div class="empty">Nenhuma conta em aberto neste mês.</div>';

  const aReceberHTML = aReceber.map((v) => {
    const st = situacao(v);
    const conta = contaPorId.get(v.conta_id);
    const cat = catPorId.get(v.categoria_id);
    return `<div class="item item-row">
      <button class="item-main" type="button" data-venc="${esc(v.id)}">
        <span class="item-icon pos">${icon('up', 18, 'currentColor', 1.6)}</span>
        <span class="item-body"><span class="item-title">${esc(nomeVencimento(v))}</span>
        <span class="item-sub"><span class="${st.cls}">${st.txt}</span> · ${REPETICAO[conta?.repeticao] || 'Receita'}${cat ? ` · ${esc(cat.nome)}` : ''}</span></span>
        <span class="item-value pos">+ ${brl(v.valor)}</span>
      </button>
      <button class="pay-btn" type="button" data-receber="${esc(v.id)}" aria-label="Recebi ${esc(nomeVencimento(v))}">Recebi</button>
    </div>`;
  }).join('');

  const itemLanc = (l) => {
    const cat = catPorId.get(l.categoria_id);
    const rec = l.tipo === 'receita';
    const venc = vencPorLanc.get(l.id);
    return `<button class="item" type="button" data-lanc="${esc(l.id)}">
      <span class="item-icon ${rec ? 'pos' : 'neg'}">${icon(rec ? 'up' : venc ? 'check' : 'down', 18, 'currentColor', 1.6)}</span>
      <span class="item-body"><span class="item-title">${esc(l.descricao)}</span>
      <span class="item-sub">${dataCurta(l.data)} · ${esc(cat?.nome || (rec ? 'Receita' : 'Sem categoria'))}${l.cartao_id && nomeCartao.has(l.cartao_id) ? ` · ${esc(nomeCartao.get(l.cartao_id))}` : ''}${venc ? (rec ? ' · recebido' : ' · conta paga') : ''}</span></span>
      <span class="item-value${rec ? ' pos' : ''}">${rec ? '+' : '−'} ${brl(l.valor)}</span>
    </button>`;
  };
  // Receitas juntas e despesas juntas, cada grupo em ordem de data (dia 1, 2, 3…)
  const emOrdem = [...lancs].reverse().sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const grupo = (tipo, titulo) => {
    const ls = emOrdem.filter((l) => l.tipo === tipo);
    if (!ls.length) return '';
    const total = ls.reduce((t, l) => t + Number(l.valor), 0);
    return secao(`gastos-${tipo}s`, titulo, `<div class="list">${ls.map(itemLanc).join('')}</div>`, {
      sub: true, attrs: `data-grupo="${tipo}"`,
      info: `<span class="small ${tipo === 'receita' ? 'pos' : 'neg'}">${ls.length} · ${brl(total)}</span>`,
    });
  };
  const lancHTML = lancs.length
    ? grupo('receita', 'Receitas') + grupo('despesa', 'Despesas')
    : '<div class="empty">Nada pago ou recebido neste mês ainda.</div>';

  root.innerHTML = `<main class="screen">
    ${topbar('Gastos', { right: `<button class="icon-btn" type="button" id="novo-top" aria-label="Novo lançamento">${icon('plus')}</button>` })}
    <div class="month-nav">
      <button class="icon-btn ghost" type="button" id="mes-ant" aria-label="Mês anterior">${icon('back', 18)}</button>
      <span class="label" aria-live="polite">${nomeMes(ano, mes)}</span>
      <button class="icon-btn ghost" type="button" id="mes-prox" aria-label="Próximo mês">${icon('next', 18)}</button>
    </div>

    <section class="card center" aria-label="Resumo do mês">
      <div class="result-box"><span class="eyebrow">Saldo do mês</span>
      <span class="big-number${r.saldo < 0 ? ' neg' : ''}">${esc(inteiro)}<span class="cents">${esc(cents)}</span></span></div>
      <div class="grid-3">
        <div class="stat boxed"><span class="stat-label">Receitas</span><span class="stat-value pos">${brl(r.receitas)}</span></div>
        <div class="stat boxed"><span class="stat-label">Pagas</span><span class="stat-value neg">${brl(r.despesas)}</span></div>
        <div class="stat boxed"><span class="stat-label">A pagar</span><span class="stat-value warn">${brl(totalAPagar)}</span></div>
      </div>
      ${geral && aberto ? previaHTML(geral.saldo, aberto, mesAtual ? 'até o fim do mês' : `até ${dataCurta(fimMes)}`, undefined, 'previa-gastos') : ''}
    </section>

    <div class="btn-row">
      <button class="btn" type="button" id="novo">${icon('plus', 18, 'currentColor', 2)} Novo</button>
      <a class="btn outline" href="#/relatorio">${icon('chart', 18)} Relatório</a>
    </div>

    ${aReceber.length ? secao('gastos-areceber', 'A receber', `<div class="list">${aReceberHTML}</div>`,
      { info: `<span class="small pos">${aReceber.length} · ${brl(totalAReceber)}</span>` }) : ''}

    ${secao('gastos-apagar', 'A pagar', aPagarHTML,
      { info: `<span class="small">${aPagar.length ? `${aPagar.length} · ${brl(totalAPagar)}` : ''}</span>` })}

    ${secao('gastos-grafico', 'Gastos do mês',
      barrasCategoria(somaPorCategoria(lancs, 'despesa', cats), { tipo: 'despesa', vazio: 'Nenhuma despesa paga neste mês ainda.' }),
      { info: `<span class="small">${r.despesas ? brl(r.despesas) : ''}</span>`, attrs: 'aria-label="Gráfico de gastos do mês"' })}

    ${secao('gastos-pagos', 'Pagos e recebidos', lancHTML)}

    ${secao('gastos-orcamento', 'Orçamento por categoria', orcamentoHTML,
      { info: '<a class="link-btn" href="#/categorias">Categorias e limites</a>' })}

    <div id="avisos"></div>
  </main>${tabbar('gastos')}`;

  cartaoAvisos(root.querySelector('#avisos'));
  const recarregar = () => renderGastos(root, ctx);
  root.querySelector('#mes-ant').addEventListener('click', () => { if (--mes < 0) { mes = 11; ano--; } recarregar(); });
  root.querySelector('#mes-prox').addEventListener('click', () => { if (++mes > 11) { mes = 0; ano++; } recarregar(); });
  root.querySelector('#novo').addEventListener('click', () => formLancamento(null, cats, recarregar, cartoes));
  root.querySelector('#novo-top').addEventListener('click', () => formLancamento(null, cats, recarregar, cartoes));

  const todasVencs = [...aPagar, ...aReceber, ...pagas];
  root.querySelectorAll('[data-venc]').forEach((b) => b.addEventListener('click', () => {
    const v = todasVencs.find((x) => x.id === b.dataset.venc);
    painelVencimento(v, contaPorId.get(v.conta_id), cats, recarregar, cartoes);
  }));
  root.querySelectorAll('[data-receber]').forEach((b) => b.addEventListener('click', () => {
    formReceber(aReceber.find((x) => x.id === b.dataset.receber), recarregar);
  }));
  root.querySelectorAll('[data-pagar]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await busy(b, () => db.rpc('pagar_vencimento', { p_id: b.dataset.pagar }));
      toast('Conta paga. Lançada em Pagos.');
      recarregar();
    } catch (ex) { toast(mensagemErro(ex)); }
  }));
  root.querySelectorAll('[data-lanc]').forEach((b) => b.addEventListener('click', () => {
    const l = lancs.find((x) => x.id === b.dataset.lanc);
    const venc = vencPorLanc.get(l.id);
    // pagamento de conta: abre a conta (para desfazer o pagamento, editar etc.)
    if (venc) painelVencimento(venc, contaPorId.get(venc.conta_id), cats, recarregar, cartoes);
    else formLancamento(l, cats, recarregar, cartoes);
  }));
}

function dataPadrao() {
  if (ano === hoje.getFullYear() && mes === hoje.getMonth()) return hojeISO();
  return isoDate(new Date(ano, mes, 1));
}

// Novo: despesa já paga, receita, ou conta a pagar (única, mensal ou parcelada).
// Editar: só lançamentos já pagos/recebidos.
function formLancamento(lanc, cats, recarregar, cartoes = []) {
  let tipo = lanc?.tipo || 'despesa';
  let situ = 'pago';      // 'pago' | 'apagar'
  let rep = 'unica';      // 'unica' | 'mensal' | 'parcelada'
  let dataMexida = false;
  const opcoes = (t) => opcoesCategoria(cats, t, lanc?.categoria_id);

  const sheet = openSheet(lanc ? 'Editar lançamento' : 'Novo', `
    <form class="form" novalidate>
      <div class="segmented" role="group" aria-label="Tipo">
        <button type="button" data-tipo="despesa" aria-pressed="${tipo === 'despesa'}">Despesa</button>
        <button type="button" data-tipo="receita" aria-pressed="${tipo === 'receita'}">Receita</button>
      </div>
      ${lanc ? '' : `<div class="segmented" role="group" aria-label="Situação" id="grp-situ">
        <button type="button" data-situ="pago" aria-pressed="true">Já paguei</button>
        <button type="button" data-situ="apagar" aria-pressed="false">Vou pagar</button>
      </div>
      <div class="segmented three" role="group" aria-label="Repetição" id="grp-rep" hidden>
        <button type="button" data-rep="unica" aria-pressed="true">Única</button>
        <button type="button" data-rep="mensal" aria-pressed="false">Mensal</button>
        <button type="button" data-rep="parcelada" aria-pressed="false">Parcelada</button>
      </div>
      <p class="fine" id="rep-ajuda" hidden></p>`}
      <div class="grid-2">
        <label class="field"><span id="lbl-valor">Valor (R$)</span>
          <input class="big" name="valor" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(valorInput(lanc?.valor))}" required></label>
        <label class="field" id="campo-parcelas" hidden>Nº de parcelas
          <input class="big" name="parcelas" inputmode="numeric" autocomplete="off" placeholder="10"></label>
      </div>
      <label class="field">Descrição
        <input name="descricao" maxlength="80" autocomplete="off" placeholder="Ex.: Supermercado, aluguel, notebook" value="${esc(lanc?.descricao || '')}" required></label>
      <div class="grid-2">
        <label class="field">Categoria
          <select name="categoria">${opcoes(tipo)}</select></label>
        <label class="field"><span id="lbl-data">Data</span>
          <input name="data" type="date" value="${esc(lanc?.data || dataPadrao())}" required></label>
      </div>
      ${campoNovaCategoria()}
      ${cartoes.length ? `<label class="field" id="campo-cartao">Cartão de crédito
        <select name="cartao">${opcoesCartao(cartoes, lanc?.cartao_id)}</select></label>` : ''}
      <p class="fine" id="cartao-ajuda" hidden></p>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit" id="salvar">${lanc ? 'Salvar alterações' : 'Adicionar'}</button>
      ${lanc?.tipo === 'despesa' ? `<button class="btn outline" type="button" id="parcelar">${icon('calendar', 18)} Parcelar esta compra</button>` : ''}
      ${lanc ? '<button class="btn danger" type="button" id="excluir">Excluir lançamento</button>' : ''}
    </form>`);

  const form = sheet.querySelector('form');
  const err = form.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  form.valor.focus();
  const atualizarCat = ligarNovaCategoria(form);

  const ajustar = () => {
    sheet.querySelectorAll('[data-tipo]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tipo === tipo)));
    const campoCartao = form.querySelector('#campo-cartao');
    if (campoCartao) campoCartao.hidden = tipo !== 'despesa';
    const cartaoSel = tipo === 'despesa' ? cartoes.find((c) => c.id === form.cartao?.value) : null;
    const ajudaCartao = form.querySelector('#cartao-ajuda');
    ajudaCartao.hidden = !cartaoSel;
    if (cartaoSel) {
      const naFatura = tipo === 'despesa' && situ === 'apagar' && !lanc;
      ajudaCartao.textContent = naFatura
        ? { unica: `Ocupa o limite do ${cartaoSel.nome} até você marcar como paga.`, mensal: `A cobrança de cada mês ocupa o limite do ${cartaoSel.nome} até ser marcada como paga.`, parcelada: `As parcelas em aberto ocupam o limite do ${cartaoSel.nome} até cada uma ser marcada como paga.` }[rep]
        : `Ocupa o limite do ${cartaoSel.nome} até o vencimento da fatura${/^\d{4}-\d{2}-\d{2}$/.test(form.data.value) ? ` (${dataLonga(vencimentoDaFatura(form.data.value, cartaoSel.dia_fechamento, cartaoSel.dia_vencimento))})` : ''}.`;
    }
    if (lanc) return;
    const rec = tipo === 'receita';
    if (rec && rep === 'parcelada') rep = 'unica';
    const apagar = situ === 'apagar';
    const bSitu = sheet.querySelectorAll('[data-situ]');
    bSitu[0].textContent = rec ? 'Já recebi' : 'Já paguei';
    bSitu[1].textContent = rec ? 'Vou receber' : 'Vou pagar';
    sheet.querySelector('[data-rep="parcelada"]').hidden = rec;
    sheet.querySelector('#grp-rep').classList.toggle('three', !rec);
    sheet.querySelectorAll('[data-situ]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.situ === situ)));
    sheet.querySelector('#grp-rep').hidden = !apagar;
    sheet.querySelectorAll('[data-rep]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.rep === rep)));
    form.querySelector('#campo-parcelas').hidden = !(apagar && rep === 'parcelada');
    form.querySelector('#lbl-valor').textContent = apagar && rep === 'parcelada' ? 'Valor da parcela (R$)' : 'Valor (R$)';
    form.querySelector('#lbl-data').textContent = !apagar ? 'Data'
      : rec ? (rep === 'mensal' ? 'Primeiro recebimento' : 'Data prevista')
        : rep === 'unica' ? 'Vencimento' : rep === 'mensal' ? 'Primeiro vencimento' : 'Vencimento da 1ª parcela';
    const dia = Number((form.data.value || '').slice(8, 10));
    const ajuda = form.querySelector('#rep-ajuda');
    ajuda.hidden = !apagar;
    ajuda.textContent = rec ? {
      unica: 'Fica em "A receber" até você tocar em "Recebi". A prévia já conta com esse valor.',
      mensal: `Ideal para salário: aparece todo mês${dia ? ` no dia ${dia}` : ''} em "A receber" até você tocar em "Recebi". A prévia já conta com ele.`,
    }[rep] : {
      unica: 'Fica em "A pagar" até você marcar como paga. Você recebe avisos antes e depois do vencimento.',
      mensal: `Repete todo mês${dia ? ` no dia ${dia}` : ''}, até você parar de repetir.`,
      parcelada: `Uma parcela por mês${dia ? `, sempre no dia ${dia}` : ''}.`,
    }[rep];
    form.querySelector('#salvar').textContent = !apagar ? 'Adicionar' : rec ? 'Salvar receita a receber' : 'Salvar conta a pagar';
  };

  sheet.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => {
    tipo = b.dataset.tipo;
    form.categoria.innerHTML = opcoes(tipo);
    atualizarCat();
    ajustar();
  }));
  sheet.querySelectorAll('[data-situ]').forEach((b) => b.addEventListener('click', () => { situ = b.dataset.situ; ajustar(); }));
  sheet.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => { rep = b.dataset.rep; ajustar(); }));
  form.data.addEventListener('change', ajustar);
  form.data.addEventListener('input', () => { dataMexida = true; });
  // conta a pagar no cartão: sugere o vencimento da fatura
  const sugerirData = () => {
    const c = cartoes.find((x) => x.id === form.cartao?.value);
    if (!lanc && c && tipo === 'despesa' && situ === 'apagar' && !dataMexida) {
      form.data.value = vencimentoDaFatura(hojeISO(), c.dia_fechamento, c.dia_vencimento);
    }
    ajustar();
  };
  form.cartao?.addEventListener('change', sugerirData);
  sheet.querySelectorAll('[data-situ]').forEach((b) => b.addEventListener('click', sugerirData));
  ajustar();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const valor = parseValor(form.valor.value);
    const descricao = form.descricao.value.trim();
    const dataISO = form.data.value;
    const apagar = !lanc && situ === 'apagar';
    const parcelas = apagar && rep === 'parcelada' ? Number(form.parcelas.value) : null;
    const cartaoId = tipo === 'despesa' ? (form.cartao?.value || null) : null;
    if (!(valor > 0)) return falha('Informe um valor maior que zero.');
    if (valor > 999999999999) return falha('Valor muito alto.');
    if (!descricao) return falha('Informe uma descrição.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return falha('Informe a data.');
    if (apagar && rep === 'parcelada' && !(Number.isInteger(parcelas) && parcelas >= 2 && parcelas <= 120)) return falha('Informe o número de parcelas (2 a 120).');
    try {
      await busy(form.querySelector('button[type=submit]'), async () => {
        const categoria = await resolverCategoria(form, cats, tipo);
        if (apagar) {
          const id = await db.rpc('criar_conta', {
            p_descricao: descricao, p_valor: valor, p_categoria: categoria, p_repeticao: rep, p_inicio: dataISO, p_parcelas: parcelas, p_tipo: tipo,
          });
          if (cartaoId && id) await db.update('contas', id, { cartao_id: cartaoId });
          return id;
        }
        const row = { tipo, valor, descricao, data: dataISO, categoria_id: categoria, cartao_id: cartaoId };
        return lanc ? db.update('lancamentos', lanc.id, row) : db.insert('lancamentos', row);
      });
      closeSheet();
      toast(lanc ? 'Lançamento atualizado.' : apagar ? (tipo === 'receita' ? 'Receita a receber cadastrada.' : 'Conta a pagar cadastrada.') : 'Lançamento adicionado.');
      recarregar();
    } catch (ex) { falha(ex.message?.startsWith('Informe') ? ex.message : mensagemErro(ex)); }
  });

  sheet.querySelector('#parcelar')?.addEventListener('click', () => formParcelarLancamento(lanc, recarregar, cartoes));
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

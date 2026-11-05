// Cartões de crédito: data da fatura e quanto do limite está ocupado
import { esc, parseISO, isoDate, hojeISO, dataLonga } from './ui.js';

const ultimoDia = (y, m) => new Date(y, m + 1, 0).getDate();
const diaNoMes = (y, m, d) => new Date(y, m, Math.min(d, ultimoDia(y, m)));

// Vencimento da fatura em que cai uma compra feita na data informada.
// Compra no dia do fechamento (ou depois) já vai para a fatura seguinte.
export function vencimentoDaFatura(dataISO, diaFech, diaVenc) {
  const d = parseISO(dataISO);
  let fech = diaNoMes(d.getFullYear(), d.getMonth(), diaFech);
  if (d >= fech) fech = diaNoMes(d.getFullYear(), d.getMonth() + 1, diaFech);
  let venc = diaNoMes(fech.getFullYear(), fech.getMonth(), diaVenc);
  if (venc <= fech) venc = diaNoMes(fech.getFullYear(), fech.getMonth() + 1, diaVenc);
  return isoDate(venc);
}

// Uso de cada cartão:
// - compra já lançada: ocupa até o vencimento da fatura dela;
// - conta única ou parcelada no cartão: parcelas em aberto ocupam até serem pagas;
// - conta mensal no cartão (assinatura): só a cobrança da próxima fatura ocupa.
export function calcularUso({ cartoes, lancs, contas, vencs }, hoje = hojeISO()) {
  const usos = new Map(cartoes.map((c) => [c.id, { cartao: c, usado: 0, itens: [] }]));
  for (const l of lancs) {
    const u = usos.get(l.cartao_id);
    if (!u) continue;
    const libera = vencimentoDaFatura(l.data, u.cartao.dia_fechamento, u.cartao.dia_vencimento);
    if (libera < hoje) continue;
    u.usado += Number(l.valor);
    u.itens.push({ descricao: l.descricao, valor: Number(l.valor), info: `Compra · libera em ${dataLonga(libera)}`, ordem: libera });
  }
  const contaPorId = new Map(contas.map((c) => [c.id, c]));
  const grupos = new Map();
  for (const v of vencs) {
    const conta = contaPorId.get(v.conta_id);
    const u = conta && usos.get(conta.cartao_id);
    if (!u) continue;
    if (conta.repeticao === 'mensal' && v.vencimento > vencimentoDaFatura(hoje, u.cartao.dia_fechamento, u.cartao.dia_vencimento)) continue;
    u.usado += Number(v.valor);
    const g = grupos.get(conta.id) || { u, conta, valor: 0, n: 0, prox: v.vencimento };
    g.valor += Number(v.valor); g.n += 1; if (v.vencimento < g.prox) g.prox = v.vencimento;
    grupos.set(conta.id, g);
  }
  for (const g of grupos.values()) {
    const parc = g.conta.repeticao === 'parcelada';
    g.u.itens.push({
      descricao: g.conta.descricao,
      valor: g.valor,
      info: parc ? `${g.n} ${g.n === 1 ? 'parcela restante' : 'parcelas restantes'} · próxima ${dataLonga(g.prox)}`
        : `${g.conta.repeticao === 'mensal' ? 'Mensal' : 'Conta'} · vence ${dataLonga(g.prox)}`,
      ordem: g.prox,
    });
  }
  const lista = [...usos.values()].map((u) => ({
    ...u,
    usado: Math.round(u.usado * 100) / 100,
    disponivel: Math.round((Number(u.cartao.limite) - u.usado) * 100) / 100,
    itens: u.itens.sort((a, b) => (a.ordem < b.ordem ? -1 : 1)),
  }));
  const limite = lista.reduce((s, u) => s + Number(u.cartao.limite), 0);
  const usado = lista.reduce((s, u) => s + u.usado, 0);
  return { lista, limite, usado, disponivel: limite - usado };
}

export const opcoesCartao = (cartoes, sel) => `<option value="">Não usei cartão</option>${cartoes
  .map((c) => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}`;

// Consultas ao banco usadas pelas telas
import { db } from './supa.js';
import { limitesMes, hojeISO, addDias } from './ui.js';

export const categorias = () => db.select('categorias', 'select=id,nome,tipo,orcamento&order=nome.asc');

export function lancamentosDoMes(ano, mes) {
  const { inicio, fim } = limitesMes(ano, mes);
  return db.select('lancamentos',
    `select=id,tipo,descricao,valor,data,categoria_id,cartao_id&data=gte.${inicio}&data=lte.${fim}&order=data.desc,criado_em.desc`);
}

// Relatório: lançamentos de um ano inteiro e o primeiro ano com dados
export const lancamentosDoAno = (ano) =>
  db.select('lancamentos', `select=id,tipo,descricao,valor,data,categoria_id&data=gte.${ano}-01-01&data=lte.${ano}-12-31&order=data.asc`);

export async function primeiroAno() {
  const rows = await db.select('lancamentos', 'select=data&order=data.asc&limit=1');
  return rows?.[0] ? Number(rows[0].data.slice(0, 4)) : null;
}

export const metas = () => db.select('metas', 'select=*&order=is_reserva.desc,criado_em.asc');

// Totais de todos os tempos (para o saldo total disponível)
export async function resumoGeral() {
  const rows = await db.rpc('resumo_geral');
  const r = rows?.[0] || {};
  const receitas = Number(r.receitas) || 0;
  const despesas = Number(r.despesas) || 0;
  return { receitas, despesas, saldo: receitas - despesas };
}

export function resumo(lancs) {
  let receitas = 0; let despesas = 0;
  for (const l of lancs) {
    if (l.tipo === 'receita') receitas += Number(l.valor);
    else despesas += Number(l.valor);
  }
  return { receitas, despesas, saldo: receitas - despesas };
}

// ---------- Contas a pagar ----------
export const contas = () => db.select('contas', 'select=id,descricao,valor,categoria_id,repeticao,dia_vencimento,parcelas,ativa,cartao_id');

const CAMPOS_VENC = 'select=id,conta_id,descricao,valor,categoria_id,vencimento,parcela,total_parcelas,pago_em,lancamento_id,tipo';

export function vencimentosDoMes(ano, mes) {
  const { inicio, fim } = limitesMes(ano, mes);
  return db.select('vencimentos', `${CAMPOS_VENC}&vencimento=gte.${inicio}&vencimento=lte.${fim}&order=vencimento.asc,descricao.asc`);
}

export const vencimentosAtrasados = () =>
  db.select('vencimentos', `${CAMPOS_VENC}&pago_em=is.null&vencimento=lt.${hojeISO()}&order=vencimento.asc`);

export const vencimentosPorLancamento = (ids) =>
  db.select('vencimentos', `${CAMPOS_VENC}&lancamento_id=in.(${ids.join(',')})`);

// Tudo o que ainda não foi pago até uma data (inclui as atrasadas)
export async function totalEmAbertoAte(fimISO) {
  const rows = await db.select('vencimentos', `select=valor,tipo&pago_em=is.null&vencimento=lte.${fimISO}`);
  const soma = (t) => rows.filter((v) => (v.tipo || 'despesa') === t).reduce((s, v) => s + Number(v.valor), 0);
  const conta = (t) => rows.filter((v) => (v.tipo || 'despesa') === t).length;
  return { total: soma('despesa'), qtd: conta('despesa'), receber: soma('receita'), qtdReceber: conta('receita') };
}

// Em aberto: atrasadas e as que vencem nos próximos dias
export const proximosVencimentos = (dias = 7, limite = 4) =>
  db.select('vencimentos', `${CAMPOS_VENC}&pago_em=is.null&tipo=eq.despesa&vencimento=lte.${addDias(hojeISO(), dias)}&order=vencimento.asc&limit=${limite}`);

// ---------- Cartões de crédito ----------
export const cartoes = () => db.select('cartoes', 'select=id,nome,limite,dia_fechamento,dia_vencimento&order=nome.asc');

// Tudo o que pode estar ocupando o limite dos cartões
export async function dadosCartoes() {
  const lista = await cartoes();
  if (!lista.length) return { cartoes: [], lancs: [], contas: [], vencs: [] };
  const desde = addDias(hojeISO(), -75);
  const [lancs, cts] = await Promise.all([
    db.select('lancamentos', `select=id,descricao,valor,data,cartao_id&cartao_id=not.is.null&tipo=eq.despesa&data=gte.${desde}`),
    db.select('contas', 'select=id,descricao,repeticao,cartao_id&cartao_id=not.is.null'),
  ]);
  const vencs = cts.length
    ? await db.select('vencimentos', `${CAMPOS_VENC}&pago_em=is.null&conta_id=in.(${cts.map((c) => c.id).join(',')})&order=vencimento.asc`)
    : [];
  return { cartoes: lista, lancs, contas: cts, vencs };
}

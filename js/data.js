// Consultas ao banco usadas pelas telas
import { db } from './supa.js';
import { limitesMes, hojeISO, addDias } from './ui.js';

export const categorias = () => db.select('categorias', 'select=id,nome,tipo,orcamento&order=nome.asc');

export function lancamentosDoMes(ano, mes) {
  const { inicio, fim } = limitesMes(ano, mes);
  return db.select('lancamentos',
    `select=id,tipo,descricao,valor,data,categoria_id&data=gte.${inicio}&data=lte.${fim}&order=data.desc,criado_em.desc`);
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
export const contas = () => db.select('contas', 'select=id,descricao,valor,categoria_id,repeticao,dia_vencimento,parcelas,ativa');

const CAMPOS_VENC = 'select=id,conta_id,descricao,valor,categoria_id,vencimento,parcela,total_parcelas,pago_em';

export function vencimentosDoMes(ano, mes) {
  const { inicio, fim } = limitesMes(ano, mes);
  return db.select('vencimentos', `${CAMPOS_VENC}&vencimento=gte.${inicio}&vencimento=lte.${fim}&order=vencimento.asc,descricao.asc`);
}

export const vencimentosAtrasados = () =>
  db.select('vencimentos', `select=id,valor&pago_em=is.null&vencimento=lt.${hojeISO()}`);

// Em aberto: atrasadas e as que vencem nos próximos dias
export const proximosVencimentos = (dias = 7, limite = 4) =>
  db.select('vencimentos', `${CAMPOS_VENC}&pago_em=is.null&vencimento=lte.${addDias(hojeISO(), dias)}&order=vencimento.asc&limit=${limite}`);

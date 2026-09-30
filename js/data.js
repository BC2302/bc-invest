// Consultas ao banco usadas pelas telas
import { db } from './supa.js';
import { limitesMes } from './ui.js';

export const categorias = () => db.select('categorias', 'select=id,nome,tipo,orcamento&order=nome.asc');

export function lancamentosDoMes(ano, mes) {
  const { inicio, fim } = limitesMes(ano, mes);
  return db.select('lancamentos',
    `select=id,tipo,descricao,valor,data,categoria_id&data=gte.${inicio}&data=lte.${fim}&order=data.desc,criado_em.desc`);
}

export const metas = () => db.select('metas', 'select=*&order=is_reserva.desc,criado_em.asc');

export function resumo(lancs) {
  let receitas = 0; let despesas = 0;
  for (const l of lancs) {
    if (l.tipo === 'receita') receitas += Number(l.valor);
    else despesas += Number(l.valor);
  }
  return { receitas, despesas, saldo: receitas - despesas };
}

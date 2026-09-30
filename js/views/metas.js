// Metas financeiras e reserva de emergência
import * as data from '../data.js';
import { db, mensagemErro } from '../supa.js';
import {
  esc, brl, tabbar, topbar, icon, dataLonga, mesesAte, parseValor, valorInput,
  openSheet, closeSheet, toast, busy,
} from '../ui.js';

export async function renderMetas(root, ctx) {
  root.innerHTML = `<main class="screen">${topbar('Minhas metas')}<div class="loading">Carregando…</div></main>${tabbar('metas')}`;
  const metas = await data.metas();
  if (!ctx.alive()) return;

  const total = metas.reduce((s, m) => s + Number(m.valor_atual), 0);
  const temReserva = metas.some((m) => m.is_reserva);
  const recarregar = () => renderMetas(root, ctx);

  root.innerHTML = `<main class="screen">
    ${topbar('Minhas metas', { right: `<button class="icon-btn" type="button" id="nova-top" aria-label="Nova meta">${icon('plus')}</button>` })}

    <section class="card center">
      <div class="result-box"><span class="eyebrow">Total guardado em metas</span>
      <span class="big-number">${brl(total)}</span></div>
    </section>

    ${metas.length ? metas.map((m) => {
      const atual = Number(m.valor_atual); const alvo = Number(m.valor_alvo);
      const pct = Math.min(100, Math.round((atual / alvo) * 100));
      const falta = Math.max(0, alvo - atual);
      let ritmo = '';
      if (m.prazo && falta > 0) {
        const n = mesesAte(m.prazo);
        ritmo = n > 0 ? ` · ${brl(falta / n)}/mês até ${dataLonga(m.prazo)}` : ' · prazo vencido';
      }
      return `<button class="goal" type="button" data-id="${esc(m.id)}">
        ${m.is_reserva ? '<span class="tag">Reserva de emergência</span>' : ''}
        <span class="goal-top"><span class="goal-name">${esc(m.nome)}</span><span class="goal-pct">${pct}%</span></span>
        <span class="bar"><span style="width:${pct}%"></span></span>
        <span class="goal-top small"><span>${brl(atual)} de ${brl(alvo)}</span></span>
        <span class="small">${falta > 0 ? `Faltam ${brl(falta)}${ritmo}` : '<span class="pos">Meta alcançada!</span>'}</span>
      </button>`;
    }).join('') : '<div class="empty">Você ainda não tem metas.<br>Comece pela <strong>reserva de emergência</strong>: ela protege você de imprevistos antes de investir no longo prazo.</div>'}

    <button class="btn" type="button" id="nova">${icon('plus', 18, 'currentColor', 2)} Nova meta</button>
  </main>${tabbar('metas')}`;

  const nova = () => formMeta(null, !temReserva, recarregar);
  root.querySelector('#nova').addEventListener('click', nova);
  root.querySelector('#nova-top').addEventListener('click', nova);
  root.querySelectorAll('.goal[data-id]').forEach((b) => b.addEventListener('click', () => {
    painelMeta(metas.find((m) => m.id === b.dataset.id), recarregar);
  }));
}

function formMeta(meta, sugerirReserva, recarregar) {
  const sheet = openSheet(meta ? 'Editar meta' : 'Nova meta', `
    <form class="form" novalidate>
      <label class="field">Nome da meta
        <input name="nome" maxlength="60" autocomplete="off" placeholder="Ex.: Viagem, carro, aposentadoria" value="${esc(meta?.nome || (sugerirReserva ? 'Reserva de emergência' : ''))}" required></label>
      <div class="grid-2">
        <label class="field">Quanto quer juntar (R$)
          <input name="alvo" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(valorInput(meta?.valor_alvo))}" required></label>
        <label class="field">Já tem guardado (R$)
          <input name="atual" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(valorInput(meta?.valor_atual ?? ''))}"></label>
      </div>
      <label class="field">Prazo (opcional)
        <input name="prazo" type="date" value="${esc(meta?.prazo || '')}"></label>
      <label class="check"><input type="checkbox" name="reserva"${(meta ? meta.is_reserva : sugerirReserva) ? ' checked' : ''}> Esta é minha reserva de emergência</label>
      <p class="fine">Dica: para a reserva, um alvo comum é de 6 a 12 vezes o seu custo de vida mensal.</p>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">${meta ? 'Salvar alterações' : 'Criar meta'}</button>
    </form>`);
  const form = sheet.querySelector('form');
  const err = form.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = form.nome.value.trim();
    const alvo = parseValor(form.alvo.value);
    const atualTxt = form.atual.value.trim();
    const atual = atualTxt ? parseValor(atualTxt) : 0;
    if (!nome) return falha('Dê um nome para a meta.');
    if (!(alvo > 0)) return falha('Informe quanto quer juntar.');
    if (!(atual >= 0)) return falha('Valor guardado inválido.');
    const row = { nome, valor_alvo: alvo, valor_atual: atual, prazo: form.prazo.value || null, is_reserva: form.reserva.checked };
    try {
      await busy(form.querySelector('button[type=submit]'), async () => {
        if (row.is_reserva) {
          // só uma reserva de emergência por vez
          const outras = await db.select('metas', `select=id&is_reserva=eq.true${meta ? `&id=neq.${meta.id}` : ''}`);
          await Promise.all(outras.map((o) => db.update('metas', o.id, { is_reserva: false })));
        }
        return meta ? db.update('metas', meta.id, row) : db.insert('metas', row);
      });
      closeSheet(); toast(meta ? 'Meta atualizada.' : 'Meta criada.'); recarregar();
    } catch (ex) { falha(mensagemErro(ex)); }
  });
}

function painelMeta(meta, recarregar) {
  const atual = Number(meta.valor_atual);
  const sheet = openSheet(meta.nome, `
    <div class="result-box"><span class="eyebrow">Guardado</span>
    <span class="big-number">${brl(atual)}</span>
    <span class="small">de ${brl(meta.valor_alvo)}</span></div>
    <form class="form" novalidate>
      <div class="segmented" role="group" aria-label="Movimento">
        <button type="button" data-mov="add" aria-pressed="true">Guardar</button>
        <button type="button" data-mov="sub" aria-pressed="false">Retirar</button>
      </div>
      <label class="field">Valor (R$)
        <input class="big" name="valor" inputmode="decimal" autocomplete="off" placeholder="0,00" required></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">Confirmar</button>
    </form>
    <div class="btn-row">
      <button class="btn outline" type="button" id="editar">${icon('edit', 18)} Editar</button>
      <button class="btn danger" type="button" id="excluir">Excluir</button>
    </div>`);

  let mov = 'add';
  const form = sheet.querySelector('form');
  const err = form.querySelector('.form-error');
  const falha = (t) => { err.textContent = t; err.hidden = false; };
  form.valor.focus();

  sheet.querySelectorAll('[data-mov]').forEach((b) => b.addEventListener('click', () => {
    mov = b.dataset.mov;
    sheet.querySelectorAll('[data-mov]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = parseValor(form.valor.value);
    if (!(v > 0)) return falha('Informe um valor maior que zero.');
    if (mov === 'sub' && v > atual) return falha(`Você só tem ${brl(atual)} guardado nesta meta.`);
    const novo = Math.round((mov === 'add' ? atual + v : atual - v) * 100) / 100;
    try {
      await busy(form.querySelector('button[type=submit]'), () => db.update('metas', meta.id, { valor_atual: novo }));
      closeSheet();
      toast(novo >= Number(meta.valor_alvo) && mov === 'add' ? 'Parabéns! Meta alcançada.' : 'Meta atualizada.');
      recarregar();
    } catch (ex) { falha(mensagemErro(ex)); }
  });

  sheet.querySelector('#editar').addEventListener('click', () => formMeta(meta, false, recarregar));
  const del = sheet.querySelector('#excluir');
  let armado = false;
  del.addEventListener('click', async () => {
    if (!armado) { armado = true; del.textContent = 'Confirmar exclusão'; return; }
    try {
      await busy(del, () => db.remove('metas', meta.id));
      closeSheet(); toast('Meta excluída.'); recarregar();
    } catch (ex) { falha(mensagemErro(ex)); }
  });
}

// Seletor de categoria com a opção "+ Nova categoria…"
import { db } from './supa.js';
import { esc } from './ui.js';

const NOVA = '__nova';

export function opcoesCategoria(cats, tipo, selecionada) {
  return `<option value="">Sem categoria</option>${cats.filter((c) => c.tipo === tipo)
    .map((c) => `<option value="${esc(c.id)}"${selecionada === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}
    <option value="${NOVA}">+ Nova categoria…</option>`;
}

// Campo de nome que aparece quando a pessoa escolhe "+ Nova categoria…"
export function campoNovaCategoria() {
  return '<label class="field" data-nova-cat hidden>Nome da nova categoria<input name="nova_categoria" maxlength="40" autocomplete="off"></label>';
}

export function ligarNovaCategoria(form) {
  const sel = form.querySelector('select[name="categoria"]');
  const campo = form.querySelector('[data-nova-cat]');
  const atualizar = () => {
    campo.hidden = sel.value !== NOVA;
    if (!campo.hidden) campo.querySelector('input').focus();
  };
  sel.addEventListener('change', atualizar);
  return atualizar;
}

// Devolve o id da categoria escolhida, criando a nova se for o caso.
export async function resolverCategoria(form, cats, tipo) {
  const valor = form.querySelector('select[name="categoria"]').value;
  if (valor !== NOVA) return valor || null;
  const nome = form.querySelector('input[name="nova_categoria"]').value.trim();
  if (!nome) throw new Error('Informe o nome da nova categoria.');
  const existente = cats.find((c) => c.tipo === tipo && c.nome.toLowerCase() === nome.toLowerCase());
  if (existente) return existente.id;
  const nova = await db.insert('categorias', { nome, tipo });
  cats.push(nova);
  cats.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return nova.id;
}

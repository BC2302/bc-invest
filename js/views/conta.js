// Minha conta
import * as supa from '../supa.js';
import { cartaoAvisos, desativar } from '../push.js';
import { esc, tabbar, topbar, icon, toast, busy } from '../ui.js';

export function renderConta(root, ctx) {
  const email = ctx.user?.email || '';
  root.innerHTML = `<main class="screen">
    ${topbar('Minha conta')}
    <section class="card center">
      <div class="result-box">
        <div class="logo-mark lg" aria-hidden="true">${esc((ctx.perfil?.nome || email || '?').trim().charAt(0).toUpperCase())}</div>
        <span class="goal-name">${esc(ctx.perfil?.nome || 'Sem nome')}</span>
        <span class="small">${esc(email)}</span>
      </div>
    </section>

    <section class="section"><h2 class="h-section">Avisos</h2><div id="avisos"></div></section>

    <form class="form" id="f-nome" novalidate>
      <h2 class="h-section">Seu nome</h2>
      <label class="field">Como quer ser chamado
        <input name="nome" maxlength="60" autocomplete="given-name" value="${esc(ctx.perfil?.nome || '')}"></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn outline" type="submit">Salvar nome</button>
    </form>

    <form class="form" id="f-senha" novalidate>
      <h2 class="h-section">Alterar senha</h2>
      <label class="field">Nova senha
        <input name="password" type="password" autocomplete="new-password" minlength="6"></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn outline" type="submit">Alterar senha</button>
    </form>

    <button class="btn danger" type="button" id="sair">${icon('logout', 18)} Sair da conta</button>
    <p class="fine">A BC INVEST é uma ferramenta de organização e educação financeira e não faz recomendação de investimentos. Seus dados são privados e só você tem acesso a eles.</p>
  </main>${tabbar('conta')}`;

  const fn = root.querySelector('#f-nome');
  fn.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = fn.nome.value.trim();
    const err = fn.querySelector('.form-error');
    if (!nome) { err.textContent = 'Informe seu nome.'; err.hidden = false; return; }
    try {
      await busy(fn.querySelector('button'), async () => {
        const upd = await supa.db.update('perfis', ctx.user.id, { nome });
        if (!upd) await supa.db.insert('perfis', { id: ctx.user.id, nome });
      });
      ctx.setPerfil({ nome });
      toast('Nome atualizado.');
      ctx.refresh();
    } catch (ex) { err.textContent = supa.mensagemErro(ex); err.hidden = false; }
  });

  const fs = root.querySelector('#f-senha');
  fs.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = fs.password.value;
    const err = fs.querySelector('.form-error');
    if (p.length < 6) { err.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; err.hidden = false; return; }
    try {
      await busy(fs.querySelector('button'), () => supa.updatePassword(p));
      fs.reset(); err.hidden = true;
      toast('Senha alterada.');
    } catch (ex) { err.textContent = supa.mensagemErro(ex); err.hidden = false; }
  });

  cartaoAvisos(root.querySelector('#avisos'));
  root.querySelector('#sair').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    await desativar();
    supa.signOut();
  });
}

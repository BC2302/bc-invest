// Telas de entrar, criar conta, recuperar senha e nova senha
import * as supa from '../supa.js';
import { esc, busy, toast } from '../ui.js';

function marca() {
  return `<div class="auth-brand">
    <div class="logo-mark lg">BC</div>
    <span class="brand-name metal">BC INVEST</span>
    <p class="auth-tag">Organize hoje. Construa patrimônio para a vida toda.</p>
  </div>`;
}

export function renderAuth(root, { mensagem } = {}) {
  let modo = 'entrar';
  let aviso = mensagem || null;

  function desenhar() {
    const titulo = { entrar: 'Entrar', cadastrar: 'Criar conta', recuperar: 'Recuperar senha' }[modo];
    root.innerHTML = `<main class="auth">
      ${marca()}
      ${modo !== 'recuperar' ? `<div class="segmented" role="tablist" aria-label="Acesso">
        <button type="button" role="tab" data-modo="entrar" aria-selected="${modo === 'entrar'}">Entrar</button>
        <button type="button" role="tab" data-modo="cadastrar" aria-selected="${modo === 'cadastrar'}">Criar conta</button>
      </div>` : `<h1 class="h-section" style="text-align:center">${titulo}</h1>`}
      <form class="form" novalidate>
        ${modo === 'cadastrar' ? `<label class="field">Seu nome
          <input name="nome" autocomplete="given-name" required maxlength="60"></label>` : ''}
        <label class="field">E-mail
          <input name="email" type="email" autocomplete="email" inputmode="email" required></label>
        ${modo !== 'recuperar' ? `<label class="field">Senha
          <input name="password" type="password" autocomplete="${modo === 'cadastrar' ? 'new-password' : 'current-password'}" minlength="6" required></label>` : ''}
        ${aviso ? `<p class="${aviso.tipo === 'ok' ? 'form-ok' : 'form-error'}" role="alert">${esc(aviso.texto)}</p>` : ''}
        <button class="btn" type="submit">${modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Criar minha conta' : 'Enviar link'}</button>
      </form>
      <div style="text-align:center">
        ${modo === 'entrar' ? '<button class="link-btn" type="button" data-modo="recuperar">Esqueci minha senha</button>' : ''}
        ${modo === 'recuperar' ? '<button class="link-btn" type="button" data-modo="entrar">Voltar para entrar</button>' : ''}
      </div>
      ${modo === 'cadastrar' ? '<p class="fine" style="text-align:center">A BC INVEST é uma ferramenta de organização e educação financeira. Não fazemos recomendação de investimentos.</p>' : ''}
    </main>`;

    root.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => {
      modo = b.dataset.modo; aviso = null; desenhar();
      root.querySelector('input')?.focus();
    }));

    const form = root.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const email = String(f.get('email') || '').trim();
      const password = String(f.get('password') || '');
      const nome = String(f.get('nome') || '').trim();
      const erro = (t) => { aviso = { tipo: 'erro', texto: t }; desenhar(); preencher({ email, nome }); };

      if (modo === 'cadastrar' && !nome) return erro('Informe seu nome.');
      if (!/^\S+@\S+\.\S+$/.test(email)) return erro('Informe um e-mail válido.');
      if (modo !== 'recuperar' && password.length < 6) return erro('A senha precisa ter pelo menos 6 caracteres.');

      const btn = form.querySelector('button[type=submit]');
      try {
        await busy(btn, async () => {
          if (modo === 'entrar') {
            await supa.signIn({ email, password });
          } else if (modo === 'cadastrar') {
            const r = await supa.signUp({ nome, email, password });
            if (r.confirmar) {
              modo = 'entrar';
              aviso = { tipo: 'ok', texto: `Conta criada! Enviamos um link de confirmação para ${email}. Confirme e depois entre.` };
              desenhar(); preencher({ email });
            } else {
              toast('Conta criada. Bem-vindo à BC INVEST!');
            }
          } else {
            await supa.recoverPassword(email);
            modo = 'entrar';
            aviso = { tipo: 'ok', texto: 'Se houver uma conta com esse e-mail, você vai receber um link para criar uma nova senha.' };
            desenhar(); preencher({ email });
          }
        });
      } catch (err) {
        erro(supa.mensagemErro(err));
      }
    });
  }

  function preencher(v) {
    for (const [k, val] of Object.entries(v)) {
      const el = root.querySelector(`input[name="${k}"]`);
      if (el && val) el.value = val;
    }
  }

  desenhar();
}

export function renderNovaSenha(root, { done }) {
  root.innerHTML = `<main class="auth">
    ${marca()}
    <h1 class="h-section" style="text-align:center">Criar nova senha</h1>
    <form class="form" novalidate>
      <label class="field">Nova senha
        <input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
      <label class="field">Repita a nova senha
        <input name="password2" type="password" autocomplete="new-password" minlength="6" required></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn" type="submit">Salvar nova senha</button>
    </form>
  </main>`;
  const form = root.querySelector('form');
  const err = form.querySelector('.form-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = form.password.value;
    const p2 = form.password2.value;
    const falha = (t) => { err.textContent = t; err.hidden = false; };
    if (p1.length < 6) return falha('A senha precisa ter pelo menos 6 caracteres.');
    if (p1 !== p2) return falha('As senhas não são iguais.');
    try {
      await busy(form.querySelector('button'), () => supa.updatePassword(p1));
      toast('Senha alterada com sucesso.');
      done();
    } catch (ex) { falha(supa.mensagemErro(ex)); }
  });
}

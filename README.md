# BC INVEST

App web de organização financeira e investimentos de longo prazo. Funciona no navegador do celular e do computador, e pode ser instalado na tela inicial como um app.

## O que já funciona

- Criar conta, entrar, sair, recuperar e alterar a senha
- **Início:** saldo do mês, receitas e despesas, reserva de emergência e dica do dia
- **Gestão de gastos:** lançamentos de receitas e despesas, navegação por mês, categorias e limite mensal por categoria
- **Metas:** metas com valor-alvo e prazo, quanto guardar por mês, reserva de emergência
- **Simuladores:** juros compostos e "quanto investir por mês"

## Como é feito

- Páginas simples (HTML, CSS e JavaScript), sem etapa de build
- **Supabase** para login e banco de dados. Cada usuário só acessa os próprios dados (Row Level Security)
- Estrutura do banco em `supabase/schema.sql`
- Dados de conexão em `js/config.js` (a URL do projeto e a chave pública "anon")

## Publicar

Qualquer hospedagem de site estático serve (Render, Netlify, GitHub Pages). No Render: *Static Site*, com Publish directory `.` e sem comando de build.

No Supabase, em *Authentication › URL Configuration*, coloque o endereço do site em **Site URL** e em **Redirect URLs**, para que os links de confirmação de e-mail e de nova senha voltem para o app.

## Testes

`python3 tests/e2e.py` roda o app contra um Supabase falso (`tests/mock_supabase.py`) e navega por todas as telas com o Playwright.

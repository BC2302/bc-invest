-- =====================================================================
-- BC INVEST — estrutura do banco de dados (Supabase / Postgres)
-- Cada cliente só enxerga e altera os próprios dados (Row Level Security).
-- =====================================================================

-- ---------- Perfis ----------------------------------------------------
create table if not exists public.perfis (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null default '',
  criado_em   timestamptz not null default now()
);

-- ---------- Categorias (com orçamento mensal opcional) ----------------
create table if not exists public.categorias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome        text not null check (char_length(nome) between 1 and 40),
  tipo        text not null check (tipo in ('despesa', 'receita')),
  orcamento   numeric(14,2) check (orcamento is null or orcamento >= 0),
  criado_em   timestamptz not null default now(),
  unique (user_id, tipo, nome)
);
create index if not exists categorias_user_idx on public.categorias (user_id);

-- ---------- Lançamentos (receitas e despesas) --------------------------
create table if not exists public.lancamentos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo          text not null check (tipo in ('despesa', 'receita')),
  descricao     text not null check (char_length(descricao) between 1 and 80),
  valor         numeric(14,2) not null check (valor > 0),
  data          date not null default current_date,
  categoria_id  uuid references public.categorias (id) on delete set null,
  criado_em     timestamptz not null default now()
);
create index if not exists lancamentos_user_data_idx on public.lancamentos (user_id, data desc);
create index if not exists lancamentos_categoria_idx on public.lancamentos (categoria_id);

-- ---------- Metas ------------------------------------------------------
create table if not exists public.metas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome          text not null check (char_length(nome) between 1 and 60),
  valor_alvo    numeric(14,2) not null check (valor_alvo > 0),
  valor_atual   numeric(14,2) not null default 0 check (valor_atual >= 0),
  prazo         date,
  is_reserva    boolean not null default false,
  criado_em     timestamptz not null default now()
);
create index if not exists metas_user_idx on public.metas (user_id);

-- ---------- Segurança: cada usuário só acessa o que é dele -------------
alter table public.perfis      enable row level security;
alter table public.categorias  enable row level security;
alter table public.lancamentos enable row level security;
alter table public.metas       enable row level security;

drop policy if exists "perfil proprio" on public.perfis;
create policy "perfil proprio" on public.perfis
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "categorias proprias" on public.categorias;
create policy "categorias proprias" on public.categorias
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "lancamentos proprios" on public.lancamentos;
create policy "lancamentos proprios" on public.lancamentos
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "metas proprias" on public.metas;
create policy "metas proprias" on public.metas
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Lançamento só pode usar categoria do próprio usuário
create or replace function public.checa_categoria_do_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.categoria_id is not null and not exists (
    select 1 from public.categorias c
    where c.id = new.categoria_id and c.user_id = new.user_id
  ) then
    raise exception 'Categoria inválida';
  end if;
  return new;
end;
$$;

drop trigger if exists lancamentos_checa_categoria on public.lancamentos;
create trigger lancamentos_checa_categoria
  before insert or update on public.lancamentos
  for each row execute function public.checa_categoria_do_usuario();

-- ---------- Novo cadastro: cria perfil e categorias padrão -------------
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), ''));

  insert into public.categorias (user_id, nome, tipo) values
    (new.id, 'Moradia',     'despesa'),
    (new.id, 'Alimentação', 'despesa'),
    (new.id, 'Transporte',  'despesa'),
    (new.id, 'Saúde',       'despesa'),
    (new.id, 'Educação',    'despesa'),
    (new.id, 'Lazer',       'despesa'),
    (new.id, 'Outros',      'despesa'),
    (new.id, 'Salário',     'receita'),
    (new.id, 'Renda extra', 'receita'),
    (new.id, 'Rendimentos', 'receita');
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.novo_usuario();

revoke execute on function public.novo_usuario() from public, anon, authenticated;
revoke execute on function public.checa_categoria_do_usuario() from public, anon, authenticated;

-- anon não precisa de acesso às tabelas
revoke all on public.perfis, public.categorias, public.lancamentos, public.metas from anon;

-- ---------- Saldo total disponível (todos os lançamentos do usuário) ----
create or replace function public.resumo_geral()
returns table (receitas numeric, despesas numeric)
language sql stable security invoker set search_path = '' as $$
  select
    coalesce(sum(l.valor) filter (where l.tipo = 'receita'), 0) as receitas,
    coalesce(sum(l.valor) filter (where l.tipo = 'despesa'), 0) as despesas
  from public.lancamentos l
  where l.user_id = (select auth.uid());
$$;

revoke execute on function public.resumo_geral() from public, anon;
grant execute on function public.resumo_geral() to authenticated;

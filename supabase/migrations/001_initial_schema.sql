create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_pessoa_enum') then
    create type tipo_pessoa_enum as enum ('fisica', 'juridica');
  end if;
end $$;

create table if not exists public.agricultores (
  id uuid primary key default gen_random_uuid(),
  nome_completo text not null,
  data_nascimento date not null,
  email text not null unique,
  tipo_pessoa tipo_pessoa_enum not null,
  documento text not null unique,
  created_at timestamptz default now()
);

create table if not exists public.fazendas (
  id uuid primary key default gen_random_uuid(),
  agricultor_id uuid not null references public.agricultores(id) on delete cascade,
  nome_fazenda text not null,
  tipo_pessoa tipo_pessoa_enum not null,
  documento text,
  cep text not null,
  unidade_federativa char(2) not null,
  bairro text not null,
  municipio text not null,
  area_total_plantacao numeric(10,2) not null,
  telefone text not null,
  principal_plantacao text not null,
  created_at timestamptz default now()
);

create index if not exists fazendas_agricultor_id_idx
on public.fazendas(agricultor_id);

alter table public.agricultores enable row level security;
alter table public.fazendas enable row level security;

drop policy if exists "Agricultor le o proprio cadastro" on public.agricultores;
create policy "Agricultor le o proprio cadastro"
on public.agricultores
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Agricultor cria o proprio cadastro" on public.agricultores;
create policy "Agricultor cria o proprio cadastro"
on public.agricultores
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Agricultor atualiza o proprio cadastro" on public.agricultores;
create policy "Agricultor atualiza o proprio cadastro"
on public.agricultores
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Agricultor le as proprias fazendas" on public.fazendas;
create policy "Agricultor le as proprias fazendas"
on public.fazendas
for select
to authenticated
using (auth.uid() = agricultor_id);

drop policy if exists "Agricultor cria as proprias fazendas" on public.fazendas;
create policy "Agricultor cria as proprias fazendas"
on public.fazendas
for insert
to authenticated
with check (auth.uid() = agricultor_id);

drop policy if exists "Agricultor atualiza as proprias fazendas" on public.fazendas;
create policy "Agricultor atualiza as proprias fazendas"
on public.fazendas
for update
to authenticated
using (auth.uid() = agricultor_id)
with check (auth.uid() = agricultor_id);

drop policy if exists "Agricultor apaga as proprias fazendas" on public.fazendas;
create policy "Agricultor apaga as proprias fazendas"
on public.fazendas
for delete
to authenticated
using (auth.uid() = agricultor_id);

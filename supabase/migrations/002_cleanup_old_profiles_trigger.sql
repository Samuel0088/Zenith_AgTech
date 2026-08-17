drop trigger if exists on_auth_user_created_create_profile on auth.users;
drop function if exists public.create_profile_for_new_user();

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

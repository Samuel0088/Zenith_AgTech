alter table public.fazendas enable row level security;

drop policy if exists "DEV anon select fazendas" on public.fazendas;
create policy "DEV anon select fazendas"
on public.fazendas
for select
to anon
using (true);

drop policy if exists "DEV anon insert fazendas" on public.fazendas;
create policy "DEV anon insert fazendas"
on public.fazendas
for insert
to anon
with check (true);

drop policy if exists "DEV anon update fazendas" on public.fazendas;
create policy "DEV anon update fazendas"
on public.fazendas
for update
to anon
using (true)
with check (true);

drop policy if exists "DEV anon delete fazendas" on public.fazendas;
create policy "DEV anon delete fazendas"
on public.fazendas
for delete
to anon
using (true);

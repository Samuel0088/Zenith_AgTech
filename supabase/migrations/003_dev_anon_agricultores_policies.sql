alter table public.agricultores enable row level security;

drop policy if exists "DEV anon select agricultores" on public.agricultores;
create policy "DEV anon select agricultores"
on public.agricultores
for select
to anon
using (true);

drop policy if exists "DEV anon insert agricultores" on public.agricultores;
create policy "DEV anon insert agricultores"
on public.agricultores
for insert
to anon
with check (true);

drop policy if exists "DEV anon update agricultores" on public.agricultores;
create policy "DEV anon update agricultores"
on public.agricultores
for update
to anon
using (true)
with check (true);

drop policy if exists "DEV anon delete agricultores" on public.agricultores;
create policy "DEV anon delete agricultores"
on public.agricultores
for delete
to anon
using (true);

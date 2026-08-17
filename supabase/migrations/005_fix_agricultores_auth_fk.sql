-- Desenvolvimento: remova registros orfaos antes de recriar a FK.
-- Orfaos aparecem quando uma tentativa antiga criou dados inconsistentes
-- ou quando a FK foi criada apontando para a tabela errada.

delete from public.fazendas f
where not exists (
  select 1
  from auth.users u
  where u.id = f.agricultor_id
);

delete from public.agricultores a
where not exists (
  select 1
  from auth.users u
  where u.id = a.id
);

alter table public.agricultores
drop constraint if exists agricultores_id_fkey;

alter table public.agricultores
add constraint agricultores_id_fkey
foreign key (id)
references auth.users(id)
on delete cascade;

alter table public.fazendas
drop constraint if exists fazendas_agricultor_id_fkey;

alter table public.fazendas
add constraint fazendas_agricultor_id_fkey
foreign key (agricultor_id)
references public.agricultores(id)
on delete cascade;

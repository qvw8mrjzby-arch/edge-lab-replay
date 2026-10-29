-- Edge Lab Replay – Sync einrichten (einmalig im Supabase SQL Editor ausführen)
-- Legt eine eigene Tabelle und einen privaten Foto-Ordner an.
-- Das Edge-Lab-Journal (Tabellen trades, strategies, settings, Bucket shots) wird nicht verändert.

create table if not exists public.elr_items (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('trade','session','strategy','settings','photo','meta')),
  id text not null check (char_length(id) between 1 and 200),
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);
create index if not exists elr_items_user_updated on public.elr_items (user_id, updated_at);
alter table public.elr_items enable row level security;

drop policy if exists "elr eigene lesen" on public.elr_items;
drop policy if exists "elr eigene anlegen" on public.elr_items;
drop policy if exists "elr eigene aendern" on public.elr_items;
drop policy if exists "elr eigene loeschen" on public.elr_items;
create policy "elr eigene lesen" on public.elr_items for select to authenticated using (user_id = (select auth.uid()));
create policy "elr eigene anlegen" on public.elr_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy "elr eigene aendern" on public.elr_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "elr eigene loeschen" on public.elr_items for delete to authenticated using (user_id = (select auth.uid()));

-- Serverzeit beim Schreiben setzen, damit der Abgleich nicht von Geräte-Uhren abhängt
create or replace function public.elr_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists elr_items_touch on public.elr_items;
create trigger elr_items_touch before insert or update on public.elr_items for each row execute function public.elr_touch();

-- Privater Speicher für Fotos: Ordner = Nutzer-ID
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('elr-photos', 'elr-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "elr fotos lesen" on storage.objects;
drop policy if exists "elr fotos hochladen" on storage.objects;
drop policy if exists "elr fotos aendern" on storage.objects;
drop policy if exists "elr fotos loeschen" on storage.objects;
create policy "elr fotos lesen" on storage.objects for select to authenticated using (bucket_id = 'elr-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "elr fotos hochladen" on storage.objects for insert to authenticated with check (bucket_id = 'elr-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "elr fotos aendern" on storage.objects for update to authenticated using (bucket_id = 'elr-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "elr fotos loeschen" on storage.objects for delete to authenticated using (bucket_id = 'elr-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

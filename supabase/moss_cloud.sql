-- MOSS Studio data is separate from existing application tables.
create table public.moss_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_id text not null,
  storage_path text not null,
  prompt text not null,
  aspect_ratio text not null,
  width integer not null,
  height integer not null,
  steps integer not null,
  cfg numeric not null,
  seed bigint not null,
  elapsed numeric,
  image_model text not null default 'moss_image_5b',
  created_at timestamptz not null default now(),
  constraint moss_images_user_prompt_unique unique (user_id, prompt_id),
  constraint moss_images_own_path check (split_part(storage_path, '/', 1) = user_id::text)
);
create index moss_images_user_created_idx on public.moss_images(user_id, created_at desc);
alter table public.moss_images enable row level security;
grant select, insert, update, delete on public.moss_images to authenticated;
create policy moss_images_select_own on public.moss_images for select to authenticated using ((select auth.uid()) = user_id);
create policy moss_images_insert_own on public.moss_images for insert to authenticated with check ((select auth.uid()) = user_id);
create policy moss_images_update_own on public.moss_images for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy moss_images_delete_own on public.moss_images for delete to authenticated using ((select auth.uid()) = user_id);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moss-images', 'moss-images', false, 26214400, array['image/png']);
create policy moss_images_storage_select on storage.objects for select to authenticated using (bucket_id = 'moss-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy moss_images_storage_insert on storage.objects for insert to authenticated with check (bucket_id = 'moss-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy moss_images_storage_update on storage.objects for update to authenticated using (bucket_id = 'moss-images' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'moss-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy moss_images_storage_delete on storage.objects for delete to authenticated using (bucket_id = 'moss-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

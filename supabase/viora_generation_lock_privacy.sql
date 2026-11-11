-- Keep privileged implementation in an unexposed schema; API wrappers run as invoker.
create function viora_private.claim_generation() returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); claim uuid := gen_random_uuid(); granted uuid;
begin
  if uid is null then raise exception 'authentication required'; end if;
  insert into viora_private.generation_submit_lock as existing (id, holder, lease, expires_at)
  values (true, uid, claim, now() + interval '90 seconds')
  on conflict (id) do update set holder = excluded.holder, lease = excluded.lease, expires_at = excluded.expires_at
    where existing.expires_at < now()
  returning lease into granted;
  return granted;
end;
$$;
create function viora_private.release_generation(claim uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  delete from viora_private.generation_submit_lock where holder = (select auth.uid()) and lease = claim;
end;
$$;
revoke all on function viora_private.claim_generation() from public, anon;
revoke all on function viora_private.release_generation(uuid) from public, anon;
grant usage on schema viora_private to authenticated;
grant execute on function viora_private.claim_generation() to authenticated;
grant execute on function viora_private.release_generation(uuid) to authenticated;
create or replace function public.viora_claim_generation() returns uuid
language sql security invoker set search_path = '' as $$ select viora_private.claim_generation() $$;
create or replace function public.viora_release_generation(claim uuid) returns void
language sql security invoker set search_path = '' as $$ select viora_private.release_generation(claim) $$;
revoke all on function public.viora_claim_generation() from public, anon;
revoke all on function public.viora_release_generation(uuid) from public, anon;
grant execute on function public.viora_claim_generation() to authenticated;
grant execute on function public.viora_release_generation(uuid) to authenticated;

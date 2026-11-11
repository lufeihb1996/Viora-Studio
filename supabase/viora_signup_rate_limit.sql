-- Signup rate limiting for Viora accounts. This does not change project-wide Auth settings.
create schema if not exists viora_private;
revoke all on schema viora_private from public, anon, authenticated;
create table viora_private.signup_rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
alter table viora_private.signup_rate_limits enable row level security;
create function public.viora_check_signup_limit(ip_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  slot timestamptz := date_trunc('hour', now());
  global_hits integer;
  ip_hits integer;
begin
  delete from viora_private.signup_rate_limits where window_start < slot - interval '2 hours';
  insert into viora_private.signup_rate_limits as t (bucket, window_start, hits)
    values ('global', slot, 1)
    on conflict (bucket, window_start) do update set hits = t.hits + 1
      where t.hits < 30
    returning hits into global_hits;
  if global_hits is null then return false; end if;
  if ip_hash is not null and ip_hash ~ '^[a-f0-9]{64}$' then
    insert into viora_private.signup_rate_limits as t (bucket, window_start, hits)
      values ('ip:' || ip_hash, slot, 1)
      on conflict (bucket, window_start) do update set hits = t.hits + 1
        where t.hits < 5
      returning hits into ip_hits;
    if ip_hits is null then return false; end if;
  end if;
  return true;
end;
$$;
revoke all on function public.viora_check_signup_limit(text) from public, anon, authenticated;
grant execute on function public.viora_check_signup_limit(text) to service_role;

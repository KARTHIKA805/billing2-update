-- Confirm sample staff, set password Suvai123, and assign city/branch.
-- Super Admin is not changed.

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  rec record;
  auth_id uuid;
  user_password text := 'Suvai123';
begin
  for rec in
    select * from (values
      ('chennai_city_manager@gmail.com', 'city_manager', '11111111-1111-1111-1111-111111111111'::uuid, null::uuid),
      ('chennai_tnagar_admin@gmail.com', 'branch_admin', '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid),
      ('chennai_tnagar_staff@gmail.com', 'employee', '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid),
      ('cbe_rspuram_admin@gmail.com', 'branch_admin', '22222222-2222-2222-2222-222222222222'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid),
      ('chennai_anna_nagar@gmail.com', 'employee', '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid)
    ) as t(email, role, city_id, branch_id)
  loop
    select id into auth_id
    from auth.users
    where lower(email) = lower(rec.email)
    order by email_confirmed_at nulls last, created_at
    limit 1;

    if auth_id is null then
      auth_id := gen_random_uuid();

      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000',
        auth_id,
        'authenticated',
        'authenticated',
        rec.email,
        extensions.crypt(user_password, extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('role', rec.role),
        now(),
        now(),
        '',
        '',
        '',
        ''
      );
    else
      update auth.users
      set
        encrypted_password = extensions.crypt(user_password, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmation_token = '',
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', rec.role),
        updated_at = now()
      where id = auth_id;
    end if;

    if not exists (select 1 from auth.identities where user_id = auth_id and provider = 'email') then
      insert into auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) values (
        gen_random_uuid(),
        auth_id,
        jsonb_build_object('sub', auth_id::text, 'email', rec.email),
        'email',
        auth_id::text,
        now(),
        now(),
        now()
      );
    end if;

    insert into public.user_profiles (id, email, role, city_id, branch_id)
    values (auth_id, rec.email, rec.role, rec.city_id, rec.branch_id)
    on conflict (id) do update
    set
      email = excluded.email,
      role = excluded.role,
      city_id = excluded.city_id,
      branch_id = excluded.branch_id,
      updated_at = now();
  end loop;
end $$;

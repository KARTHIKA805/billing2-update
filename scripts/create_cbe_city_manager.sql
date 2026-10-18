-- Coimbatore City Manager. Auth signup rejects passwords shorter than 6 characters,
-- so this SQL sets password Suvai and confirms the email.
-- Run in the NEW project only: https://supabase.com/dashboard/project/ikzycnnysyajibxgjvxc/sql/new

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  auth_id uuid;
  user_email text := 'cbe_city_manager@gmail.com';
  user_password text := 'Suvai';
  user_role text := 'city_manager';
  user_city uuid := '22222222-2222-2222-2222-222222222222';
begin
  select id into auth_id
  from auth.users
  where lower(email) = lower(user_email)
  order by created_at
  limit 1;

  if auth_id is null then
    auth_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      auth_id,
      'authenticated',
      'authenticated',
      user_email,
      extensions.crypt(user_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role', user_role, 'city_id', user_city::text),
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
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', user_role, 'city_id', user_city::text),
      updated_at = now()
    where id = auth_id;
  end if;

  if not exists (select 1 from auth.identities where user_id = auth_id and provider = 'email') then
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      auth_id,
      jsonb_build_object('sub', auth_id::text, 'email', user_email),
      'email',
      auth_id::text,
      now(),
      now(),
      now()
    );
  end if;

  insert into public.user_profiles (id, email, role, city_id, branch_id)
  values (auth_id, user_email, user_role, user_city, null)
  on conflict (id) do update
  set
    email = excluded.email,
    role = excluded.role,
    city_id = excluded.city_id,
    branch_id = null,
    updated_at = now();
end $$;

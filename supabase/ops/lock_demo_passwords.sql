-- ============================================================================
-- One-off: give every demo account a random password nobody knows.
--
-- Run ONCE in Supabase → SQL Editor, and only AFTER
--   1. the migrations are applied (supabase db push), and
--   2. the demo-session edge function is deployed, and
--   3. the app that opens the demo through it is live (the merged PR on Vercel).
-- Until then the live site still signs in with the old shared password.
--
-- After this, the demo can only be opened through the e-mail gate; the sign-in
-- form and the Auth API can't open a demo account. Safe to run again (each run
-- picks new random passwords). Ends any open demo sessions' refresh, too: a
-- visitor simply opens the demo again.
-- ============================================================================
begin;
set local app.allow_demo_password_reset = 'on';   -- the one exception to the demo-password lock

update auth.users
set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf'))
where email like '%@demo.local';

commit;

-- Check: every demo account now has a password no one was told.
select email, left(encrypted_password, 7) || '…' as password_hash, updated_at
from auth.users
where email like '%@demo.local'
order by email;

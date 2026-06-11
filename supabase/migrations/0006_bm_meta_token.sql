-- Per-business-manager Meta access token storage.
--
-- We store the token AES-256-GCM encrypted at the app layer (see
-- src/lib/crypto.ts). The DB only sees opaque base64 text — never plaintext.
-- meta_token_updated_at lets the UI show "set/rotated when" without ever
-- revealing the token itself.

alter table public.business_managers
  add column if not exists meta_access_token_encrypted text,
  add column if not exists meta_token_updated_at timestamptz;

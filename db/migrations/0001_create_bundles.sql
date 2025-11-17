-- Initial schema for storing JS bundle metadata for codepush-style updates

create table if not exists bundles (
  id           bigserial primary key,
  platform     text        not null, -- e.g. 'android', 'ios'
  version      integer     not null, -- monotonically increasing bundle number per platform
  bundle_url   text        not null, -- public Supabase Storage URL to the compressed bundle
  checksum     text                 , -- optional integrity hash (e.g. sha256 of raw JS bundle)
  created_at   timestamptz not null default now()
);

create unique index if not exists bundles_platform_version_idx
  on bundles(platform, version);


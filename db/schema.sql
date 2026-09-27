-- Tha Artist Portal — PostgreSQL Schema
-- Copyright © 2026 BOLAJI B ADEEKO LLC
-- Run once against your Railway Postgres database

CREATE TABLE IF NOT EXISTS artist_logins (
  login_id      SERIAL PRIMARY KEY,
  artist_name   TEXT NOT NULL,
  artist_email  TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  artist_id     INT,
  role          TEXT NOT NULL DEFAULT 'Artist',
  tap_id        TEXT,
  created_date  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artists (
  artist_id             SERIAL PRIMARY KEY,
  artist_name           TEXT NOT NULL,
  artist_email          TEXT NOT NULL UNIQUE,
  artist_phone          TEXT,
  artist_city           TEXT,
  artist_state          TEXT,
  artist_country        TEXT,
  instagram_url         TEXT,
  tiktok_url            TEXT,
  spotify_url           TEXT,
  apple_url             TEXT,
  youtube_url           TEXT,
  genre_specialty       TEXT,
  creative_field        TEXT,
  creative_subfield     TEXT,
  bio                   TEXT,
  website_url           TEXT,
  portfolio_url         TEXT,
  daw_software          TEXT,
  engineer_type         TEXT,
  studio_name           TEXT,
  label_name            TEXT,
  label_owner           TEXT,
  roster_size           INT,
  manager_name          TEXT,
  ascap_id              TEXT,
  ascap_id_2            TEXT,
  signed_2_label        TEXT,
  years_experience      INT,
  tap_id                TEXT,
  tap_id_link           TEXT,
  role                  TEXT DEFAULT 'Artist',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artist_registration_staging (
  staging_id      SERIAL PRIMARY KEY,
  artist_name     TEXT NOT NULL,
  artist_email    TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  artist_phone    TEXT,
  artist_city     TEXT,
  artist_state    TEXT,
  artist_country  TEXT,
  role            TEXT NOT NULL DEFAULT 'Artist',
  instagram_url   TEXT,
  tiktok_url      TEXT,
  spotify_url     TEXT,
  apple_url       TEXT,
  youtube_url     TEXT,
  website_url     TEXT,
  portfolio_url   TEXT,
  bio             TEXT,
  genre_specialty TEXT,
  creative_field  TEXT,
  creative_subfield TEXT,
  daw_software    TEXT,
  engineer_type   TEXT,
  studio_name     TEXT,
  label_name      TEXT,
  label_owner     TEXT,
  roster_size     INT,
  manager_name    TEXT,
  ascap_id        TEXT,
  ascap_id_2      TEXT,
  signed_2_label  TEXT,
  years_experience INT,
  tap_id_link     TEXT,
  status          TEXT NOT NULL DEFAULT 'Pending',
  reject_reason   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS songs (
  song_id          SERIAL PRIMARY KEY,
  artist_id        INT NOT NULL,
  song_name        TEXT NOT NULL,
  album            TEXT,
  release_date     DATE,
  duration_of_song TEXT,
  isrc             TEXT,
  featured_artist  TEXT,
  writers_credit   TEXT,
  producer_name    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS streams (
  stream_id          SERIAL PRIMARY KEY,
  artist_id          INT NOT NULL,
  song_id            INT,
  streaming_platform TEXT,
  stream_count       INT DEFAULT 0,
  date_recorded      DATE
);

CREATE TABLE IF NOT EXISTS royalties (
  royalty_id          SERIAL PRIMARY KEY,
  artist_id           INT NOT NULL,
  streaming_platform  TEXT,
  label_name          TEXT,
  amount              NUMERIC(10,2) DEFAULT 0,
  payment_date        DATE,
  status_on_royaltiy  TEXT DEFAULT 'Pending'
);

CREATE TABLE IF NOT EXISTS contracts (
  contract_id                  SERIAL PRIMARY KEY,
  artist_id                    INT NOT NULL,
  label_name                   TEXT,
  deal_type                    TEXT,
  ownership_percent_artist     NUMERIC(5,2),
  ownership_percent_manager    NUMERIC(5,2),
  ownership_percent_label      NUMERIC(5,2),
  artist_lawyer                TEXT,
  manager_lawyer               TEXT,
  contract_start_date          DATE,
  contract_end_date            DATE
);

CREATE TABLE IF NOT EXISTS collab_requests (
  request_id        SERIAL PRIMARY KEY,
  sender_login_id   INT NOT NULL,
  sender_name       TEXT,
  sender_tap_id     TEXT,
  sender_role       TEXT,
  sender_email      TEXT,
  receiver_login_id INT NOT NULL,
  receiver_name     TEXT,
  receiver_tap_id   TEXT,
  receiver_role     TEXT,
  message           TEXT,
  status            TEXT NOT NULL DEFAULT 'Pending',
  sent_at           TIMESTAMPTZ DEFAULT NOW(),
  responded_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS messages (
  message_id      SERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id       INT NOT NULL,
  sender_name     TEXT,
  receiver_id     INT NOT NULL,
  message_text    TEXT NOT NULL,
  is_read         BOOLEAN DEFAULT FALSE,
  sent_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id SERIAL PRIMARY KEY,
  recipient_id    INT NOT NULL,
  sender_id       INT,
  sender_name     TEXT,
  type            TEXT,
  message         TEXT,
  link            TEXT,
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id               SERIAL PRIMARY KEY,
  login_id         INT NOT NULL UNIQUE,
  collab_requests  BOOLEAN DEFAULT TRUE,
  profile_views    BOOLEAN DEFAULT TRUE,
  new_messages     BOOLEAN DEFAULT TRUE,
  new_followers    BOOLEAN DEFAULT FALSE,
  new_users_city   BOOLEAN DEFAULT FALSE,
  email_alerts     BOOLEAN DEFAULT TRUE,
  push_enabled     BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         SERIAL PRIMARY KEY,
  login_id   INT NOT NULL,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT,
  auth       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_id   SERIAL PRIMARY KEY,
  login_id   INT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spotify_tokens (
  id            SERIAL PRIMARY KEY,
  login_id      INT NOT NULL UNIQUE,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  scope         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

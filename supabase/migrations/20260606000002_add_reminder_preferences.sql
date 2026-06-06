-- Add reminder preference columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reminder_24h boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_3h  boolean NOT NULL DEFAULT true;

-- Add sent-at tracking columns to sessions
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_3h_sent_at  timestamptz;

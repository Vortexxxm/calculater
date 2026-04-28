/*
  # Add end-to-end encryption for shared messages

  ## Overview
  Adds an `encrypted_content` column to `shared_messages` so messages are stored
  encrypted in the database. The `content` column is kept for backward compatibility
  but new messages will use `encrypted_content`. This ensures that even database
  administrators cannot read message contents.

  ## Changes
  - Add `encrypted_content` column to `shared_messages` (text, default '')
  - Add `iv` column for per-message initialization vector (text, default '')
  - Existing `content` column remains but will be empty for new messages

  ## Security
  - Messages are encrypted client-side before insertion
  - Database only stores ciphertext, never plaintext
  - Even with DB access, messages are unreadable without the client-side key
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shared_messages' AND column_name = 'encrypted_content'
  ) THEN
    ALTER TABLE shared_messages ADD COLUMN encrypted_content text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shared_messages' AND column_name = 'iv'
  ) THEN
    ALTER TABLE shared_messages ADD COLUMN iv text DEFAULT '';
  END IF;
END $$;

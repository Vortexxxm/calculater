/*
  # Vault App Database Schema

  ## New Tables
  - `vault_users` - Stores vault user credentials (hashed pin)
  - `vault_conversations` - Encrypted conversation threads
  - `vault_messages` - Encrypted messages with media support

  ## Security
  - RLS enabled on all tables
  - Users can only access their own data
*/

CREATE TABLE IF NOT EXISTS vault_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE vault_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own vault profile"
  ON vault_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vault profile"
  ON vault_users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vault profile"
  ON vault_users FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS vault_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  participant_name text NOT NULL DEFAULT '',
  last_message_preview text NOT NULL DEFAULT '',
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vault_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own conversations"
  ON vault_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own conversations"
  ON vault_conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own conversations"
  ON vault_conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete own conversations"
  ON vault_conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS vault_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES vault_conversations(id) ON DELETE CASCADE NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  encrypted_content text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text',
  is_sent boolean NOT NULL DEFAULT true,
  media_url text DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vault_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own messages"
  ON vault_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own messages"
  ON vault_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete own messages"
  ON vault_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_vault_messages_conversation ON vault_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_vault_conversations_owner ON vault_conversations(owner_id);

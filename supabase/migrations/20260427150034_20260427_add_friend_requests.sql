/*
  # Add Friend Requests and Friendships

  ## Overview
  Enables a friend request flow: users search for each other, send requests,
  and only chat once the request is accepted. This replaces the direct
  shared_conversations approach with a gated friendship model.

  ## New Tables

  ### `friend_requests`
  - `id` (uuid, pk)
  - `sender_id` (uuid) - who sent the request
  - `receiver_id` (uuid) - who receives the request
  - `status` (text) - 'pending', 'accepted', 'declined' (default 'pending')
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `friendships`
  - `id` (uuid, pk)
  - `user_a_id` (uuid) - first friend
  - `user_b_id` (uuid) - second friend
  - `created_at` (timestamptz)
  - Unique constraint on the pair (prevents duplicates)

  ## Modified Tables

  ### `shared_conversations`
  - Add `is_friend_chat` boolean default true to mark these as friend-to-friend chats

  ### `vault_users`
  - `email` column already added in previous migration
  - `avatar_color` column already added in previous migration

  ## Security
  - RLS enabled on all new tables
  - Users can only see requests they sent or received
  - Only the receiver can accept/decline a request
  - Users can only see friendships they are part of
  - A trigger auto-creates a shared_conversation when a friendship is formed
*/

-- Friend requests table
CREATE TABLE IF NOT EXISTS friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  receiver_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT no_self_request CHECK (sender_id <> receiver_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pair_idx
  ON friend_requests (
    LEAST(sender_id::text, receiver_id::text),
    GREATEST(sender_id::text, receiver_id::text)
  );

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own friend requests"
  ON friend_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send friend requests"
  ON friend_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Receiver can update friend request status"
  ON friend_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Friendships table
CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES auth.users(id),
  user_b_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT no_self_friend CHECK (user_a_id <> user_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx
  ON friendships (
    LEAST(user_a_id::text, user_b_id::text),
    GREATEST(user_a_id::text, user_b_id::text)
  );

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their friendships"
  ON friendships FOR SELECT
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "System can insert friendships (via trigger)"
  ON friendships FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Auto-accept: when a friend request is accepted, create friendship + shared conversation
CREATE OR REPLACE FUNCTION handle_friend_accept()
RETURNS TRIGGER AS $$
DECLARE
  convo_id uuid;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status = 'pending' OR OLD.status IS NULL) THEN
    -- Create friendship
    INSERT INTO friendships (user_a_id, user_b_id)
    VALUES (NEW.sender_id, NEW.receiver_id)
    ON CONFLICT DO NOTHING;

    -- Create shared conversation
    INSERT INTO shared_conversations (user_a_id, user_b_id)
    VALUES (NEW.sender_id, NEW.receiver_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_friend_accept ON friend_requests;
CREATE TRIGGER on_friend_accept
  AFTER UPDATE ON friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION handle_friend_accept();

-- Add is_friend_chat to shared_conversations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shared_conversations' AND column_name = 'is_friend_chat'
  ) THEN
    ALTER TABLE shared_conversations ADD COLUMN is_friend_chat boolean DEFAULT true;
  END IF;
END $$;

/*
  # Enable Realtime for shared_messages and friend_requests

  ## Overview
  The `supabase_realtime` publication has no tables, which means Supabase Realtime
  cannot deliver INSERT events to the client. This is why messages don't appear
  in real-time for the other user.

  ## Changes
  - Add `shared_messages` to the `supabase_realtime` publication
  - Add `friend_requests` to the `supabase_realtime` publication
  - Add `shared_conversations` to the `supabase_realtime` publication

  ## Security
  - RLS policies still apply to Realtime events -- users only receive events
    for rows they are allowed to see
*/

ALTER PUBLICATION supabase_realtime ADD TABLE shared_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE shared_conversations;

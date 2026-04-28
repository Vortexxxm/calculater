import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  Search, LogOut, Shield, X, UserPlus,
  UserCheck, UserX, ChevronRight, Users, Bell,
} from 'lucide-react-native';

type VaultUser = {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  avatar_color: string;
};

type FriendRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
  sender?: VaultUser;
};

type FriendWithConvo = {
  friend: VaultUser;
  conversation_id: string | null;
  last_message_at: string;
};

const AVATAR_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#64d2ff', '#bf5af2'];

function avatarColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return (name || '?')[0].toUpperCase();
}

type Tab = 'friends' | 'requests' | 'search';

export default function VaultHomeScreen() {
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<FriendWithConvo[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VaultUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingRequestIds, setPendingRequestIds] = useState<Set<string>>(new Set());
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadUser();
      return () => {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    }, [])
  );

  const loadUser = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) { router.replace('/vault/auth'); return; }
    setUserId(data.user.id);
    await loadAll(data.user.id);
    subscribeToChanges(data.user.id);
  };

  const subscribeToChanges = (uid: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel('vault_home')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${uid}` },
        () => { loadAll(uid); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `sender_id=eq.${uid}` },
        () => { loadAll(uid); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_conversations', filter: `user_a_id=eq.${uid}` },
        () => { loadFriends(uid); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_conversations', filter: `user_b_id=eq.${uid}` },
        () => { loadFriends(uid); }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shared_messages' },
        () => { loadFriends(uid); }
      )
      .subscribe();

    channelRef.current = channel;
  };

  const loadAll = async (uid: string) => {
    setLoading(true);
    await Promise.all([loadFriends(uid), loadRequests(uid), loadPendingSent(uid)]);
    setLoading(false);
  };

  const loadFriends = async (uid: string) => {
    const { data: acceptedReqs } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('status', 'accepted')
      .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`);

    if (!acceptedReqs?.length) { setFriends([]); return; }

    const friendIds = acceptedReqs.map((r: any) =>
      r.sender_id === uid ? r.receiver_id : r.sender_id
    );

    const { data: users } = await supabase.from('vault_users').select('*').in('user_id', friendIds);
    const userMap: Record<string, VaultUser> = {};
    (users || []).forEach((u: VaultUser) => { userMap[u.user_id] = u; });

    const { data: convos } = await supabase
      .from('shared_conversations')
      .select('*')
      .or(`user_a_id.eq.${uid},user_b_id.eq.${uid}`);

    const convoMap: Record<string, any> = {};
    (convos || []).forEach((c: any) => {
      const otherId = c.user_a_id === uid ? c.user_b_id : c.user_a_id;
      if (!convoMap[otherId] || new Date(c.last_message_at) > new Date(convoMap[otherId].last_message_at)) {
        convoMap[otherId] = c;
      }
    });

    const result: FriendWithConvo[] = friendIds.map((fid: string) => ({
      friend: userMap[fid] || { id: '', user_id: fid, display_name: 'Unknown', email: '', avatar_color: '#555' },
      conversation_id: convoMap[fid]?.id || null,
      last_message_at: convoMap[fid]?.last_message_at || new Date().toISOString(),
    }));

    result.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
    setFriends(result);
  };

  const loadRequests = async (uid: string) => {
    const { data } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('receiver_id', uid)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!data?.length) { setRequests([]); return; }

    const senderIds = data.map((r: any) => r.sender_id);
    const { data: users } = await supabase.from('vault_users').select('*').in('user_id', senderIds);
    const userMap: Record<string, VaultUser> = {};
    (users || []).forEach((u: VaultUser) => { userMap[u.user_id] = u; });

    const enriched = data.map((r: any) => ({ ...r, sender: userMap[r.sender_id] }));
    setRequests(enriched);
  };

  const loadPendingSent = async (uid: string) => {
    const { data } = await supabase
      .from('friend_requests')
      .select('receiver_id')
      .eq('sender_id', uid)
      .eq('status', 'pending');
    setPendingRequestIds(new Set((data || []).map((r: any) => r.receiver_id)));
  };

  const handleRefresh = async () => {
    if (!userId) return;
    setRefreshing(true);
    await loadAll(userId);
    setRefreshing(false);
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(() => performSearch(q), 400);
  };

  const performSearch = async (q: string) => {
    if (!userId) return;
    setSearching(true);
    const { data } = await supabase
      .from('vault_users')
      .select('*')
      .neq('user_id', userId)
      .or(`display_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(20);
    setSearchResults(data || []);
    setSearching(false);
  };

  const sendRequest = async (otherUser: VaultUser) => {
    if (!userId) return;
    const { error } = await supabase
      .from('friend_requests')
      .insert({ sender_id: userId, receiver_id: otherUser.user_id });
    if (!error) {
      setPendingRequestIds((prev) => new Set(prev).add(otherUser.user_id));
    }
  };

  const acceptRequest = async (req: FriendRequest) => {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', req.id);
    if (!error && userId) {
      await loadAll(userId);
    }
  };

  const declineRequest = async (req: FriendRequest) => {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', req.id);
    if (!error && userId) {
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    }
  };

  const openChat = async (f: FriendWithConvo) => {
    if (!userId) return;

    if (f.conversation_id) {
      router.push({
        pathname: '/vault/chat',
        params: { id: f.conversation_id, name: f.friend.display_name, otherId: f.friend.user_id },
      });
      return;
    }

    const { data: created } = await supabase
      .from('shared_conversations')
      .insert({ user_a_id: userId, user_b_id: f.friend.user_id, is_friend_chat: true })
      .select()
      .single();

    if (created) {
      router.push({
        pathname: '/vault/chat',
        params: { id: created.id, name: f.friend.display_name, otherId: f.friend.user_id },
      });
    }
  };

  const handleSignOut = async () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    await supabase.auth.signOut();
    router.replace('/');
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    if (now.getTime() - d.getTime() < 86400000) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const renderFriend = ({ item }: { item: FriendWithConvo }) => {
    const color = avatarColor(item.friend.user_id);
    return (
      <TouchableOpacity style={styles.convoItem} onPress={() => openChat(item)}>
        <View style={[styles.avatar, { borderColor: color + '44', backgroundColor: color + '1a' }]}>
          <Text style={[styles.avatarText, { color }]}>{initials(item.friend.display_name)}</Text>
        </View>
        <View style={styles.convoInfo}>
          <View style={styles.convoTop}>
            <Text style={styles.convoName}>{item.friend.display_name}</Text>
            <Text style={styles.convoTime}>{formatTime(item.last_message_at)}</Text>
          </View>
          <Text style={styles.convoPreview} numberOfLines={1}>
            {item.conversation_id ? 'Tap to chat' : 'Start a conversation'}
          </Text>
        </View>
        <ChevronRight color="#3a3a3c" size={18} strokeWidth={1.5} />
      </TouchableOpacity>
    );
  };

  const renderRequest = ({ item }: { item: FriendRequest }) => {
    const color = item.sender ? avatarColor(item.sender.user_id) : '#555';
    const name = item.sender?.display_name || 'Unknown';
    return (
      <View style={styles.requestItem}>
        <View style={[styles.avatar, { borderColor: color + '44', backgroundColor: color + '1a' }]}>
          <Text style={[styles.avatarText, { color }]}>{initials(name)}</Text>
        </View>
        <View style={styles.requestInfo}>
          <Text style={styles.requestName}>{name}</Text>
          <Text style={styles.requestSubtext}>wants to be your friend</Text>
        </View>
        <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptRequest(item)}>
          <UserCheck color="#30d158" size={22} strokeWidth={1.5} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.declineBtn} onPress={() => declineRequest(item)}>
          <UserX color="#ff453a" size={22} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderSearchResult = ({ item }: { item: VaultUser }) => {
    const color = avatarColor(item.user_id);
    const isPending = pendingRequestIds.has(item.user_id);
    const isFriend = friends.some((f) => f.friend.user_id === item.user_id);

    return (
      <View style={styles.userItem}>
        <View style={[styles.avatar, { borderColor: color + '44', backgroundColor: color + '1a' }]}>
          <Text style={[styles.avatarText, { color }]}>{initials(item.display_name)}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.display_name}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
        </View>
        {isFriend ? (
          <View style={styles.friendBadge}>
            <UserCheck color="#30d158" size={16} strokeWidth={2} />
            <Text style={styles.friendBadgeText}>Friends</Text>
          </View>
        ) : isPending ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>Sent</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.addBtn} onPress={() => sendRequest(item)}>
            <UserPlus color="#0a84ff" size={20} strokeWidth={1.5} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderContent = () => {
    if (loading) {
      return <View style={styles.center}><ActivityIndicator color="#0a84ff" size="large" /></View>;
    }

    if (tab === 'friends') {
      if (friends.length === 0) {
        return (
          <View style={styles.center}>
            <Users color="#3a3a3c" size={64} strokeWidth={1} />
            <Text style={styles.emptyTitle}>No Friends Yet</Text>
            <Text style={styles.emptySubtitle}>Search for users and send friend requests</Text>
            <TouchableOpacity style={styles.searchPromptBtn} onPress={() => setTab('search')}>
              <UserPlus color="#0a84ff" size={18} strokeWidth={1.5} />
              <Text style={styles.searchPromptText}>Find friends</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.friend.user_id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={renderFriend}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0a84ff" />}
        />
      );
    }

    if (tab === 'requests') {
      if (requests.length === 0) {
        return (
          <View style={styles.center}>
            <Bell color="#3a3a3c" size={64} strokeWidth={1} />
            <Text style={styles.emptyTitle}>No Requests</Text>
            <Text style={styles.emptySubtitle}>Friend requests will appear here</Text>
          </View>
        );
      }
      return (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={renderRequest}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0a84ff" />}
        />
      );
    }

    return (
      <View style={styles.searchTab}>
        <View style={styles.searchBar}>
          <Search color="#8e8e93" size={18} strokeWidth={1.5} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or email..."
            placeholderTextColor="#555"
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoFocus
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
              <X color="#555" size={16} />
            </TouchableOpacity>
          )}
        </View>
        {searching ? (
          <View style={styles.center}><ActivityIndicator color="#0a84ff" /></View>
        ) : searchResults.length === 0 && searchQuery.trim() !== '' ? (
          <View style={styles.center}>
            <Text style={styles.noResultsText}>No users found</Text>
          </View>
        ) : searchResults.length === 0 ? (
          <View style={styles.center}>
            <Search color="#3a3a3c" size={48} strokeWidth={1} />
            <Text style={styles.emptySubtitle}>Type a name or email to find users</Text>
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={renderSearchResult}
          />
        )}
      </View>
    );
  };

  const requestCount = requests.length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d0d" />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Shield color="#0a84ff" size={22} strokeWidth={1.5} />
          <Text style={styles.headerTitle}>Vault</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={styles.headerBtn}>
          <LogOut color="#8e8e93" size={20} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'friends' && styles.tabActive]}
          onPress={() => setTab('friends')}
        >
          <Users color={tab === 'friends' ? '#0a84ff' : '#8e8e93'} size={18} strokeWidth={1.5} />
          <Text style={[styles.tabText, tab === 'friends' && styles.tabTextActive]}>Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'requests' && styles.tabActive]}
          onPress={() => setTab('requests')}
        >
          <Bell color={tab === 'requests' ? '#0a84ff' : '#8e8e93'} size={18} strokeWidth={1.5} />
          <Text style={[styles.tabText, tab === 'requests' && styles.tabTextActive]}>Requests</Text>
          {requestCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{requestCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'search' && styles.tabActive]}
          onPress={() => setTab('search')}
        >
          <Search color={tab === 'search' ? '#0a84ff' : '#8e8e93'} size={18} strokeWidth={1.5} />
          <Text style={[styles.tabText, tab === 'search' && styles.tabTextActive]}>Search</Text>
        </TouchableOpacity>
      </View>

      {renderContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1e',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  headerBtn: { padding: 8 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1e',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#0a84ff' },
  tabText: { color: '#8e8e93', fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: '#0a84ff', fontWeight: '600' },
  badge: {
    backgroundColor: '#ff453a',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyTitle: { color: '#ffffff', fontSize: 20, fontWeight: '600', marginTop: 8 },
  emptySubtitle: { color: '#8e8e93', fontSize: 15 },
  searchPromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a2a3a',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#0a84ff33',
  },
  searchPromptText: { color: '#0a84ff', fontSize: 15, fontWeight: '600' },
  list: { paddingTop: 8 },
  separator: { height: 1, backgroundColor: '#1c1c1e', marginLeft: 76 },
  convoItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
  },
  avatarText: { fontSize: 20, fontWeight: '700' },
  convoInfo: { flex: 1 },
  convoTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  convoName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  convoTime: { color: '#8e8e93', fontSize: 13 },
  convoPreview: { color: '#8e8e93', fontSize: 14 },
  requestItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  requestInfo: { flex: 1 },
  requestName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  requestSubtext: { color: '#8e8e93', fontSize: 13, marginTop: 2 },
  acceptBtn: { padding: 10, marginLeft: 4 },
  declineBtn: { padding: 10, marginLeft: 2 },
  searchTab: { flex: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  searchInput: { flex: 1, color: '#ffffff', fontSize: 16 },
  noResultsText: { color: '#8e8e93', fontSize: 15 },
  userItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  userInfo: { flex: 1 },
  userName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  userEmail: { color: '#8e8e93', fontSize: 13, marginTop: 2 },
  addBtn: { padding: 10 },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#30d1581a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#30d15844',
  },
  friendBadgeText: { color: '#30d158', fontSize: 12, fontWeight: '600' },
  pendingBadge: {
    backgroundColor: '#ff9f0a1a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#ff9f0a44',
  },
  pendingBadgeText: { color: '#ff9f0a', fontSize: 12, fontWeight: '600' },
});

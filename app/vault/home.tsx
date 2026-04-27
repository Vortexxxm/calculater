import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  MessageCircle, Search, LogOut, Shield, X, UserPlus,
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
  receiver?: VaultUser;
};

type SharedConversation = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  last_message_at: string;
  other_user: VaultUser | null;
};

const AVATAR_COLORS = [
  '#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#64d2ff', '#bf5af2',
];

function avatarColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return (name || '?')[0].toUpperCase();
}

type Tab = 'chats' | 'requests';

export default function VaultHomeScreen() {
  const [tab, setTab] = useState<Tab>('chats');
  const [conversations, setConversations] = useState<SharedConversation[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VaultUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingMap, setPendingMap] = useState<Record<string, string>>({});
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadUser();
    }, [])
  );

  const loadUser = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      router.replace('/vault/auth');
      return;
    }
    setUserId(data.user.id);
    loadConversations(data.user.id);
    loadRequests(data.user.id);
    loadPendingMap(data.user.id);
  };

  const loadConversations = async (uid: string) => {
    setLoading(true);
    const { data: convos } = await supabase
      .from('shared_conversations')
      .select('*')
      .or(`user_a_id.eq.${uid},user_b_id.eq.${uid}`)
      .order('last_message_at', { ascending: false });

    if (!convos) { setLoading(false); return; }

    const otherIds = convos.map((c: any) => (c.user_a_id === uid ? c.user_b_id : c.user_a_id));
    const { data: users } = otherIds.length
      ? await supabase.from('vault_users').select('*').in('user_id', otherIds)
      : { data: [] };

    const userMap: Record<string, VaultUser> = {};
    (users || []).forEach((u: VaultUser) => { userMap[u.user_id] = u; });

    const enriched: SharedConversation[] = convos.map((c: any) => ({
      ...c,
      other_user: userMap[c.user_a_id === uid ? c.user_b_id : c.user_a_id] || null,
    }));

    setConversations(enriched);
    setLoading(false);
  };

  const loadRequests = async (uid: string) => {
    const { data } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
      .order('created_at', { ascending: false });

    if (!data) return;

    const allIds = data.flatMap((r: FriendRequest) => [r.sender_id, r.receiver_id]);
    const uniqueIds = [...new Set(allIds)].filter((id) => id !== uid);
    const { data: users } = uniqueIds.length
      ? await supabase.from('vault_users').select('*').in('user_id', uniqueIds)
      : { data: [] };

    const userMap: Record<string, VaultUser> = {};
    (users || []).forEach((u: VaultUser) => { userMap[u.user_id] = u; });

    const enriched = data.map((r: FriendRequest) => ({
      ...r,
      sender: userMap[r.sender_id] || undefined,
      receiver: userMap[r.receiver_id] || undefined,
    }));

    setRequests(enriched);
  };

  const loadPendingMap = async (uid: string) => {
    const { data } = await supabase
      .from('friend_requests')
      .select('receiver_id, status')
      .eq('sender_id', uid);
    const map: Record<string, string> = {};
    (data || []).forEach((r: any) => { map[r.receiver_id] = r.status; });
    setPendingMap(map);
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

  const sendFriendRequest = async (otherUser: VaultUser) => {
    if (!userId) return;
    const { data } = await supabase
      .from('friend_requests')
      .insert({ sender_id: userId, receiver_id: otherUser.user_id })
      .select()
      .single();
    if (data) {
      setPendingMap((prev) => ({ ...prev, [otherUser.user_id]: 'pending' }));
    }
  };

  const respondToRequest = async (requestId: string, accept: boolean) => {
    const { data } = await supabase
      .from('friend_requests')
      .update({ status: accept ? 'accepted' : 'declined', updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .select()
      .single();

    if (data) {
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (accept && userId) {
        loadConversations(userId);
        loadPendingMap(userId);
      }
    }
  };

  const openConversation = (c: SharedConversation) => {
    router.push({
      pathname: '/vault/chat',
      params: {
        id: c.id,
        name: c.other_user?.display_name || 'Unknown',
        otherId: c.other_user?.user_id || '',
      },
    });
  };

  const handleSignOut = async () => {
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

  const incomingRequests = requests.filter((r) => r.receiver_id === userId && r.status === 'pending');
  const outgoingRequests = requests.filter((r) => r.sender_id === userId && r.status === 'pending');

  const renderConvo = ({ item }: { item: SharedConversation }) => {
    const name = item.other_user?.display_name || 'Unknown';
    const color = item.other_user ? avatarColor(item.other_user.user_id) : '#555';
    return (
      <TouchableOpacity style={styles.convoItem} onPress={() => openConversation(item)}>
        <View style={[styles.avatar, { borderColor: color + '44', backgroundColor: color + '1a' }]}>
          <Text style={[styles.avatarText, { color }]}>{initials(name)}</Text>
        </View>
        <View style={styles.convoInfo}>
          <View style={styles.convoTop}>
            <Text style={styles.convoName}>{name}</Text>
            <Text style={styles.convoTime}>{formatTime(item.last_message_at)}</Text>
          </View>
          <Text style={styles.convoPreview} numberOfLines={1}>Tap to chat</Text>
        </View>
        <ChevronRight color="#3a3a3c" size={18} strokeWidth={1.5} />
      </TouchableOpacity>
    );
  };

  const renderIncomingRequest = ({ item }: { item: FriendRequest }) => {
    const name = item.sender?.display_name || 'Unknown';
    const color = item.sender ? avatarColor(item.sender.user_id) : '#555';
    return (
      <View style={styles.requestItem}>
        <View style={[styles.avatar, { borderColor: color + '44', backgroundColor: color + '1a' }]}>
          <Text style={[styles.avatarText, { color }]}>{initials(name)}</Text>
        </View>
        <View style={styles.requestInfo}>
          <Text style={styles.requestName}>{name}</Text>
          <Text style={styles.requestSub}>Wants to be your friend</Text>
        </View>
        <TouchableOpacity
          style={[styles.actionBtn, styles.acceptBtn]}
          onPress={() => respondToRequest(item.id, true)}
        >
          <UserCheck color="#30d158" size={18} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.declineBtn]}
          onPress={() => respondToRequest(item.id, false)}
        >
          <UserX color="#ff453a" size={18} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderOutgoingRequest = ({ item }: { item: FriendRequest }) => {
    const name = item.receiver?.display_name || 'Unknown';
    const color = item.receiver ? avatarColor(item.receiver.user_id) : '#555';
    return (
      <View style={styles.requestItem}>
        <View style={[styles.avatar, { borderColor: color + '44', backgroundColor: color + '1a' }]}>
          <Text style={[styles.avatarText, { color }]}>{initials(name)}</Text>
        </View>
        <View style={styles.requestInfo}>
          <Text style={styles.requestName}>{name}</Text>
          <Text style={styles.requestSubPending}>Pending</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d0d" />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Shield color="#0a84ff" size={22} strokeWidth={1.5} />
          <Text style={styles.headerTitle}>Vault</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setShowSearch(true)}>
            <Search color="#0a84ff" size={20} strokeWidth={1.5} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={handleSignOut}>
            <LogOut color="#8e8e93" size={20} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'chats' && styles.tabActive]}
          onPress={() => setTab('chats')}
        >
          <MessageCircle color={tab === 'chats' ? '#0a84ff' : '#8e8e93'} size={18} strokeWidth={1.5} />
          <Text style={[styles.tabText, tab === 'chats' && styles.tabTextActive]}>Chats</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'requests' && styles.tabActive]}
          onPress={() => setTab('requests')}
        >
          <Bell color={tab === 'requests' ? '#0a84ff' : '#8e8e93'} size={18} strokeWidth={1.5} />
          {incomingRequests.length > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{incomingRequests.length}</Text></View>}
          <Text style={[styles.tabText, tab === 'requests' && styles.tabTextActive]}>Requests</Text>
        </TouchableOpacity>
      </View>

      {tab === 'chats' ? (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#0a84ff" size="large" />
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.center}>
            <Users color="#3a3a3c" size={64} strokeWidth={1} />
            <Text style={styles.emptyTitle}>No Conversations</Text>
            <Text style={styles.emptySubtitle}>Add friends to start chatting</Text>
            <TouchableOpacity style={styles.searchPromptBtn} onPress={() => setShowSearch(true)}>
              <UserPlus color="#0a84ff" size={18} strokeWidth={1.5} />
              <Text style={styles.searchPromptText}>Find friends</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={renderConvo}
          />
        )
      ) : (
        <View style={styles.requestsSection}>
          {incomingRequests.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Incoming Requests</Text>
              <FlatList
                data={incomingRequests}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                renderItem={renderIncomingRequest}
              />
            </>
          )}
          {outgoingRequests.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: incomingRequests.length > 0 ? 24 : 0 }]}>
                Sent Requests
              </Text>
              <FlatList
                data={outgoingRequests}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                renderItem={renderOutgoingRequest}
              />
            </>
          )}
          {incomingRequests.length === 0 && outgoingRequests.length === 0 && (
            <View style={styles.center}>
              <Bell color="#3a3a3c" size={48} strokeWidth={1} />
              <Text style={styles.emptyTitle}>No Requests</Text>
              <Text style={styles.emptySubtitle}>Friend requests will appear here</Text>
            </View>
          )}
        </View>
      )}

      {/* User Search Modal */}
      <Modal visible={showSearch} transparent animationType="slide">
        <View style={styles.searchModal}>
          <View style={styles.searchHeader}>
            <Text style={styles.searchTitle}>Find Friends</Text>
            <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>
              <X color="#8e8e93" size={22} />
            </TouchableOpacity>
          </View>

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
            <View style={styles.center}>
              <ActivityIndicator color="#0a84ff" />
            </View>
          ) : searchResults.length === 0 && searchQuery.trim() !== '' ? (
            <View style={styles.center}>
              <Text style={styles.noResultsText}>No users found</Text>
            </View>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.searchList}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => {
                const color = avatarColor(item.user_id);
                const pending = pendingMap[item.user_id];
                return (
                  <View style={styles.userItem}>
                    <View style={[styles.avatar, { borderColor: color + '44', backgroundColor: color + '1a' }]}>
                      <Text style={[styles.avatarText, { color }]}>{initials(item.display_name)}</Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{item.display_name}</Text>
                      <Text style={styles.userEmail}>{item.email}</Text>
                    </View>
                    {pending === 'pending' ? (
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingBadgeText}>Sent</Text>
                      </View>
                    ) : pending === 'accepted' ? (
                      <View style={styles.acceptedBadge}>
                        <UserCheck color="#30d158" size={16} strokeWidth={2} />
                        <Text style={styles.acceptedBadgeText}>Friends</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.addFriendBtn}
                        onPress={() => sendFriendRequest(item)}
                      >
                        <UserPlus color="#0a84ff" size={18} strokeWidth={1.5} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </Modal>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { padding: 8 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1e',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#0a84ff' },
  tabText: { color: '#8e8e93', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#0a84ff' },
  badge: {
    position: 'absolute',
    top: 6,
    right: '30%',
    backgroundColor: '#ff453a',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
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
  requestsSection: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  sectionTitle: { color: '#8e8e93', fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  requestItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  requestInfo: { flex: 1 },
  requestName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  requestSub: { color: '#8e8e93', fontSize: 13, marginTop: 2 },
  requestSubPending: { color: '#ff9f0a', fontSize: 13, marginTop: 2 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  acceptBtn: { backgroundColor: '#30d15822', borderWidth: 1, borderColor: '#30d15844' },
  declineBtn: { backgroundColor: '#ff453a22', borderWidth: 1, borderColor: '#ff453a44' },
  searchModal: { flex: 1, backgroundColor: '#0d0d0d', paddingTop: 56 },
  searchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1e',
  },
  searchTitle: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
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
  searchList: { paddingTop: 4 },
  noResultsText: { color: '#8e8e93', fontSize: 15 },
  userItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  userInfo: { flex: 1 },
  userName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  userEmail: { color: '#8e8e93', fontSize: 13, marginTop: 2 },
  addFriendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0a84ff22',
    borderWidth: 1,
    borderColor: '#0a84ff44',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingBadge: {
    backgroundColor: '#ff9f0a22',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#ff9f0a44',
  },
  pendingBadgeText: { color: '#ff9f0a', fontSize: 13, fontWeight: '600' },
  acceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#30d15822',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#30d15844',
  },
  acceptedBadgeText: { color: '#30d158', fontSize: 13, fontWeight: '600' },
});

import React, { useState, useEffect, useCallback } from 'react';
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
import { MessageCircle, Plus, LogOut, X, Shield } from 'lucide-react-native';

type Conversation = {
  id: string;
  participant_name: string;
  last_message_preview: string;
  last_message_at: string;
};

export default function VaultHomeScreen() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

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
  };

  const loadConversations = async (uid: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('vault_conversations')
      .select('*')
      .eq('owner_id', uid)
      .order('last_message_at', { ascending: false });
    setConversations(data || []);
    setLoading(false);
  };

  const createConversation = async () => {
    if (!newName.trim() || !userId) return;
    setCreating(true);
    const { data } = await supabase
      .from('vault_conversations')
      .insert({ owner_id: userId, participant_name: newName.trim() })
      .select()
      .single();
    setCreating(false);
    setShowNew(false);
    setNewName('');
    if (data) {
      router.push({ pathname: '/vault/chat', params: { id: data.id, name: data.participant_name } });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0a84ff" size="large" />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <MessageCircle color="#3a3a3c" size={64} strokeWidth={1} />
          <Text style={styles.emptyTitle}>No Conversations</Text>
          <Text style={styles.emptySubtitle}>Start a new secure conversation</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.convoItem}
              onPress={() =>
                router.push({ pathname: '/vault/chat', params: { id: item.id, name: item.participant_name } })
              }
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.participant_name[0]?.toUpperCase() || '?'}</Text>
              </View>
              <View style={styles.convoInfo}>
                <View style={styles.convoTop}>
                  <Text style={styles.convoName}>{item.participant_name}</Text>
                  <Text style={styles.convoTime}>{formatTime(item.last_message_at)}</Text>
                </View>
                <Text style={styles.convoPreview} numberOfLines={1}>
                  {item.last_message_preview || 'No messages yet'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowNew(true)}>
        <Plus color="#ffffff" size={26} strokeWidth={2} />
      </TouchableOpacity>

      <Modal visible={showNew} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowNew(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Conversation</Text>
              <TouchableOpacity onPress={() => setShowNew(false)}>
                <X color="#8e8e93" size={20} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Contact name..."
              placeholderTextColor="#555"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.modalBtn, !newName.trim() && styles.modalBtnDisabled]}
              onPress={createConversation}
              disabled={!newName.trim() || creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalBtnText}>Start Conversation</Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
  headerBtn: { padding: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyTitle: { color: '#ffffff', fontSize: 20, fontWeight: '600', marginTop: 8 },
  emptySubtitle: { color: '#8e8e93', fontSize: 15 },
  list: { paddingTop: 8 },
  separator: { height: 1, backgroundColor: '#1c1c1e', marginLeft: 76 },
  convoItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1a2a3a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#0a84ff33',
  },
  avatarText: { color: '#0a84ff', fontSize: 20, fontWeight: '600' },
  convoInfo: { flex: 1 },
  convoTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  convoName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  convoTime: { color: '#8e8e93', fontSize: 13 },
  convoPreview: { color: '#8e8e93', fontSize: 14 },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0a84ff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0a84ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' },
  modalSheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#3a3a3c',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  modalInput: {
    backgroundColor: '#2c2c2e',
    borderRadius: 12,
    padding: 16,
    color: '#ffffff',
    fontSize: 16,
  },
  modalBtn: { backgroundColor: '#0a84ff', borderRadius: 12, padding: 16, alignItems: 'center' },
  modalBtnDisabled: { backgroundColor: '#1a3a5e' },
  modalBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});

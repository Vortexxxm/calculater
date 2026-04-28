import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  Keyboard,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Send, Lock } from 'lucide-react-native';

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

const AVATAR_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#64d2ff', '#bf5af2'];

function avatarColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function ChatScreen() {
  const { id, name, otherId } = useLocalSearchParams<{ id: string; name: string; otherId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const flatRef = useRef<FlatList>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useFocusEffect(
    useCallback(() => {
      init();
      return () => {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    }, [id])
  );

  const init = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) { router.replace('/vault/auth'); return; }
    setUserId(data.user.id);
    await loadMessages();
    subscribeToMessages();
  };

  const loadMessages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('shared_messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoading(false);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100);
  };

  const subscribeToMessages = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`chat:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'shared_messages',
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
        }
      )
      .subscribe();

    channelRef.current = channel;
  };

  const sendMessage = async () => {
    if (!text.trim() || !userId || sending) return;
    const plainText = text.trim();
    setText('');
    setSending(true);

    const { data: msg } = await supabase
      .from('shared_messages')
      .insert({
        conversation_id: id,
        sender_id: userId,
        content: plainText,
      })
      .select()
      .single();

    if (msg) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      await supabase
        .from('shared_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', id);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    }
    setSending(false);
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const otherColor = otherId ? avatarColor(otherId) : '#0a84ff';

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMine = item.sender_id === userId;
    const showTime =
      index === messages.length - 1 ||
      new Date(messages[index + 1]?.created_at).getTime() - new Date(item.created_at).getTime() > 300000;

    const showAvatar =
      !isMine &&
      (index === 0 || messages[index - 1]?.sender_id !== item.sender_id);

    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
        {!isMine && (
          <View style={styles.avatarSlot}>
            {showAvatar ? (
              <View style={[styles.miniAvatar, { backgroundColor: otherColor + '1a', borderColor: otherColor + '55' }]}>
                <Text style={[styles.miniAvatarText, { color: otherColor }]}>
                  {(name || '?')[0].toUpperCase()}
                </Text>
              </View>
            ) : (
              <View style={styles.avatarPlaceholder} />
            )}
          </View>
        )}
        <View style={styles.bubbleCol}>
          <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
            <Text style={[styles.msgText, isMine ? styles.msgTextMine : styles.msgTextTheirs]}>
              {item.content}
            </Text>
          </View>
          {showTime && (
            <Text style={[styles.msgTime, isMine ? styles.msgTimeMine : styles.msgTimeTheirs]}>
              {formatTime(item.created_at)}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0d0d0d" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color="#0a84ff" size={22} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={[styles.headerAvatar, { backgroundColor: otherColor + '1a', borderColor: otherColor + '55' }]}>
            <Text style={[styles.headerAvatarText, { color: otherColor }]}>
              {(name || '?')[0].toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.headerName}>{name}</Text>
            <View style={styles.encryptedBadge}>
              <Lock color="#30d158" size={10} strokeWidth={2} />
              <Text style={styles.encryptedText}>Real-time secure chat</Text>
            </View>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0a84ff" size="large" />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Lock color="#3a3a3c" size={40} strokeWidth={1} />
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubText}>Say hello to {name}</Text>
            </View>
          }
        />
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor="#555"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Send color="#ffffff" size={18} strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 8,
    paddingBottom: 12,
    backgroundColor: '#111111',
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1e',
  },
  backBtn: { padding: 10 },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerAvatarText: { fontSize: 16, fontWeight: '700' },
  headerName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  encryptedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  encryptedText: { color: '#30d158', fontSize: 11 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messageList: { paddingHorizontal: 12, paddingVertical: 16, gap: 2 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: '#8e8e93', fontSize: 15, fontWeight: '500' },
  emptySubText: { color: '#3a3a3c', fontSize: 13 },
  msgRow: { flexDirection: 'row', marginVertical: 2, alignItems: 'flex-end' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },
  avatarSlot: { width: 32, marginRight: 6 },
  avatarPlaceholder: { width: 32 },
  miniAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  miniAvatarText: { fontSize: 12, fontWeight: '700' },
  bubbleCol: { maxWidth: '75%' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: '#0a84ff', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#1c1c1e', borderBottomLeftRadius: 4 },
  msgText: { fontSize: 16, lineHeight: 22 },
  msgTextMine: { color: '#ffffff' },
  msgTextTheirs: { color: '#ffffff' },
  msgTime: { fontSize: 11, marginTop: 4 },
  msgTimeMine: { color: '#ffffffaa', textAlign: 'right' },
  msgTimeTheirs: { color: '#8e8e93' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    backgroundColor: '#111111',
    borderTopWidth: 1,
    borderTopColor: '#1c1c1e',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 16,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0a84ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#1a3a5e' },
});

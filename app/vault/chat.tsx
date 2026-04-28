import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Image,
  StatusBar,
  Keyboard,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { encrypt, decrypt } from '@/lib/crypto';
import { ArrowLeft, Send, Lock, Image as ImageIcon, Mic } from 'lucide-react-native';

type Message = {
  id: string;
  encrypted_content: string;
  message_type: string;
  is_sent: boolean;
  created_at: string;
  decrypted?: string;
};

export default function ChatScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const flatRef = useRef<FlatList>(null);

  useFocusEffect(
    useCallback(() => {
      init();
    }, [id])
  );

  const init = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) { router.replace('/vault/auth'); return; }
    setUserId(data.user.id);
    await loadMessages(data.user.id);
  };

  const loadMessages = async (uid: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('vault_messages')
      .select('*')
      .eq('conversation_id', id)
      .eq('owner_id', uid)
      .order('created_at', { ascending: true });

    const decrypted = (data || []).map((m: Message) => ({
      ...m,
      decrypted: decrypt(m.encrypted_content),
    }));
    setMessages(decrypted);
    setLoading(false);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100);
  };

  const sendMessage = async () => {
    if (!text.trim() || !userId || sending) return;
    const plainText = text.trim();
    setText('');
    Keyboard.dismiss();
    setSending(true);

    const encrypted = encrypt(plainText);
    const { data: msg } = await supabase
      .from('vault_messages')
      .insert({
        conversation_id: id,
        owner_id: userId,
        encrypted_content: encrypted,
        message_type: 'text',
        is_sent: true,
      })
      .select()
      .single();

    if (msg) {
      setMessages((prev) => [...prev, { ...msg, decrypted: plainText }]);
      await supabase
        .from('vault_conversations')
        .update({ last_message_preview: plainText.slice(0, 40), last_message_at: new Date().toISOString() })
        .eq('id', id);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
    setSending(false);
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isSent = item.is_sent;
    const showTime =
      index === messages.length - 1 ||
      new Date(messages[index + 1]?.created_at).getTime() - new Date(item.created_at).getTime() > 300000;

    return (
      <View style={[styles.msgRow, isSent ? styles.msgRowSent : styles.msgRowReceived]}>
        <View style={[styles.bubble, isSent ? styles.bubbleSent : styles.bubbleReceived]}>
          <Text style={[styles.msgText, isSent ? styles.msgTextSent : styles.msgTextReceived]}>
            {item.decrypted || item.encrypted_content}
          </Text>
          {showTime && (
            <Text style={[styles.msgTime, isSent ? styles.msgTimeSent : styles.msgTimeReceived]}>
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
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{(name || '?')[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.headerName}>{name}</Text>
            <View style={styles.encryptedBadge}>
              <Lock color="#30d158" size={10} strokeWidth={2} />
              <Text style={styles.encryptedText}>End-to-end encrypted</Text>
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
              <Text style={styles.emptyText}>Messages are end-to-end encrypted</Text>
              <Text style={styles.emptySubText}>Only you can read them</Text>
            </View>
          }
        />
      )}

      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.mediaBtn}>
          <ImageIcon color="#8e8e93" size={22} strokeWidth={1.5} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mediaBtn}>
          <Mic color="#8e8e93" size={22} strokeWidth={1.5} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor="#555"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
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
    backgroundColor: '#1a2a3a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0a84ff44',
  },
  headerAvatarText: { color: '#0a84ff', fontSize: 16, fontWeight: '600' },
  headerName: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  encryptedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  encryptedText: { color: '#30d158', fontSize: 11 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messageList: { paddingHorizontal: 12, paddingVertical: 16, gap: 4 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: '#8e8e93', fontSize: 15, fontWeight: '500' },
  emptySubText: { color: '#3a3a3c', fontSize: 13 },
  msgRow: { marginVertical: 2 },
  msgRowSent: { alignItems: 'flex-end' },
  msgRowReceived: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleSent: {
    backgroundColor: '#0a84ff',
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    backgroundColor: '#1c1c1e',
    borderBottomLeftRadius: 4,
  },
  msgText: { fontSize: 16, lineHeight: 22 },
  msgTextSent: { color: '#ffffff' },
  msgTextReceived: { color: '#ffffff' },
  msgTime: { fontSize: 11, marginTop: 4 },
  msgTimeSent: { color: '#ffffffaa', textAlign: 'right' },
  msgTimeReceived: { color: '#8e8e93' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    backgroundColor: '#111111',
    borderTopWidth: 1,
    borderTopColor: '#1c1c1e',
    gap: 8,
  },
  mediaBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0a84ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#1a3a5e' },
});

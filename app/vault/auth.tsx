import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Lock } from 'lucide-react-native';

export default function VaultAuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const handleAuth = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please fill all fields');
      return;
    }
    setLoading(true);

    try {
      if (isRegister) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        if (data.user) {
          await supabase.from('vault_users').insert({
            user_id: data.user.id,
            display_name: displayName.trim() || 'My Vault',
            email: email.trim(),
          });
          router.replace('/vault/home');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        router.replace('/vault/home');
      }
    } catch (e: any) {
      setError(e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <View style={styles.iconWrap}>
          <Lock color="#0a84ff" size={40} strokeWidth={1.5} />
        </View>
        <Text style={styles.title}>Secure Vault</Text>
        <Text style={styles.subtitle}>{isRegister ? 'Create your vault account' : 'Sign in to your vault'}</Text>

        {error !== '' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {isRegister && (
          <TextInput
            style={styles.input}
            placeholder="Display name"
            placeholderTextColor="#555"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#555"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#555"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.btn} onPress={handleAuth} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>{isRegister ? 'Create Vault' : 'Enter Vault'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setIsRegister(!isRegister); setError(''); }}>
          <Text style={styles.switchText}>
            {isRegister ? 'Already have a vault? Sign in' : "Don't have a vault? Create one"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
          <Text style={styles.backText}>Back to Calculator</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#0a84ff33',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#8e8e93',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorBox: {
    backgroundColor: '#3a1010',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ff453a44',
  },
  errorText: {
    color: '#ff453a',
    fontSize: 14,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  btn: {
    backgroundColor: '#0a84ff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
  switchText: {
    color: '#0a84ff',
    fontSize: 14,
    textAlign: 'center',
  },
  backBtn: {
    marginTop: 8,
    alignItems: 'center',
  },
  backText: {
    color: '#3a3a3c',
    fontSize: 13,
  },
});

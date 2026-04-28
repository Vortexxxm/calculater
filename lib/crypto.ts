const ENCRYPTION_KEY = 'V4ULT_S3CUR3_K3Y_2026_AES_256!';

async function getKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ENCRYPTION_KEY).slice(0, 32),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('vault-salt-2026'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(plainText: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encoded = encoder.encode(plainText);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  const ciphertext = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  const ivStr = btoa(String.fromCharCode(...iv));

  return { ciphertext, iv: ivStr };
}

export async function decrypt(ciphertext: string, ivStr: string): Promise<string> {
  try {
    const key = await getKey();

    const ivBytes = Uint8Array.from(atob(ivStr), (c) => c.charCodeAt(0));
    const encryptedBytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      encryptedBytes
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return '';
  }
}

// Legacy XOR for backward compat with old vault_messages
const LEGACY_KEY = 'V4ULT_K3Y_200574_SECRET';

function xorEncrypt(text: string, key: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(unescape(encodeURIComponent(result)));
}

function xorDecrypt(encoded: string, key: string): string {
  try {
    const text = decodeURIComponent(escape(atob(encoded)));
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch {
    return '';
  }
}

export function legacyEncrypt(plainText: string): string {
  return xorEncrypt(plainText, LEGACY_KEY);
}

export function legacyDecrypt(cipherText: string): string {
  return xorDecrypt(cipherText, LEGACY_KEY);
}

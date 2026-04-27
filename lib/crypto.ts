const SECRET_KEY = 'V4ULT_K3Y_200574_SECRET';

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

export function encrypt(plainText: string): string {
  return xorEncrypt(plainText, SECRET_KEY);
}

export function decrypt(cipherText: string): string {
  return xorDecrypt(cipherText, SECRET_KEY);
}

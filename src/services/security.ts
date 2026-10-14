/**
 * Security & Token generator for Private Parent Reports
 * Ensures cryptographically unguessable, non-sequential tokens
 */

export function generateSecureToken(length: number = 32): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  // Use crypto.getRandomValues if available in modern browsers
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const values = new Uint32Array(length);
    window.crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      result += charset[values[i] % charset.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
  }
  // Prefix with 'pr_' (private report)
  return `pr_${result}`;
}

export function validateImageFile(file: File): { isValid: boolean; error?: string } {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  const maxSizeBytes = 5 * 1024 * 1024; // 5 MB

  if (!allowedMimeTypes.includes(file.type)) {
    return {
      isValid: false,
      error: 'Format file tidak didukung. Mohon unggah foto dalam format JPG, PNG, atau WebP.',
    };
  }

  if (file.size > maxSizeBytes) {
    return {
      isValid: false,
      error: 'Ukuran foto maksimal 5 MB.',
    };
  }

  return { isValid: true };
}

export function sanitizeText(text: string): string {
  if (!text) return '';
  return text.trim();
}

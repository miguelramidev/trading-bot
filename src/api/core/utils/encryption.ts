import crypto from "crypto";

// La llave maestra debe ser de 32 bytes (256 bits)
// Idealmente viene de process.env.ENCRYPTION_KEY
// Para desarrollo usamos un fallback
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "e5b8d9c2f4a13876be8c0d1e5a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b"; 
const ALGORITHM = "aes-256-gcm";

export function encrypt(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Formato: iv:authTag:encryptedText
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(hash: string): string {
  if (!hash || !hash.includes(':')) return hash;
  
  const parts = hash.split(':');
  if (parts.length !== 3) return hash; // Fallback si no está encriptado (migración vieja)
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedText = Buffer.from(parts[2], 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedText, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

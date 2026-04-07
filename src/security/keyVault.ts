/**
 * NeuroDEX Key Vault
 * Securely stores API keys using OS keychain (macOS Keychain, Windows Credential Manager, libsecret)
 * Falls back to AES-256-GCM encrypted file storage if keytar unavailable
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SERVICE_NAME = 'NeuroDEX';
const CONFIG_DIR = path.join(os.homedir(), '.config', 'NeuroDEX');
const VAULT_FILE = path.join(CONFIG_DIR, 'vault.enc');

interface VaultEntry {
  provider: string;
  key: string;
  addedAt: number;
}

interface EncryptedVault {
  iv: string;
  tag: string;
  data: string;
  salt: string;
}

let keytar: typeof import('keytar') | null = null;

async function loadKeytar(): Promise<typeof import('keytar') | null> {
  try {
    keytar = await import('keytar');
    return keytar;
  } catch {
    return null;
  }
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function getMasterKey(): Buffer {
  // Derive a machine-unique key from hardware identifiers
  const machineId = [
    os.hostname(),
    os.userInfo().username,
    os.platform(),
    process.env.HOME || ''
  ].join(':');
  const salt = Buffer.from('NeuroDEX-vault-v1');
  return crypto.pbkdf2Sync(machineId, salt, 200000, 32, 'sha256');
}

function encryptData(data: string, key: Buffer): EncryptedVault {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
    salt: salt.toString('hex')
  };
}

function decryptData(vault: EncryptedVault, key: Buffer): string {
  const salt = Buffer.from(vault.salt, 'hex');
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
  const iv = Buffer.from(vault.iv, 'hex');
  const tag = Buffer.from(vault.tag, 'hex');
  const data = Buffer.from(vault.data, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}

function loadVaultFile(): VaultEntry[] {
  if (!fs.existsSync(VAULT_FILE)) return [];
  try {
    const raw = fs.readFileSync(VAULT_FILE, 'utf8');
    const encrypted: EncryptedVault = JSON.parse(raw);
    const masterKey = getMasterKey();
    const decrypted = decryptData(encrypted, masterKey);
    return JSON.parse(decrypted);
  } catch {
    return [];
  }
}

function saveVaultFile(entries: VaultEntry[]): void {
  ensureConfigDir();
  const masterKey = getMasterKey();
  const encrypted = encryptData(JSON.stringify(entries), masterKey);
  fs.writeFileSync(VAULT_FILE, JSON.stringify(encrypted), { mode: 0o600 });
}

export async function setApiKey(provider: string, apiKey: string): Promise<void> {
  // Validate key is not empty
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('API key cannot be empty');
  }

  const kt = await loadKeytar();
  if (kt) {
    await kt.setPassword(SERVICE_NAME, provider, apiKey);
    return;
  }

  // Fallback: encrypted file
  const entries = loadVaultFile().filter(e => e.provider !== provider);
  entries.push({ provider, key: apiKey, addedAt: Date.now() });
  saveVaultFile(entries);
}

export async function getApiKey(provider: string): Promise<string | null> {
  const kt = await loadKeytar();
  if (kt) {
    return kt.getPassword(SERVICE_NAME, provider);
  }

  const entries = loadVaultFile();
  return entries.find(e => e.provider === provider)?.key ?? null;
}

export async function deleteApiKey(provider: string): Promise<boolean> {
  const kt = await loadKeytar();
  if (kt) {
    return kt.deletePassword(SERVICE_NAME, provider);
  }

  const entries = loadVaultFile();
  const filtered = entries.filter(e => e.provider !== provider);
  if (filtered.length === entries.length) return false;
  saveVaultFile(filtered);
  return true;
}

export async function listProviders(): Promise<string[]> {
  const kt = await loadKeytar();
  if (kt) {
    const creds = await kt.findCredentials(SERVICE_NAME);
    return creds.map(c => c.account);
  }

  return loadVaultFile().map(e => e.provider);
}

export async function hasApiKey(provider: string): Promise<boolean> {
  const key = await getApiKey(provider);
  return key !== null && key.length > 0;
}

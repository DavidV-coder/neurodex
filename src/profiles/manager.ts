/**
 * NeuroDEX Profiles System
 * Multiple named configurations — work, personal, coding, etc.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { PermissionConfig } from '../security/permissions.js';

export interface Profile {
  id: string;
  name: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  permissions?: Partial<PermissionConfig>;
  env?: Record<string, string>;
  cwd?: string;
  description?: string;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

const CONFIG_DIR  = path.join(os.homedir(), '.config', 'NeuroDEX');
const PROFILES_FILE = path.join(CONFIG_DIR, 'profiles.json');

const DEFAULT_PROFILES: Profile[] = [
  {
    id: 'default',
    name: 'Default',
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    description: 'General purpose assistant',
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'coding',
    name: 'Coding',
    provider: 'claude',
    model: 'claude-opus-4-6',
    systemPrompt: 'You are an expert software engineer. Write clean, well-tested code. Always explain your reasoning.',
    description: 'Expert coding assistant with maximum capability',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'fast',
    name: 'Fast',
    provider: 'claude',
    model: 'claude-haiku-4-5-20251001',
    description: 'Quick responses for simple tasks',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

export class ProfileManager {
  private profiles: Profile[] = [];
  private activeId: string = 'default';

  constructor() {
    this.load();
  }

  load(): void {
    try {
      if (fs.existsSync(PROFILES_FILE)) {
        const data = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
        this.profiles  = data.profiles  || DEFAULT_PROFILES;
        this.activeId  = data.activeId  || 'default';
      } else {
        this.profiles = [...DEFAULT_PROFILES];
      }
    } catch {
      this.profiles = [...DEFAULT_PROFILES];
    }
  }

  save(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(PROFILES_FILE, JSON.stringify({
      profiles: this.profiles,
      activeId: this.activeId
    }, null, 2), { mode: 0o600 });
  }

  list(): Profile[]                      { return [...this.profiles]; }
  getActive(): Profile | undefined       { return this.profiles.find(p => p.id === this.activeId); }
  getActiveId(): string                  { return this.activeId; }
  get(id: string): Profile | undefined   { return this.profiles.find(p => p.id === id); }

  create(data: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>): Profile {
    const profile: Profile = {
      ...data,
      id: data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    // ensure unique id
    let id = profile.id;
    let i = 1;
    while (this.profiles.find(p => p.id === id)) id = `${profile.id}-${i++}`;
    profile.id = id;
    this.profiles.push(profile);
    this.save();
    return profile;
  }

  update(id: string, patch: Partial<Profile>): boolean {
    const idx = this.profiles.findIndex(p => p.id === id);
    if (idx === -1) return false;
    this.profiles[idx] = { ...this.profiles[idx], ...patch, id, updatedAt: Date.now() };
    this.save();
    return true;
  }

  delete(id: string): boolean {
    if (id === 'default') throw new Error('Cannot delete the default profile');
    const before = this.profiles.length;
    this.profiles = this.profiles.filter(p => p.id !== id);
    if (this.activeId === id) this.activeId = 'default';
    if (this.profiles.length !== before) { this.save(); return true; }
    return false;
  }

  activate(id: string): Profile {
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) throw new Error(`Profile not found: ${id}`);
    this.activeId = id;
    this.save();
    return profile;
  }
}

export const profileManager = new ProfileManager();

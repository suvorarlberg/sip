export interface MemberAccount {
  name: string;
  username: string;
  password: string;
  role?: 'mitglied' | 'gast' | 'presse' | 'strategie' | 'admin';
  isExternal?: boolean;
  isInternal?: boolean;
  /** ISO-String wenn der Zugang zeitlich begrenzt ist, ansonsten null/undefined */
  expiresAt?: string | null;
  createdAt?: string;
  notes?: string;
}

export interface SipStateRecord<T = any> {
  id: string;
  payload: T;
  created?: string;
  updated?: string;
  collectionId?: string;
  collectionName?: string;
}

export interface AppSettings {
  clubName: string;
  adminPassword: string;
  strategiePassword: string;
  adminEmail?: string;
  totpSecret?: string;
  totpEnabled?: boolean;
  totpBackupCodes?: string[];
  allowedMembers: string[];
  memberAccounts: MemberAccount[];
  deletedUsernames?: string[];
  updatedAt?: string;
  pocketbaseUrl?: string;
}

export const DEFAULT_ALLOWED_MEMBERS: string[] = [
  'Aaron Hammerer',
  'Amina Amann',
  'Angelina Fitsch',
  'Anton Loss',
  'Celil-Kaan Beler',
  'Chiara Forcher',
  'Elias Mantler',
  'Elias Mathis',
  'Elisabeth Himmer',
  'Emil Schmalfuss',
  'Emma Holzer',
  'Fabian Stauss',
  'Hannah Grabher',
  'Ian Hörburger',
  'Ismail Öztoprak',
  'Jeramis Dengel',
  'Josefine Müller',
  'Juliana Moosbrugger',
  'Kaspar Riedmann',
  'Katharina Nigg',
  'Leon Schwendinger',
  'Liljana Walser',
  'Marian Kolanovic',
  'Nick Klein',
  'Paulus Cukrowicz',
  'Rania Moosbrugger',
  'Simon Märker',
  'Sophia-Maria Thoma',
];

/** Eigene, individuelle Passwörter für das SiP (getrennt vom Inventurprogramm) */
export const INITIAL_SIP_PASSWORDS_BY_NAME: Record<string, string> = {
  'Aaron Hammerer': 'SIP-8w2k-4P',
  'Amina Amann': 'SIP-3m7x-9D',
  'Angelina Fitsch': 'SIP-5p4r-1K',
  'Anton Loss': 'SIP-7v9b-2T',
  'Celil-Kaan Beler': 'SIP-4z6n-8Y',
  'Chiara Forcher': 'SIP-9h3q-5W',
  'Elias Mantler': 'SIP-2t8m-6J',
  'Elias Mathis': 'SIP-6k5c-3R',
  'Elisabeth Himmer': 'SIP-1n4f-7L',
  'Emil Schmalfuss': 'SIP-8y7d-4B',
  'Emma Holzer': 'SIP-3b9p-6M',
  'Fabian Stauss': 'SIP-7r2w-9K',
  'Hannah Grabher': 'SIP-4m8v-1X',
  'Ian Hörburger': 'SIP-9c5t-2Q',
  'Ismail Öztoprak': 'SIP-2f6h-7N',
  'Jeramis Dengel': 'SIP-6p3k-8S',
  'Josefine Müller': 'SIP-1w7r-4D',
  'Juliana Moosbrugger': 'SIP-8n2y-5T',
  'Kaspar Riedmann': 'SIP-3k9m-7B',
  'Katharina Nigg': 'SIP-5t4b-2L',
  'Leon Schwendinger': 'SIP-7m8p-9W',
  'Liljana Walser': 'SIP-2x6c-1R',
  'Marian Kolanovic': 'SIP-9b3f-4K',
  'Nick Klein': 'SIP-4r7w-8M',
  'Paulus Cukrowicz': 'SIP-1p5y-3N',
  'Rania Moosbrugger': 'SIP-6t9k-2D',
  'Simon Märker': 'SIP-8f4m-7P',
  'Sophia-Maria Thoma': 'SIP-3w2r-5B',
};

export function buildMemberUsername(fullName: string): string {
  const cleaned = fullName
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const words = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9-]+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean);

  if (words.length === 0) return 'mitglied@schuelerunion.at';
  if (words.length === 1) return `${words[0]}@schuelerunion.at`;

  const lastName = words[words.length - 1];
  const firstNames = words.slice(0, -1).join('-');
  return `${firstNames}.${lastName}@schuelerunion.at`;
}

export function normalizeUsernameForComparison(rawUsername: string): string {
  return rawUsername
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

export function generateRandomMemberPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let result = 'SIP-';
  for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  result += '-';
  for (let i = 0; i < 2; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export function isAccountExpired(account: MemberAccount): boolean {
  if (!account.expiresAt) return false;
  return new Date(account.expiresAt).getTime() < Date.now();
}

export const DEFAULT_SIP_SETTINGS: AppSettings = {
  clubName: 'Schüler:innenparlament (SiP)',
  adminPassword: 'admin2026!',
  strategiePassword: 'strategie2026',
  adminEmail: '',
  totpSecret: '',
  totpEnabled: false,
  totpBackupCodes: [],
  allowedMembers: DEFAULT_ALLOWED_MEMBERS,
  memberAccounts: DEFAULT_ALLOWED_MEMBERS.map((name) => ({
    name,
    username: buildMemberUsername(name),
    password: INITIAL_SIP_PASSWORDS_BY_NAME[name] || generateRandomMemberPassword(),
    role: 'mitglied',
    isExternal: false,
    expiresAt: null,
  })),
  pocketbaseUrl: 'https://api.sip.schuelerunion-vorarlberg.at',
};

export type SipRoleKey = 'admin' | 'strategie' | 'mitglied' | 'gast';

export type SipSubTab =
  | 'antraege'
  | 'past_antraege'
  | 'drive'
  | 'memes'
  | 'archive';

export type SipTabPermission = {
  visible: boolean;
  editable: boolean;
};

export type SipRoleTabAccess = Record<
  SipRoleKey,
  Record<SipSubTab, SipTabPermission>
>;

export const defaultRoleTabAccess: SipRoleTabAccess = {
  admin: {
    antraege: { visible: true, editable: true },
    past_antraege: { visible: true, editable: true },
    drive: { visible: true, editable: true },
    memes: { visible: true, editable: true },
    archive: { visible: true, editable: true },
  },
  strategie: {
    antraege: { visible: true, editable: true },
    past_antraege: { visible: true, editable: true },
    drive: { visible: true, editable: true },
    memes: { visible: true, editable: true },
    archive: { visible: true, editable: true },
  },
  mitglied: {
    antraege: { visible: true, editable: true },
    past_antraege: { visible: true, editable: false },
    drive: { visible: false, editable: false },
    memes: { visible: true, editable: false },
    archive: { visible: false, editable: false },
  },
  gast: {
    antraege: { visible: true, editable: false },
    past_antraege: { visible: false, editable: false },
    drive: { visible: false, editable: false },
    memes: { visible: false, editable: false },
    archive: { visible: false, editable: false },
  },
};

export interface AppSettings {
  // ...bestehende Felder...
  roleTabAccess?: SipRoleTabAccess;
}
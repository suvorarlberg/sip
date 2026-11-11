import { REAL_SIP_ANTRAEGE, REAL_SIP_STRATEGY_NOTES } from './realSipData';

export type AntragType =
  | 'HAUPTANTRAG' // Hauptantrag (Beschlussantrag im Plenum)
  | 'WM' // Wortmeldung
  | 'AAA' // Abänderungsantrag (ÄA)
  | 'EA' // Erweiterungsantrag
  | 'SA' // Streichungsantrag
  | 'ENDE_DEBATTE' // Antrag auf Ende der Debatte
  | 'ENDE_REDNER' // Antrag auf Ende der Redner:innenliste
  | 'SONSTIGES'; // Sonstiger Antrag / Geschäftsordnungsantrag

export type VoteType = 'JA' | 'NEIN' | 'ENTHALTUNG' | 'FREI' | 'KEINE';

export interface VoteRecommendation {
  type: VoteType;
  note: string;
  updatedAt: string;
  updatedBy: string;
  isPublished?: boolean; // Ob die Strategieführung diese Empfehlung im Plenum an alle freigegeben hat
}

export interface SipAntrag {
  id: string;
  type: AntragType;
  title: string;
  content: string;
  text?: string; // Vollständiger mehrzeiliger Antragstext / Wortmeldungstext
  orderIndex?: number; // Parlamentarische Reihenfolge (basierend auf der PDF-Antragsmappe)
  rede?: string; // Vorbereitete Rede aus den SiP-Unterlagen
  forderungspunkte?: string[]; // Konkrete Forderungspunkte des Antrags
  lineOrParagraph?: string; // z.B. "Antrag 1" oder "Zeile 45-48"
  targetMotionNumber?: number; // Ziel-Hauptantragsnummer aus Strategie-DOCX
  targetMotionTitle?: string; // Ziel-Hauptantragstitel aus Strategie-DOCX
  author: string;
  isPreFab: boolean; // Vorgefertigt aus Dokument vs. selbst eingereicht
  status: 'pending_approval' | 'approved' | 'rejected' | 'completed';
  isEditedByAdmin?: boolean; // Von der Strategieführung angepasst / korrigiert
  claimedBy?: string | null;
  claimedAt?: string | null;
  isActive?: boolean; // Aktuell im Plenum aufgerufen
  parentAntragId?: string; // Verknüpfung zu übergeordnetem Antrag
  createdAt: string;
  approvedAt?: string;
  adminNotes?: string;
  plenumResult?: 'ANGENOMMEN' | 'ABGELEHNT' | null;
  plenumResultAt?: string | null;
}

export interface SipMemeReaction {
  emoji: string;
  users: string[];
}

export interface SipMeme {
  id: string;
  author: string;
  imageUrl: string;
  caption: string;
  createdAt: string;
  reactions: Record<string, string[]>; // emoji -> array of usernames
}

export type DirectMessagePriority = 'info' | 'important' | 'urgent';

export interface SipDirectMessage {
  id: string;
  title: string;
  content: string;
  author: string;
  createdBy?: string;
  publishedBy?: string;
  senderClientId?: string;
  priority: DirectMessagePriority;
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
}

export interface SipActivityLogEntry {
  id: string;
  timestamp: string;
  performedBy: string;
  action:
    | 'ANTRAG_ACTIVATED'
    | 'ANTRAG_CLEARED'
    | 'ANTRAG_CLAIMED'
    | 'ANTRAG_UNCLAIMED'
    | 'ANTRAG_SUBMITTED'
    | 'ANTRAG_APPROVED'
    | 'ANTRAG_REJECTED'
    | 'ANTRAG_DECIDED'
    | 'ANTRAG_EDITED'
    | 'ANTRAG_DELETED'
    | 'ANTRAG_IMPORTED'
    | 'VOTE_REC_SET'
    | 'MEME_ADDED'
    | 'SESSION_ARCHIVED'
    | 'NOTE_UPDATED'
    | 'DIRECT_MESSAGE_SENT'
    | 'DIRECT_MESSAGE_DRAFTED';
  antragId?: string;
  antragTitle?: string;
  details: string;
}

export interface SipArchivedSession {
  id: string;
  sessionTitle: string;
  archivedAt: string;
  archivedBy: string;
  antraegeCount: number;
  activityCount: number;
  sessionData: SipSession;
}

export interface SipUploadedDocument {
  id: string;
  title: string;
  doc_type: 'antragsmappe' | 'strategie' | 'general' | 'go';
  file: string;
  url: string;
  size?: number;
  session_id?: string;
  createdAt?: string;
}

export interface SipSession {
  id: string;
  title: string;
  driveFolderUrl: string;
  strategyNotes: string;
  activeAntragId: string | null;
  voteRecommendation: VoteRecommendation;
  antraege: SipAntrag[];
  memes: SipMeme[];
  directMessages?: SipDirectMessage[];
  activeDirectMessage?: SipDirectMessage | null;
  activityLog?: SipActivityLogEntry[];
  uploadedDocuments?: SipUploadedDocument[];
  updatedAt: string;
}

export interface SipNotification {
  id: string;
  title: string;
  message: string;
  type: 'claim' | 'motion' | 'vote' | 'system';
  timestamp: string;
  antragId?: string;
}

export const ANTRAG_TYPE_CONFIG: Record<
  AntragType,
  { label: string; shortLabel: string; badgeColor: string; description: string }
> = {
  HAUPTANTRAG: {
    label: 'Hauptantrag',
    shortLabel: 'Hauptantrag',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    description: 'Offizieller Hauptantrag / Beschlussantrag im Plenum',
  },
  WM: {
    label: 'Wortmeldung',
    shortLabel: 'WM',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    description: 'Allgemeine Wortmeldung zur laufenden Debatte',
  },
  AAA: {
    label: 'Abänderungsantrag',
    shortLabel: 'ÄA',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    description: 'Änderung an einer bestimmten Textpassage / Zeile',
  },
  EA: {
    label: 'Erweiterungsantrag',
    shortLabel: 'EA',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    description: 'Ergänzung eines neuen Punktes oder Absatzes',
  },
  SA: {
    label: 'Streichungsantrag',
    shortLabel: 'SA',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    description: 'Vollständige Streichung eines Absatzes oder Satzes',
  },
  ENDE_DEBATTE: {
    label: 'Antrag auf Ende der Debatte',
    shortLabel: 'Ende Debatte',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    description: 'Sofortige Beendigung der Debatte zur Abstimmung',
  },
  ENDE_REDNER: {
    label: 'Antrag auf Ende der Redner:innenliste',
    shortLabel: 'Schluss Redner:innen',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    description: 'Schließung der Redeliste, nur noch eingetragene Redner:innen',
  },
  SONSTIGES: {
    label: 'Sonstiger Antrag / GO-Antrag',
    shortLabel: 'GO / Sonst.',
    badgeColor: 'bg-slate-700 text-slate-300 border-slate-600',
    description: 'Geschäftsordnungsantrag oder sonstiger Antrag',
  },
};

export const DEFAULT_SIP_SESSION: SipSession = {
  id: 'currentsession0',
  title: '2. Schüler:innenparlament (SiP) 2024/25',
  driveFolderUrl:
    'https://drive.google.com/drive/folders/1srawS_1c9GZCqDCDuUUPhU_02FPttxi-?usp=share_link',
  strategyNotes: REAL_SIP_STRATEGY_NOTES,
  activeAntragId: null,
  voteRecommendation: {
    type: 'KEINE',
    note: '',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'Strategieführung',
    isPublished: false,
  },
  antraege: REAL_SIP_ANTRAEGE,
  memes: [],
  directMessages: [],
  activeDirectMessage: null,
  activityLog: [],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

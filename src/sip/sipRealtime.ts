import {
  DEFAULT_SIP_SESSION,
  SipAntrag,
  SipMeme,
  SipNotification,
  SipSession,
  VoteRecommendation,
  SipActivityLogEntry,
} from './types';
import { AppSettings, SipStateRecord } from '../types';
import {
  pb,
  SIP_DATABASE_TABLE,
  SIP_CONFIG_ROW_ID,
  SIP_LIVE_ROW_ID,
  upsertSipRow,
  parsePbTimestamp,
} from '../utils/pocketbaseSync';
import { archiveCurrentSession } from './utils/archiveService';

export const SIP_STORAGE_KEY = 'sip_session_state_v1';
export const SIP_LIVE_OVERLAY_STORAGE_KEY = 'sip_live_overlay_v1';
export const SIP_PENDING_SESSION_SYNC_KEY = 'sip_pending_session_sync_v1';
export const SIP_LAST_LIVE_SERVER_UPDATED_KEY = 'sip_last_live_server_updated_v1';
export const SIP_NOTIFICATION_STORAGE_KEY = 'sip_recent_notifications_v1';
export const SIP_REALTIME_CHANNEL_NAME = 'sip-live-updates';
export const SIP_DB_ROW_ID = 'currentsession0';
export { SIP_DATABASE_TABLE, SIP_LIVE_ROW_ID };

export interface SipMotionLivePatch {
  status?: SipAntrag['status'];
  claimedBy: string | null;
  claimedAt: string | null;
  isActive: boolean;
  plenumResult?: 'ANGENOMMEN' | 'ABGELEHNT' | null;
  plenumResultAt?: string | null;
  title?: string;
  content?: string;
  author?: string;
  type?: SipAntrag['type'];
  lineOrParagraph?: string;
  isEditedByAdmin?: boolean;
}

export interface SipLiveStateOverlay {
  sessionId: string;
  title: string;
  driveFolderUrl: string;
  strategyNotes?: string;
  activeAntragId: string | null;
  voteRecommendation: VoteRecommendation;
  motionPatches: Record<string, SipMotionLivePatch>;
  customAntraege: SipAntrag[];
  deletedAntragIds: string[];
  memes: SipMeme[];
  activityLog: SipActivityLogEntry[];
  updatedAt: string;
}

export type SipRealtimeMessage =
  | { type: 'STATE_SYNC'; session: SipSession }
  | { type: 'CONFIG_SYNC'; settings: AppSettings }
  | { type: 'NEW_ACTIVE_ANTRAG'; antragId: string; antrag: SipAntrag; updatedAt?: string }
  | { type: 'VOTE_REC_CHANGED'; recommendation: VoteRecommendation; updatedAt?: string }
  | { type: 'ANTRAG_CLAIMED'; antragId: string; antragTitle: string; claimedBy: string; claimedAt?: string }
  | { type: 'ANTRAG_UNCLAIMED'; antragId: string; antragTitle: string; unclaimedBy: string; updatedAt?: string }
  | { type: 'ANTRAG_SUBMITTED'; antrag: SipAntrag; updatedAt?: string }
  | { type: 'ANTRAG_APPROVED'; antrag: SipAntrag; updatedAt?: string }
  | { type: 'ANTRAG_DECIDED'; antragId: string; decision: 'ANGENOMMEN' | 'ABGELEHNT'; decidedAt: string }
  | { type: 'MEME_ADDED'; meme: SipMeme; updatedAt?: string };

class SipRealtimeService {
  private localChannel: BroadcastChannel | null = null;
  private isPocketBaseSubscribed = false;
  private currentSession: SipSession = DEFAULT_SIP_SESSION;
  private listeners: Set<(session: SipSession) => void> = new Set();
  private configListeners: Set<(payload: any, recordUpdated?: string) => void> = new Set();
  private notificationListeners: Set<(notif: SipNotification) => void> = new Set();
  private activeBlurPopupListeners: Set<(antrag: SipAntrag) => void> = new Set();
  private recentNotificationSignatures: Map<string, number> = new Map();
  private isInitialized = false;
  private isPollingCloud = false;
  private isFetchingSession = false;
  private isSyncingLiveOverlay = false;
  private pendingLiveOverlay: SipLiveStateOverlay | null = null;
  private latestLiveOverlay: SipLiveStateOverlay | null = null;
  private deletedAntragIds: Set<string> = new Set();
  private lastKnownSessionServerUpdated = '';
  private lastKnownLiveServerUpdated =
    typeof window !== 'undefined'
      ? localStorage.getItem(SIP_LAST_LIVE_SERVER_UPDATED_KEY) || ''
      : '';
  private lastKnownConfigServerUpdated = '';

  private syncInterval: any = null;
  private fullSessionSyncTimer: any = null;

  constructor() {
    this.loadFromStorage();
    this.initLocalChannel();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(SIP_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<SipSession>;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.antraege)) {
          this.currentSession = this.mergeWithFreshPreFabs(parsed);
        }
      }
    } catch (err) {
      // Ignore storage read errors
    }

    try {
      const savedOverlay = localStorage.getItem(SIP_LIVE_OVERLAY_STORAGE_KEY);
      if (savedOverlay) {
        const overlay = JSON.parse(savedOverlay) as SipLiveStateOverlay;
        if (overlay && typeof overlay === 'object' && overlay.updatedAt) {
          this.latestLiveOverlay = overlay;
          if (Array.isArray(overlay.deletedAntragIds)) {
            overlay.deletedAntragIds.forEach((id) => this.deletedAntragIds.add(id));
          }
          if (
            !overlay.sessionId ||
            overlay.sessionId === this.currentSession.id ||
            parsePbTimestamp(overlay.updatedAt) >= parsePbTimestamp(this.currentSession.updatedAt)
          ) {
            this.currentSession = this.mergeOverlayIntoSession(this.currentSession, overlay);
          }
        }
      }
    } catch (err) {
      // Ignore overlay read errors
    }
  }

  private initLocalChannel() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.localChannel = new BroadcastChannel('sip_local_broadcast');
        this.localChannel.onmessage = (event) => {
          this.handleIncomingMessage(event.data);
        };
      } catch (err) {
        console.warn('BroadcastChannel not supported or failed:', err);
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === SIP_STORAGE_KEY && event.newValue) {
          try {
            const parsed = JSON.parse(event.newValue) as SipSession;
            if (
              parsed &&
              parsed.updatedAt &&
              parsePbTimestamp(parsed.updatedAt) > parsePbTimestamp(this.currentSession.updatedAt)
            ) {
              this.applyCloudSession(parsed, false);
            }
          } catch (e) {}
        } else if (event.key === SIP_LIVE_OVERLAY_STORAGE_KEY && event.newValue) {
          try {
            const parsedOverlay = JSON.parse(event.newValue) as SipLiveStateOverlay;
            if (
              parsedOverlay &&
              parsedOverlay.updatedAt &&
              parsePbTimestamp(parsedOverlay.updatedAt) > parsePbTimestamp(this.currentSession.updatedAt)
            ) {
              this.applyLiveOverlay(parsedOverlay, undefined, false);
            }
          } catch (e) {}
        }
      });
    }
  }

  private hasLoadedCloudSession = false;
  private cachedSettings: AppSettings | null = null;
  private lastLocalMutationAt = 0;
  private isSyncingToSupabase = false;
  private pendingSyncSession: { settings?: AppSettings; session: SipSession } | null = null;

  private nextTimestamp(): string {
    const now = Date.now();
    const prev = parsePbTimestamp(this.currentSession?.updatedAt);
    const next = prev > 0 && now <= prev ? prev + 1 : now;
    return new Date(next).toISOString();
  }

  private buildLiveOverlay(session: SipSession): SipLiveStateOverlay {
    const motionPatches: Record<string, SipMotionLivePatch> = {};
    for (const a of session.antraege || []) {
      const hasNonDefaultStatus = Boolean(a.status && a.status !== 'approved');
      if (
        a.claimedBy ||
        a.isActive ||
        a.id === session.activeAntragId ||
        a.plenumResult ||
        hasNonDefaultStatus ||
        a.isEditedByAdmin
      ) {
        motionPatches[a.id] = {
          status: a.status || 'approved',
          claimedBy: a.claimedBy || null,
          claimedAt: a.claimedAt || null,
          isActive: Boolean(a.isActive || a.id === session.activeAntragId),
          plenumResult: a.plenumResult || null,
          plenumResultAt: a.plenumResultAt || null,
          ...(a.isEditedByAdmin
            ? {
                title: a.title,
                content: a.content,
                author: a.author,
                type: a.type,
                lineOrParagraph: a.lineOrParagraph,
                isEditedByAdmin: true,
              }
            : {}),
        };
      }
    }

    const customAntraege = (session.antraege || []).filter(
      (a) => !a.isPreFab && a.id.startsWith('antrag_custom_')
    );

    return {
      sessionId: session.id,
      title: session.title,
      driveFolderUrl: session.driveFolderUrl || '',
      strategyNotes: (session.strategyNotes || '').length < 15000 ? session.strategyNotes : undefined,
      activeAntragId: session.activeAntragId || null,
      voteRecommendation: session.voteRecommendation,
      motionPatches,
      customAntraege,
      deletedAntragIds: Array.from(this.deletedAntragIds),
      memes: session.memes || [],
      activityLog: (session.activityLog || []).slice(0, 30),
      updatedAt: session.updatedAt,
    };
  }

  private mergeOverlayIntoSession(
    baseSession: SipSession,
    overlay: SipLiveStateOverlay
  ): SipSession {
    if (!overlay || typeof overlay !== 'object') return baseSession;

    const deletedSet = new Set<string>(
      Array.isArray(overlay.deletedAntragIds) ? overlay.deletedAntragIds : []
    );
    deletedSet.forEach((id) => this.deletedAntragIds.add(id));

    const baseAntraege = (baseSession.antraege || []).filter((a) => !deletedSet.has(a.id));
    const baseIds = new Set(baseAntraege.map((a) => a.id));

    const newCustomAntraege = (Array.isArray(overlay.customAntraege) ? overlay.customAntraege : []).filter(
      (c) => c && c.id && !deletedSet.has(c.id) && !baseIds.has(c.id)
    );

    const customMap = new Map<string, SipAntrag>();
    if (Array.isArray(overlay.customAntraege)) {
      overlay.customAntraege.forEach((c) => {
        if (c && c.id) customMap.set(c.id, c);
      });
    }

    const patches = overlay.motionPatches || {};
    const activeId = overlay.activeAntragId !== undefined ? overlay.activeAntragId : null;

    const combinedAntraege = [...newCustomAntraege, ...baseAntraege].map((a) => {
      const customReplacement = customMap.get(a.id);
      const source = customReplacement ? { ...a, ...customReplacement } : a;
      const patch = patches[source.id];
      if (patch) {
        return {
          ...source,
          status: patch.status || source.status || 'approved',
          claimedBy: patch.claimedBy !== undefined ? patch.claimedBy : null,
          claimedAt: patch.claimedAt !== undefined ? patch.claimedAt : null,
          isActive: activeId ? source.id === activeId : Boolean(patch.isActive),
          plenumResult: patch.plenumResult !== undefined ? patch.plenumResult : null,
          plenumResultAt: patch.plenumResultAt !== undefined ? patch.plenumResultAt : null,
          ...(patch.isEditedByAdmin
            ? {
                title: patch.title ?? source.title,
                content: patch.content ?? source.content,
                author: patch.author ?? source.author,
                type: patch.type ?? source.type,
                lineOrParagraph: patch.lineOrParagraph ?? source.lineOrParagraph,
                isEditedByAdmin: true,
              }
            : {}),
        };
      }
      return {
        ...source,
        status: 'approved' as const,
        claimedBy: null,
        claimedAt: null,
        isActive: activeId ? source.id === activeId : false,
        plenumResult: null,
        plenumResultAt: null,
      };
    });

    return {
      ...baseSession,
      id: overlay.sessionId || baseSession.id,
      title: overlay.title || baseSession.title,
      driveFolderUrl:
        overlay.driveFolderUrl !== undefined ? overlay.driveFolderUrl : baseSession.driveFolderUrl,
      strategyNotes:
        overlay.strategyNotes !== undefined ? overlay.strategyNotes : baseSession.strategyNotes,
      activeAntragId: activeId,
      voteRecommendation: overlay.voteRecommendation || baseSession.voteRecommendation,
      antraege: combinedAntraege,
      memes: Array.isArray(overlay.memes) ? overlay.memes : baseSession.memes,
      activityLog:
        Array.isArray(overlay.activityLog) && overlay.activityLog.length > 0
          ? overlay.activityLog
          : baseSession.activityLog,
      updatedAt: overlay.updatedAt || baseSession.updatedAt,
    };
  }

  private applyLiveOverlay(
    overlay: SipLiveStateOverlay,
    recordUpdated?: string,
    forceOverwrite = false
  ) {
    if (!overlay || typeof overlay !== 'object') return;
    if (
      !forceOverwrite &&
      (this.isSyncingLiveOverlay || Boolean(localStorage.getItem(SIP_PENDING_SESSION_SYNC_KEY)))
    ) {
      return;
    }

    if (recordUpdated) {
      this.lastKnownLiveServerUpdated = recordUpdated;
      try {
        localStorage.setItem(SIP_LAST_LIVE_SERVER_UPDATED_KEY, recordUpdated);
      } catch (e) {}
    }

    this.latestLiveOverlay = overlay;
    try {
      localStorage.setItem(SIP_LIVE_OVERLAY_STORAGE_KEY, JSON.stringify(overlay));
    } catch (e) {}

    const mergedSession = this.mergeOverlayIntoSession(this.currentSession, overlay);
    this.applyCloudSession(mergedSession, true);
  }

  private toCompactSession(session: SipSession): SipSession {
    const compactAntraege = (session.antraege || [])
      .filter((a) => !a.isPreFab || a.claimedBy || a.isActive || a.id === session.activeAntragId || a.isEditedByAdmin || a.plenumResult)
      .map((a) => {
        if (a.isPreFab && !a.isEditedByAdmin) {
          const minimalPreFab: SipAntrag = {
            id: a.id,
            type: a.type,
            title: a.title,
            author: a.author,
            parentAntragId: a.parentAntragId,
            isPreFab: true,
            status: a.status,
            claimedBy: a.claimedBy || null,
            claimedAt: a.claimedAt || null,
            isActive: a.isActive ?? false,
            createdAt: a.createdAt,
            plenumResult: a.plenumResult || null,
            plenumResultAt: a.plenumResultAt || null,
            content: '',
          };
          return minimalPreFab;
        }
        return a;
      });

    return {
      ...session,
      strategyNotes: '',
      antraege: compactAntraege,
      activityLog: (session.activityLog || []).slice(0, 30),
    };
  }

  private mergeWithFreshPreFabs(session: Partial<SipSession>): SipSession {
    let activeId = session.activeAntragId !== undefined ? session.activeAntragId : null;
    if (activeId && activeId.includes('antrag_top_')) {
      activeId = activeId.replace('antrag_top_', 'antrag_');
    }

    const hasImportedMotions =
      Array.isArray(session.antraege) &&
      session.antraege.length > 0 &&
      (session.antraege.some((a) => !a.isPreFab) ||
        session.antraege.length !== DEFAULT_SIP_SESSION.antraege.length ||
        session.antraege[0]?.title !== DEFAULT_SIP_SESSION.antraege[0]?.title);
    const isOriginalTemplate = session.id === 'currentsession0' && !hasImportedMotions;
    
    if ((!isOriginalTemplate && session.id) || hasImportedMotions) {
      return {
        id: session.id || `session_${Date.now()}`,
        title: session.title || 'Schüler:innenparlament (SiP)',
        strategyNotes: session.strategyNotes ?? '',
        driveFolderUrl: session.driveFolderUrl ?? '',
        activeAntragId: activeId,
        voteRecommendation: session.voteRecommendation || {
          type: 'KEINE',
          note: '',
          updatedAt: new Date().toISOString(),
          updatedBy: 'Strategieführung',
          isPublished: false,
        },
        antraege: session.antraege || [],
        memes: session.memes || [],
        activityLog: session.activityLog || [],
        updatedAt: session.updatedAt || new Date().toISOString(),
      };
    }

    const customAntraege = (session.antraege || [])
      .filter((a) => !a.isPreFab)
      .map((a) => (a.id.includes('antrag_top_') ? { ...a, id: a.id.replace('antrag_top_', 'antrag_') } : a));

    const existingClaims = new Map<
      string,
      {
        claimedBy: string | null;
        claimedAt: string | null;
        isActive?: boolean;
        plenumResult?: 'ANGENOMMEN' | 'ABGELEHNT' | null;
        plenumResultAt?: string | null;
      }
    >();
    
    (session.antraege || []).forEach((a) => {
      const cleanId = a.id.replace('antrag_top_', 'antrag_');
      if (a.claimedBy || a.isActive || a.plenumResult) {
        existingClaims.set(cleanId, {
          claimedBy: a.claimedBy || null,
          claimedAt: a.claimedAt || null,
          isActive: a.isActive,
          plenumResult: a.plenumResult || null,
          plenumResultAt: a.plenumResultAt || null,
        });
      }
    });

    const refreshedPreFabs = DEFAULT_SIP_SESSION.antraege.map((fresh) => {
      const claim = existingClaims.get(fresh.id);
      const isCurrentlyActive = activeId ? fresh.id === activeId : (claim?.isActive ?? false);
      return {
        ...fresh,
        claimedBy: claim ? claim.claimedBy : fresh.claimedBy,
        claimedAt: claim ? claim.claimedAt : fresh.claimedAt,
        isActive: isCurrentlyActive,
        plenumResult: claim?.plenumResult ?? fresh.plenumResult ?? null,
        plenumResultAt: claim?.plenumResultAt ?? fresh.plenumResultAt ?? null,
      };
    });

    return {
      ...DEFAULT_SIP_SESSION,
      ...session,
      title: session.title || DEFAULT_SIP_SESSION.title,
      strategyNotes: session.strategyNotes || DEFAULT_SIP_SESSION.strategyNotes,
      driveFolderUrl: session.driveFolderUrl || DEFAULT_SIP_SESSION.driveFolderUrl,
      activeAntragId: activeId,
      voteRecommendation: session.voteRecommendation || DEFAULT_SIP_SESSION.voteRecommendation,
      antraege: [...customAntraege, ...refreshedPreFabs],
      memes: Array.isArray(session.memes) ? session.memes.filter((m) => m.id !== 'meme_1') : [],
    };
  }

  private applyCloudSession(cloudSession: SipSession, forceOverwrite = false) {
    if (!cloudSession) return;
    if (
      !forceOverwrite &&
      cloudSession.updatedAt &&
      this.currentSession.updatedAt &&
      parsePbTimestamp(cloudSession.updatedAt) <= parsePbTimestamp(this.currentSession.updatedAt)
    ) {
      return;
    }
    const merged = this.mergeWithFreshPreFabs(cloudSession);

    const prevActiveId = this.currentSession.activeAntragId;
    const newActiveId = merged.activeAntragId;
    const isNewActive = Boolean(newActiveId && newActiveId !== prevActiveId);

    if (this.hasLoadedCloudSession && this.currentSession.antraege) {
      merged.antraege.forEach((newA) => {
        if (newA.claimedBy) {
          const oldA = this.currentSession.antraege?.find((a) => a.id === newA.id);
          if (!oldA || oldA.claimedBy !== newA.claimedBy) {
            const claimNotif: SipNotification = {
              id: `claim_${newA.id}_${newA.claimedBy}`,
              title: '📢 Antrag geclaimed!',
              message: `${newA.claimedBy} hat "${newA.title}" geclaimed.`,
              type: 'claim',
              timestamp: new Date().toISOString(),
              antragId: newA.id,
            };
            this.triggerNotification(claimNotif);
          }
        }
      });
    }

    if (this.hasLoadedCloudSession) {
      const oldRec = this.currentSession.voteRecommendation;
      const newRec = merged.voteRecommendation;
      if (
        newRec &&
        newRec.isPublished &&
        newRec.type !== 'KEINE' &&
        (!oldRec ||
          !oldRec.isPublished ||
          oldRec.type !== newRec.type ||
          oldRec.updatedAt !== newRec.updatedAt ||
          oldRec.note !== newRec.note)
      ) {
        const voteNotif: SipNotification = {
          id: `vote_${newRec.updatedAt || Date.now()}_${newRec.type}`,
          title: `🗳️ Abstimmungsempfehlung: ${newRec.type}`,
          message: newRec.note
            ? `Empfehlung: ${newRec.type} – ${newRec.note}`
            : `Empfehlung: ${newRec.type}`,
          type: 'vote',
          timestamp: new Date().toISOString(),
        };
        this.triggerNotification(voteNotif);
      }
    }

    if (this.hasLoadedCloudSession && this.currentSession.antraege) {
      const oldCustomIds = new Set(
        (this.currentSession.antraege || [])
          .filter((a) => !a.isPreFab && a.id.startsWith('antrag_custom_'))
          .map((a) => a.id)
      );
      merged.antraege
        .filter((a) => !a.isPreFab && a.id.startsWith('antrag_custom_'))
        .forEach((newCustom) => {
          if (!oldCustomIds.has(newCustom.id)) {
            const submitNotif: SipNotification = {
              id: `submit_${newCustom.id}`,
              title: '📝 Neuer Nebenantrag eingereicht',
              message: `${newCustom.author} hat einen neuen Antrag eingereicht: "${newCustom.title}"`,
              type: 'motion',
              timestamp: new Date().toISOString(),
              antragId: newCustom.id,
            };
            this.triggerNotification(submitNotif);
          }
        });
    }

    if (this.hasLoadedCloudSession && this.currentSession.antraege) {
      merged.antraege.forEach((newA) => {
        if (newA.plenumResult) {
          const oldA = this.currentSession.antraege?.find((a) => a.id === newA.id);
          if (!oldA || oldA.plenumResult !== newA.plenumResult) {
            const decisionNotif: SipNotification = {
              id: `decision_${newA.id}_${newA.plenumResult}`,
              title: newA.plenumResult === 'ANGENOMMEN' ? '🎉 Antrag angenommen!' : '❌ Antrag abgelehnt',
              message: `Antrag "${newA.title}" wurde vom Plenum ${newA.plenumResult === 'ANGENOMMEN' ? 'angenommen' : 'abgelehnt'}.`,
              type: newA.plenumResult === 'ANGENOMMEN' ? 'vote' : 'system',
              timestamp: new Date().toISOString(),
              antragId: newA.id,
            };
            this.triggerNotification(decisionNotif);
          }
        }
      });
    }

    this.hasLoadedCloudSession = true;
    this.currentSession = merged;
    this.notify();

    if (isNewActive && newActiveId) {
      const newlyActiveAntrag = merged.antraege.find((a) => a.id === newActiveId);
      if (newlyActiveAntrag) {
        this.triggerBlurPopup(newlyActiveAntrag);
        const activeNotif: SipNotification = {
          id: `notif_${Date.now()}`,
          title: '🚨 Neuer Antrag aufgerufen!',
          message: `${newlyActiveAntrag.title} wird jetzt im Parlament verhandelt.`,
          type: 'motion',
          timestamp: new Date().toISOString(),
          antragId: newlyActiveAntrag.id,
        };
        this.triggerNotification(activeNotif);
      }
    }
  }

  public setAppState(payload: any, forceOverwrite = false) {
    if (!payload) return;
    this.applyCloudSession(payload as SipSession, forceOverwrite);
  }

  public init(settings: AppSettings) {
    this.cachedSettings = settings;

    const hasActiveSession =
      this.isInitialized ||
      this.hasLoadedCloudSession ||
      (this.currentSession &&
        (this.currentSession.id !== DEFAULT_SIP_SESSION.id ||
          this.currentSession.updatedAt !== DEFAULT_SIP_SESSION.updatedAt));

    if (!hasActiveSession) {
      this.currentSession = DEFAULT_SIP_SESSION;
    }

    if (!this.isInitialized) {
      this.isInitialized = true;
      this.setupSupabase(settings);
      void this.flushPendingAndFetchInitial(settings);

      if (!this.syncInterval) {
        this.syncInterval = setInterval(() => {
          this.pollCloudChanges().catch(() => {});
        }, 1500);
      }
    }
  }

  private async flushPendingAndFetchInitial(settings?: AppSettings): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        const pendingRaw = localStorage.getItem(SIP_PENDING_SESSION_SYNC_KEY);
        if (pendingRaw) {
          try {
            const pendingOverlay = JSON.parse(pendingRaw) as SipLiveStateOverlay;
            if (pendingOverlay && pendingOverlay.updatedAt) {
              this.latestLiveOverlay = pendingOverlay;
              this.currentSession = this.mergeOverlayIntoSession(this.currentSession, pendingOverlay);
              this.notify();
              await this.syncLiveOverlayToPocketBase(pendingOverlay);
              void this.scheduleFullSessionSync(this.currentSession);
            }
          } catch (e) {
            localStorage.removeItem(SIP_PENDING_SESSION_SYNC_KEY);
          }
        }
      }
    } catch (e) {}

    await this.fetchFromSupabase(settings, false).catch(() => {});
  }

  private async pollCloudChanges(): Promise<void> {
    if (this.isPollingCloud) return;
    this.isPollingCloud = true;
    try {
      // Schneller Metadaten-Check (~250 Bytes statt 500 KB) für Echtzeit-Sync (< 1.5s)
      const listRes = await pb.collection(SIP_DATABASE_TABLE).getList(1, 10, {
        fields: 'id,updated',
        requestKey: null,
        query: { _t: Date.now() },
      });

      const items = listRes?.items || [];
      const liveMeta = items.find((item: any) => item.id === SIP_LIVE_ROW_ID);
      const sessionMeta = items.find((item: any) => item.id === SIP_DB_ROW_ID);
      const configMeta = items.find((item: any) => item.id === SIP_CONFIG_ROW_ID);

      // 1. Prüfe schnelles Live-Overlay (siplivestate000, ~25 KB) -> Echtzeit-Plenum-Updates in ~300ms
      if (
        liveMeta &&
        liveMeta.updated &&
        parsePbTimestamp(liveMeta.updated) > parsePbTimestamp(this.lastKnownLiveServerUpdated) &&
        !this.isSyncingLiveOverlay &&
        !Boolean(localStorage.getItem(SIP_PENDING_SESSION_SYNC_KEY)) &&
        Date.now() - this.lastLocalMutationAt >= 1500
      ) {
        try {
          const liveRecord: any = await pb.collection(SIP_DATABASE_TABLE).getOne(SIP_LIVE_ROW_ID, {
            requestKey: null,
            query: { _t: Date.now() },
          });
          if (liveRecord && liveRecord.payload) {
            this.applyLiveOverlay(
              liveRecord.payload as SipLiveStateOverlay,
              liveRecord.updated || liveMeta.updated,
              true
            );
          }
        } catch (liveErr) {
          // Ignore transient live overlay poll errors
        }
      }

      // 2. Prüfe Account- & Einstellungs-Konfiguration (sipusersconfig0, ~2 KB)
      if (
        configMeta &&
        configMeta.updated &&
        parsePbTimestamp(configMeta.updated) > parsePbTimestamp(this.lastKnownConfigServerUpdated)
      ) {
        try {
          const configRecord: any = await pb.collection(SIP_DATABASE_TABLE).getOne(SIP_CONFIG_ROW_ID, {
            requestKey: null,
            query: { _t: Date.now() },
          });
          if (configRecord && configRecord.payload) {
            this.lastKnownConfigServerUpdated = configRecord.updated || configMeta.updated;
            this.configListeners.forEach((cb) => {
              try {
                cb(configRecord.payload, configRecord.updated);
              } catch (err) {
                console.error('Error in config listener:', err);
              }
            });
          }
        } catch (configErr) {
          // Ignore transient config poll errors
        }
      }

      // 3. Prüfe Haupt-Session (currentsession0, ~500 KB) falls sich diese geändert hat (z.B. neues SiP / Import)
      if (
        sessionMeta &&
        sessionMeta.updated &&
        parsePbTimestamp(sessionMeta.updated) > parsePbTimestamp(this.lastKnownSessionServerUpdated) &&
        !this.isSyncingToSupabase &&
        !this.isSyncingLiveOverlay &&
        Date.now() - this.lastLocalMutationAt >= 2500
      ) {
        await this.fetchFromPocketBase(this.cachedSettings || undefined, false);
      }
    } catch (err) {
      if (!this.isSyncingToSupabase && Date.now() - this.lastLocalMutationAt >= 2500) {
        await this.fetchFromPocketBase(this.cachedSettings || undefined, false).catch(() => {});
      }
    } finally {
      this.isPollingCloud = false;
    }
  }

  public async setupPocketBase(_settings?: AppSettings) {
    if (this.isPocketBaseSubscribed) {
      try {
        await pb.collection(SIP_DATABASE_TABLE).unsubscribe('*');
      } catch (unsubErr) {
        console.warn('PocketBase unsubscribe error:', unsubErr);
      }
      this.isPocketBaseSubscribed = false;
    }

    try {
      const handleRealtimeRecord = (e: any) => {
        if (!e || e.action === 'delete') return;
        const record = e.record;
        if (!record) return;

        if (record.id === SIP_LIVE_ROW_ID && record.payload) {
          if (
            !this.isSyncingLiveOverlay &&
            !Boolean(localStorage.getItem(SIP_PENDING_SESSION_SYNC_KEY)) &&
            Date.now() - this.lastLocalMutationAt >= 1200
          ) {
            this.applyLiveOverlay(record.payload as SipLiveStateOverlay, record.updated, true);
          } else if (record.updated) {
            this.lastKnownLiveServerUpdated = record.updated;
          }
        } else if ((!record.id || record.id === SIP_DB_ROW_ID) && record.payload) {
          if (record.updated) {
            this.lastKnownSessionServerUpdated = record.updated;
          }
          if (
            !this.isSyncingToSupabase &&
            !this.isSyncingLiveOverlay &&
            Date.now() - this.lastLocalMutationAt >= 2000
          ) {
            let sessionPayload = record.payload as SipSession;
            if (
              this.latestLiveOverlay &&
              (!this.latestLiveOverlay.sessionId ||
                this.latestLiveOverlay.sessionId === sessionPayload.id) &&
              parsePbTimestamp(this.latestLiveOverlay.updatedAt) >=
                parsePbTimestamp(sessionPayload.updatedAt)
            ) {
              sessionPayload = this.mergeOverlayIntoSession(sessionPayload, this.latestLiveOverlay);
            }
            this.setAppState(sessionPayload, false);
          }
        } else if (record.id === SIP_CONFIG_ROW_ID && record.payload) {
          if (record.updated) {
            this.lastKnownConfigServerUpdated = record.updated;
          }
          this.configListeners.forEach((cb) => {
            try {
              cb(record.payload, record.updated);
            } catch (err) {
              console.error('Error in config listener:', err);
            }
          });
        }
      };

      await pb.collection(SIP_DATABASE_TABLE).subscribe('*', handleRealtimeRecord);
      this.isPocketBaseSubscribed = true;
      console.log(`[SiP Realtime] Connected to PocketBase collection: ${SIP_DATABASE_TABLE}`);
    } catch (err) {
      console.warn('PocketBase Realtime setup error:', err);
    }
  }

  public setupSupabase(settings: AppSettings) {
    return this.setupPocketBase(settings);
  }

  public getSession(): SipSession {
    return this.currentSession;
  }

  public subscribe(cb: (session: SipSession) => void): () => void {
    this.listeners.add(cb);
    cb(this.currentSession);
    return () => this.listeners.delete(cb);
  }

  public onConfigUpdate(cb: (payload: any, recordUpdated?: string) => void): () => void {
    this.configListeners.add(cb);
    return () => this.configListeners.delete(cb);
  }

  public onNotification(cb: (notif: SipNotification) => void): () => void {
    this.notificationListeners.add(cb);
    return () => this.notificationListeners.delete(cb);
  }

  public onBlurPopup(cb: (antrag: SipAntrag) => void): () => void {
    this.activeBlurPopupListeners.add(cb);
    return () => this.activeBlurPopupListeners.delete(cb);
  }

  private saveToStorage() {
    try {
      const overlay = this.buildLiveOverlay(this.currentSession);
      this.latestLiveOverlay = overlay;
      localStorage.setItem(SIP_LIVE_OVERLAY_STORAGE_KEY, JSON.stringify(overlay));
    } catch (overlayErr) {
      try {
        localStorage.removeItem('sip_archived_sessions_v1');
        const overlay = this.buildLiveOverlay(this.currentSession);
        localStorage.setItem(SIP_LIVE_OVERLAY_STORAGE_KEY, JSON.stringify(overlay));
      } catch (e) {}
    }

    try {
      localStorage.setItem(SIP_STORAGE_KEY, JSON.stringify(this.currentSession));
    } catch (err: any) {
      try {
        localStorage.removeItem('sip_archived_sessions_v1');
        localStorage.setItem(SIP_STORAGE_KEY, JSON.stringify(this.currentSession));
      } catch (retryErr) {}
    }
  }

  private notify() {
    const snapshot: SipSession = { ...this.currentSession };
    this.listeners.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (err) {
        console.error('Error in session listener:', err);
      }
    });
    this.saveToStorage();
  }

  public broadcastConfigSync(settings: AppSettings) {
    this.broadcastMessage({ type: 'CONFIG_SYNC', settings });
  }

  public markConfigServerUpdated(updated?: string) {
    if (updated) {
      this.lastKnownConfigServerUpdated = updated;
    }
  }

  private triggerNotification(notif: SipNotification) {
    const sig = notif.id || `${notif.type}_${notif.title}_${notif.message}`;
    const now = Date.now();
    const lastTriggered = this.recentNotificationSignatures.get(sig);
    if (lastTriggered && now - lastTriggered < 8000) {
      return;
    }
    this.recentNotificationSignatures.set(sig, now);

    if (this.recentNotificationSignatures.size > 100) {
      this.recentNotificationSignatures.forEach((time, k) => {
        if (now - time > 30000) this.recentNotificationSignatures.delete(k);
      });
    }

    this.notificationListeners.forEach((cb) => {
      try {
        cb(notif);
      } catch (err) {
        console.error('Error in notification listener:', err);
      }
    });
  }

  private triggerBlurPopup(antrag: SipAntrag) {
    this.activeBlurPopupListeners.forEach((cb) => {
      try {
        cb(antrag);
      } catch (err) {
        console.error('Error in blur popup listener:', err);
      }
    });
  }

  private broadcastMessage(msg: SipRealtimeMessage, _settings?: AppSettings) {
    if (this.localChannel) {
      try {
        this.localChannel.postMessage(msg);
      } catch (err: any) {
        const errorMsg = err.message || 'Unknown error';
        void errorMsg;
      }
    }
  }

  private handleIncomingMessage(msg: SipRealtimeMessage) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'STATE_SYNC':
        if (
          msg.session &&
          (!this.currentSession ||
            parsePbTimestamp(msg.session.updatedAt) > parsePbTimestamp(this.currentSession.updatedAt))
        ) {
          this.applyCloudSession(msg.session, false);
        }
        break;

      case 'CONFIG_SYNC':
        if (msg.settings) {
          this.configListeners.forEach((cb) => {
            try {
              // WICHTIG: undefined als recordUpdated übergeben, da msg.settings.updatedAt ein Client-ISO-String ist!
              cb(msg.settings, undefined);
            } catch (err) {
              console.error('Error in config listener:', err);
            }
          });
        }
        break;

      case 'NEW_ACTIVE_ANTRAG': {
        const targetAntrag =
          this.currentSession.antraege.find((a) => a.id === msg.antragId) || msg.antrag;
        const ts = msg.updatedAt || this.nextTimestamp();

        this.currentSession = {
          ...this.currentSession,
          activeAntragId: msg.antragId,
          voteRecommendation: {
            type: 'KEINE',
            note: '',
            updatedAt: ts,
            updatedBy: 'Strategieführung',
            isPublished: false,
          },
          antraege: this.currentSession.antraege.map((a) => ({
            ...a,
            isActive: a.id === msg.antragId,
          })),
          updatedAt: ts,
        };
        this.notify();
        this.triggerBlurPopup(targetAntrag);
        const activeNotif: SipNotification = {
          id: `notif_${Date.now()}`,
          title: '🚨 Neuer Antrag aufgerufen!',
          message: `${targetAntrag.title} wird jetzt im Parlament verhandelt.`,
          type: 'motion',
          timestamp: new Date().toISOString(),
          antragId: msg.antragId,
        };
        this.triggerNotification(activeNotif);
        break;
      }

      case 'VOTE_REC_CHANGED': {
        const ts = msg.updatedAt || msg.recommendation.updatedAt || this.nextTimestamp();
        this.currentSession = {
          ...this.currentSession,
          voteRecommendation: msg.recommendation,
          updatedAt: ts,
        };
        this.notify();
        const voteNotif: SipNotification = {
          id: `notif_${Date.now()}`,
          title: `🗳️ Abstimmungsempfehlung: ${msg.recommendation.type}`,
          message: msg.recommendation.note || 'Die Strategieführung hat die Empfehlung aktualisiert.',
          type: 'vote',
          timestamp: new Date().toISOString(),
        };
        this.triggerNotification(voteNotif);
        break;
      }

      case 'ANTRAG_CLAIMED': {
        const ts = msg.claimedAt || this.nextTimestamp();
        this.currentSession = {
          ...this.currentSession,
          antraege: this.currentSession.antraege.map((a) =>
            a.id === msg.antragId
              ? { ...a, claimedBy: msg.claimedBy, claimedAt: ts }
              : a
          ),
          updatedAt: ts,
        };
        this.notify();
        const claimNotif: SipNotification = {
          id: `notif_${Date.now()}`,
          title: '📢 Antrag geclaimed!',
          message: `${msg.claimedBy} hat "${msg.antragTitle}" geclaimed.`,
          type: 'claim',
          timestamp: new Date().toISOString(),
          antragId: msg.antragId,
        };
        this.triggerNotification(claimNotif);
        break;
      }

      case 'ANTRAG_UNCLAIMED': {
        const ts = msg.updatedAt || this.nextTimestamp();
        this.currentSession = {
          ...this.currentSession,
          antraege: this.currentSession.antraege.map((a) =>
            a.id === msg.antragId ? { ...a, claimedBy: null, claimedAt: null } : a
          ),
          updatedAt: ts,
        };
        this.notify();
        break;
      }

      case 'ANTRAG_SUBMITTED': {
        const exists = this.currentSession.antraege.some((a) => a.id === msg.antrag.id);
        if (!exists) {
          const ts = msg.updatedAt || msg.antrag.createdAt || this.nextTimestamp();
          this.currentSession = {
            ...this.currentSession,
            antraege: [msg.antrag, ...this.currentSession.antraege],
            updatedAt: ts,
          };
          this.notify();
          const submitNotif: SipNotification = {
            id: `notif_${Date.now()}`,
            title: '📝 Neuer Antrag eingereicht',
            message: `${msg.antrag.author} hat einen neuen Antrag eingereicht.`,
            type: 'motion',
            timestamp: new Date().toISOString(),
          };
          this.triggerNotification(submitNotif);
        }
        break;
      }

      case 'ANTRAG_APPROVED': {
        const ts = msg.updatedAt || this.nextTimestamp();
        this.currentSession = {
          ...this.currentSession,
          antraege: this.currentSession.antraege.map((a) =>
            a.id === msg.antrag.id ? msg.antrag : a
          ),
          updatedAt: ts,
        };
        this.notify();
        break;
      }

      case 'ANTRAG_DECIDED': {
        this.currentSession = {
          ...this.currentSession,
          antraege: this.currentSession.antraege.map((a) =>
            a.id === msg.antragId
              ? { ...a, plenumResult: msg.decision, plenumResultAt: msg.decidedAt }
              : a
          ),
          updatedAt:
            msg.decidedAt && msg.decidedAt > this.currentSession.updatedAt
              ? msg.decidedAt
              : this.nextTimestamp(),
        };
        this.notify();
        break;
      }

      case 'MEME_ADDED': {
        const exists = this.currentSession.memes.some((m) => m.id === msg.meme.id);
        if (!exists) {
          const ts = msg.updatedAt || msg.meme.createdAt || this.nextTimestamp();
          this.currentSession = {
            ...this.currentSession,
            memes: [msg.meme, ...this.currentSession.memes],
            updatedAt: ts,
          };
          this.notify();
        }
        break;
      }
    }
  }

  public logActivity(entry: Omit<SipActivityLogEntry, 'id' | 'timestamp'>) {
    const fullEntry: SipActivityLogEntry = {
      ...entry,
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    const currentLogs = this.currentSession.activityLog || [];
    this.currentSession = {
      ...this.currentSession,
      activityLog: [fullEntry, ...currentLogs].slice(0, 500),
    };
  }

  public async activateAntrag(antragId: string, settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    const antrag = this.currentSession.antraege.find((a) => a.id === antragId);
    if (!antrag) return;

    this.logActivity({
      action: 'ANTRAG_ACTIVATED',
      antragId,
      antragTitle: antrag.title,
      performedBy: 'Strategieführung',
      details: `Antrag "${antrag.title}" im Plenum aufgerufen`,
    });

    const ts = this.nextTimestamp();
    this.currentSession = {
      ...this.currentSession,
      activeAntragId: antragId,
      voteRecommendation: {
        type: 'KEINE',
        note: '',
        updatedAt: ts,
        updatedBy: 'Strategieführung',
        isPublished: false,
      },
      antraege: this.currentSession.antraege.map((a) => {
        if (a.type === 'ENDE_DEBATTE' || a.type === 'ENDE_REDNER') {
          return {
            ...a,
            isActive: false,
            claimedBy: null,
            claimedAt: null,
          };
        }
        return {
          ...a,
          isActive: a.id === antragId,
        };
      }),
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'NEW_ACTIVE_ANTRAG',
      antragId,
      antrag,
    };
    this.broadcastMessage(msg, settings);

    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async clearActiveAntrag(settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    this.logActivity({
      action: 'ANTRAG_CLEARED',
      performedBy: 'Strategieführung',
      details: 'Aufruf im Plenum beendet (Pause)',
    });

    const ts = this.nextTimestamp();
    this.currentSession = {
      ...this.currentSession,
      activeAntragId: null,
      voteRecommendation: {
        type: 'KEINE',
        note: '',
        updatedAt: ts,
        updatedBy: 'Strategieführung',
        isPublished: false,
      },
      antraege: this.currentSession.antraege.map((a) => ({
        ...a,
        isActive: false,
      })),
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async decideAntrag(
    antragId: string,
    decision: 'ANGENOMMEN' | 'ABGELEHNT',
    settings?: AppSettings
  ) {
    this.lastLocalMutationAt = Date.now();
    const decidedAt = this.nextTimestamp();
    const antrag = this.currentSession.antraege.find((a) => a.id === antragId);

    this.logActivity({
      action: 'ANTRAG_DECIDED',
      antragId,
      antragTitle: antrag?.title || antragId,
      performedBy: 'Strategieführung',
      details: `Antrag "${antrag?.title || antragId}" wurde als ${decision} markiert.`,
    });

    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.map((a) =>
        a.id === antragId
          ? { ...a, plenumResult: decision, plenumResultAt: decidedAt }
          : a
      ),
      updatedAt: decidedAt,
    };
    this.saveToStorage();
    this.notify();

    this.triggerNotification({
      id: `decision_${antragId}_${decision}`,
      title: decision === 'ANGENOMMEN' ? '🎉 Antrag angenommen!' : '❌ Antrag abgelehnt',
      message: `Antrag "${antrag?.title || antragId}" wurde vom Plenum ${decision === 'ANGENOMMEN' ? 'angenommen' : 'abgelehnt'}.`,
      type: decision === 'ANGENOMMEN' ? 'vote' : 'system',
      timestamp: decidedAt,
      antragId,
    });

    const msg: SipRealtimeMessage = {
      type: 'ANTRAG_DECIDED',
      antragId,
      decision,
      decidedAt,
    };
    this.broadcastMessage(msg, settings);

    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async setVoteRecommendation(
    rec: Omit<VoteRecommendation, 'updatedAt'>,
    settings?: AppSettings
  ) {
    this.lastLocalMutationAt = Date.now();
    const ts = this.nextTimestamp();
    const fullRec: VoteRecommendation = {
      ...rec,
      isPublished: rec.isPublished ?? true,
      updatedAt: ts,
    };

    this.logActivity({
      action: 'VOTE_REC_SET',
      performedBy: fullRec.updatedBy || 'Strategieführung',
      details: `Offizielle Abstimmungsempfehlung geändert: ${fullRec.type}${fullRec.note ? ` (${fullRec.note})` : ''}`,
    });

    this.currentSession = {
      ...this.currentSession,
      voteRecommendation: fullRec,
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    if (fullRec.isPublished && fullRec.type !== 'KEINE') {
      this.triggerNotification({
        id: `notif_${Date.now()}`,
        title: '📢 Offizielle Abstimmungsempfehlung!',
        message: `Empfehlung: ${fullRec.type}${fullRec.note ? ` – ${fullRec.note}` : ''}`,
        type: 'vote',
        timestamp: ts,
      });
    }

    const msg: SipRealtimeMessage = {
      type: 'VOTE_REC_CHANGED',
      recommendation: fullRec,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async claimAntrag(antragId: string, memberName: string, settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    const target = this.currentSession.antraege.find((a) => a.id === antragId);
    if (!target) return;

    this.logActivity({
      action: 'ANTRAG_CLAIMED',
      antragId,
      antragTitle: target.title,
      performedBy: memberName,
      details: `${memberName} hat Rede geclaimed: "${target.title}"`,
    });

    const claimedAt = this.nextTimestamp();
    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.map((a) =>
        a.id === antragId ? { ...a, claimedBy: memberName, claimedAt } : a
      ),
      updatedAt: claimedAt,
    };
    this.saveToStorage();
    this.notify();

    this.triggerNotification({
      id: `notif_${Date.now()}`,
      title: '📢 Antrag geclaimed!',
      message: `${memberName} hat "${target.title}" geclaimed.`,
      type: 'claim',
      timestamp: claimedAt,
      antragId,
    });

    const msg: SipRealtimeMessage = {
      type: 'ANTRAG_CLAIMED',
      antragId,
      antragTitle: target.title,
      claimedBy: memberName,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async unclaimAntrag(antragId: string, memberName: string, settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    const target = this.currentSession.antraege.find((a) => a.id === antragId);
    if (!target) return;

    this.logActivity({
      action: 'ANTRAG_UNCLAIMED',
      antragId,
      antragTitle: target.title,
      performedBy: memberName,
      details: `${memberName} hat Claim abgegeben: "${target.title}"`,
    });

    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.map((a) =>
        a.id === antragId ? { ...a, claimedBy: null, claimedAt: null } : a
      ),
      updatedAt: this.nextTimestamp(),
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'ANTRAG_UNCLAIMED',
      antragId,
      antragTitle: target.title,
      unclaimedBy: memberName,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public submitCustomAntrag(
    antragData: Omit<SipAntrag, 'id' | 'isPreFab' | 'status' | 'createdAt'>,
    settings?: AppSettings
  ): SipAntrag {
    this.lastLocalMutationAt = Date.now();
    const ts = this.nextTimestamp();
    const newAntrag: SipAntrag = {
      ...antragData,
      id: `antrag_custom_${Date.now()}`,
      isPreFab: false,
      status: 'pending_approval',
      createdAt: ts,
      claimedBy: antragData.author,
      claimedAt: ts,
    };

    this.logActivity({
      action: 'ANTRAG_SUBMITTED',
      antragId: newAntrag.id,
      antragTitle: newAntrag.title,
      performedBy: antragData.author,
      details: `${antragData.author} hat [${newAntrag.type}] eingereicht: "${newAntrag.title}"`,
    });

    this.currentSession = {
      ...this.currentSession,
      antraege: [newAntrag, ...this.currentSession.antraege],
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'ANTRAG_SUBMITTED',
      antrag: newAntrag,
    };
    this.broadcastMessage(msg, settings);
    void this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);

    return newAntrag;
  }

  public async updateOrApproveAntrag(
    antragId: string,
    updates: Partial<SipAntrag>,
    settings?: AppSettings
  ) {
    this.lastLocalMutationAt = Date.now();
    const ts = this.nextTimestamp();
    let updatedObj: SipAntrag | null = null;
    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.map((a) => {
        if (a.id === antragId) {
          const isEdited =
            updates.title !== undefined ||
            updates.content !== undefined ||
            updates.author !== undefined ||
            updates.type !== undefined ||
            updates.lineOrParagraph !== undefined ||
            Boolean(a.isEditedByAdmin);
          updatedObj = {
            ...a,
            ...updates,
            isEditedByAdmin: isEdited,
            updatedAt: ts,
          } as SipAntrag;
          return updatedObj;
        }
        return a;
      }),
      updatedAt: ts,
    };

    if (updatedObj) {
      const actAction = updates.status === 'approved' ? 'ANTRAG_APPROVED' : updates.status === 'rejected' ? 'ANTRAG_REJECTED' : 'ANTRAG_EDITED';
      const actDetail = updates.status === 'approved' ? `Antrag "${(updatedObj as SipAntrag).title}" bestätigt & freigegeben` : updates.status === 'rejected' ? `Antrag "${(updatedObj as SipAntrag).title}" abgelehnt` : `Antrag "${(updatedObj as SipAntrag).title}" redaktionell bearbeitet`;

      this.logActivity({
        action: actAction,
        antragId,
        antragTitle: (updatedObj as SipAntrag).title,
        performedBy: 'Strategieführung',
        details: actDetail,
      });
    }

    this.saveToStorage();
    this.notify();

    if (updatedObj) {
      const msg: SipRealtimeMessage = {
        type: 'ANTRAG_APPROVED',
        antrag: updatedObj,
      };
      this.broadcastMessage(msg, settings);
    }
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async deleteAntrag(antragId: string, settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    this.deletedAntragIds.add(antragId);
    const target = this.currentSession.antraege.find((a) => a.id === antragId);
    if (target) {
      this.logActivity({
        action: 'ANTRAG_DELETED',
        antragId,
        antragTitle: target.title,
        performedBy: 'Strategieführung',
        details: `Antrag "${target.title}" gelöscht`,
      });
    }

    this.currentSession = {
      ...this.currentSession,
      antraege: this.currentSession.antraege.filter((a) => a.id !== antragId),
      activeAntragId:
        this.currentSession.activeAntragId === antragId
          ? null
          : this.currentSession.activeAntragId,
      updatedAt: this.nextTimestamp(),
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async archiveAndClearCurrentSession(settings?: AppSettings): Promise<void> {
    this.lastLocalMutationAt = Date.now();
    this.deletedAntragIds.clear();
    const oldSession = { ...this.currentSession };

    const ts = this.nextTimestamp();
    this.currentSession = {
      id: `session_${Date.now()}`,
      title: `${oldSession.title} (Archiviert)`,
      driveFolderUrl: '',
      strategyNotes: '',
      activeAntragId: null,
      voteRecommendation: {
        type: 'KEINE',
        note: '',
        updatedAt: ts,
        updatedBy: 'Strategieführung',
        isPublished: false,
      },
      antraege: [],
      memes: [],
      activityLog: [
        {
          id: `act_${Date.now()}`,
          timestamp: ts,
          performedBy: 'Strategieführung',
          action: 'SESSION_ARCHIVED',
          details: `Sitzung "${oldSession.title}" wurde archiviert. Alle Kategorien wurden für das Plenum geleert.`,
        },
      ],
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    const stateSyncMsg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(stateSyncMsg, settings);

    await archiveCurrentSession(oldSession, 'Strategieführung', settings || this.cachedSettings || undefined);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async startNewSession(
    options: {
      title: string;
      driveFolderUrl?: string;
      skipArchive?: boolean;
      antraege?: SipAntrag[];
      strategyNotes?: string;
    },
    settings?: AppSettings
  ): Promise<void> {
    this.lastLocalMutationAt = Date.now();
    this.deletedAntragIds.clear();
    const oldSession = { ...this.currentSession };

    const initialAntraege = (options.antraege || []).map((a) => ({
      ...a,
      isPreFab: false,
    }));
    const hauptCount = initialAntraege.filter((a) => a.type === 'HAUPTANTRAG').length;
    const subCount = initialAntraege.filter((a) => a.type !== 'HAUPTANTRAG').length;
    const ts = this.nextTimestamp();

    this.currentSession = {
      id: `session_${Date.now()}`,
      title: options.title.trim() || 'Neues Schüler:innenparlament (SiP)',
      driveFolderUrl: (options.driveFolderUrl || '').trim(),
      strategyNotes: options.strategyNotes || '',
      activeAntragId: null,
      voteRecommendation: {
        type: 'KEINE',
        note: '',
        updatedAt: ts,
        updatedBy: 'Strategieführung',
        isPublished: false,
      },
      antraege: initialAntraege,
      memes: [],
      activityLog: [
        {
          id: `act_${Date.now()}`,
          timestamp: ts,
          performedBy: 'Strategieführung',
          action: 'SESSION_ARCHIVED',
          details: `Neues SiP "${options.title.trim()}" gestartet.${
            initialAntraege.length > 0
              ? ` Automatischer Import: ${hauptCount} Hauptanträge und ${subCount} Nebenanträge synchronisiert.`
              : ' Kategorien geleert.'
          } Drive-Ordner: ${options.driveFolderUrl?.trim() || 'noch keiner hinterlegt'}.`,
        },
      ],
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    const stateSyncMsg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(stateSyncMsg, settings);

    if (!options.skipArchive && (oldSession.antraege.length > 0 || (oldSession.activityLog || []).length > 1)) {
      await archiveCurrentSession(oldSession, 'Strategieführung', settings || this.cachedSettings || undefined);
    }
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async importCombinedAntraegeAndStrategy(
    antraege: SipAntrag[],
    strategyNotes?: string,
    settings?: AppSettings
  ): Promise<void> {
    this.lastLocalMutationAt = Date.now();
    this.deletedAntragIds.clear();
    const normalizedInput = antraege.map((a) => ({ ...a, isPreFab: false }));
    const hauptantraege = normalizedInput.filter((a) => a.type === 'HAUPTANTRAG');
    const nebenantraege = normalizedInput.filter((a) => a.type !== 'HAUPTANTRAG');
    const hauptCount = hauptantraege.length;
    const subCount = nebenantraege.length;

    const finalMotions =
      hauptCount > 0
        ? [...hauptantraege, ...nebenantraege]
        : [...this.currentSession.antraege, ...normalizedInput];

    if (hauptCount > 0) {
      console.log(
        'FINAL MERGE: Hauptanträge:',
        hauptantraege.length,
        'Nebenanträge:',
        nebenantraege.length,
        'Gesamt:',
        finalMotions.length
      );
    }

    const ts = this.nextTimestamp();
    this.currentSession = {
      ...this.currentSession,
      id:
        this.currentSession.id === 'currentsession0'
          ? `session_${Date.now()}`
          : this.currentSession.id,
      antraege: finalMotions,
      strategyNotes: strategyNotes
        ? this.currentSession.strategyNotes && hauptCount === 0
          ? `${this.currentSession.strategyNotes}\n\n${strategyNotes}`
          : strategyNotes
        : this.currentSession.strategyNotes,
      activityLog: [
        {
          id: `act_${Date.now()}`,
          timestamp: ts,
          performedBy: 'Strategieführung',
          action: 'ANTRAG_IMPORTED',
          details: `Automatischer SiP-Import: ${hauptCount} Hauptanträge und ${subCount} Nebenanträge erfolgreich synchronisiert.`,
        },
        ...(this.currentSession.activityLog || []),
      ],
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    const stateSyncMsg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(stateSyncMsg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async deleteMeme(memeId: string, settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    this.currentSession = {
      ...this.currentSession,
      memes: this.currentSession.memes.filter((m) => m.id !== memeId),
      updatedAt: this.nextTimestamp(),
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async importAntraege(newAntraege: SipAntrag[], settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    this.deletedAntragIds.clear();
    const normalizedInput = newAntraege.map((a) => ({ ...a, isPreFab: false }));
    const hauptantraege = normalizedInput.filter((a) => a.type === 'HAUPTANTRAG');
    const nebenantraege = normalizedInput.filter((a) => a.type !== 'HAUPTANTRAG');

    const finalMotions =
      hauptantraege.length > 0
        ? [...hauptantraege, ...nebenantraege]
        : [...normalizedInput, ...this.currentSession.antraege];

    if (hauptantraege.length > 0) {
      console.log(
        'FINAL MERGE: Hauptanträge:',
        hauptantraege.length,
        'Nebenanträge:',
        nebenantraege.length,
        'Gesamt:',
        finalMotions.length
      );
    }

    this.currentSession = {
      ...this.currentSession,
      id:
        this.currentSession.id === 'currentsession0'
          ? `session_${Date.now()}`
          : this.currentSession.id,
      antraege: finalMotions,
      updatedAt: this.nextTimestamp(),
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async updateStrategyNotes(notes: string, settings?: AppSettings) {
    this.lastLocalMutationAt = Date.now();
    this.currentSession = {
      ...this.currentSession,
      strategyNotes: notes,
      updatedAt: this.nextTimestamp(),
    };
    this.saveToStorage();
    this.notify();

    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async updateSessionMetadata(
    metadata: { title?: string; driveFolderUrl?: string },
    settings?: AppSettings
  ) {
    this.lastLocalMutationAt = Date.now();
    this.currentSession = {
      ...this.currentSession,
      ...metadata,
      updatedAt: this.nextTimestamp(),
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async addMeme(
    memeData: { author: string; imageUrl: string; caption: string },
    settings?: AppSettings
  ) {
    this.lastLocalMutationAt = Date.now();
    const ts = this.nextTimestamp();
    const newMeme: SipMeme = {
      id: `meme_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      author: memeData.author,
      imageUrl: memeData.imageUrl,
      caption: memeData.caption,
      createdAt: ts,
      reactions: {},
    };

    this.currentSession = {
      ...this.currentSession,
      memes: [newMeme, ...this.currentSession.memes],
      updatedAt: ts,
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'MEME_ADDED',
      meme: newMeme,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async toggleMemeReaction(
    memeId: string,
    emoji: string,
    userName: string,
    settings?: AppSettings
  ) {
    this.lastLocalMutationAt = Date.now();
    this.currentSession = {
      ...this.currentSession,
      memes: this.currentSession.memes.map((meme) => {
        if (meme.id !== memeId) return meme;

        const currentUsers = meme.reactions[emoji] || [];
        const hasReacted = currentUsers.includes(userName);
        const updatedUsers = hasReacted
          ? currentUsers.filter((u) => u !== userName)
          : [...currentUsers, userName];

        const updatedReactions = { ...meme.reactions };
        if (updatedUsers.length > 0) {
          updatedReactions[emoji] = updatedUsers;
        } else {
          delete updatedReactions[emoji];
        }

        return { ...meme, reactions: updatedReactions };
      }),
      updatedAt: this.nextTimestamp(),
    };
    this.saveToStorage();
    this.notify();

    const msg: SipRealtimeMessage = {
      type: 'STATE_SYNC',
      session: this.currentSession,
    };
    this.broadcastMessage(msg, settings);
    await this.syncSessionToSupabase(settings || this.cachedSettings || undefined, this.currentSession);
  }

  public async fetchFromPocketBase(_settings?: AppSettings, forceOverwrite = false): Promise<SipSession | null> {
    if (
      this.isSyncingToSupabase ||
      this.isSyncingLiveOverlay ||
      (!forceOverwrite && Boolean(localStorage.getItem(SIP_PENDING_SESSION_SYNC_KEY))) ||
      (!forceOverwrite && Date.now() - this.lastLocalMutationAt < 2000)
    ) {
      return null;
    }
    if (this.isFetchingSession && !forceOverwrite) {
      return null;
    }

    this.isFetchingSession = true;

    // 1. Lade zuerst das kompakte Live-Overlay (siplivestate000, ~25 KB -> dauert nur ~300ms!)
    try {
      const liveRecord: any = await pb.collection(SIP_DATABASE_TABLE).getOne(SIP_LIVE_ROW_ID, {
        requestKey: null,
        query: { _t: Date.now() },
      });
      if (
        liveRecord &&
        liveRecord.payload &&
        !this.isSyncingLiveOverlay &&
        !Boolean(localStorage.getItem(SIP_PENDING_SESSION_SYNC_KEY)) &&
        Date.now() - this.lastLocalMutationAt >= 1500
      ) {
        this.applyLiveOverlay(
          liveRecord.payload as SipLiveStateOverlay,
          liveRecord.updated,
          true
        );
      }
    } catch (liveFetchErr) {
      // Falls siplivestate000 noch nicht existiert, fahren wir mit currentsession0 fort
    }

    // 2. Lade anschließend die vollständige Session (currentsession0)
    const rowId = SIP_DB_ROW_ID;
    let rawRecord: any = null;
    let readError: any = null;

    try {
      rawRecord = await pb.collection(SIP_DATABASE_TABLE).getOne(rowId, {
        requestKey: null,
        query: { _t: Date.now() },
      });
    } catch (err: any) {
      readError = err;
    } finally {
      this.isFetchingSession = false;
    }

    if (
      !forceOverwrite &&
      (this.isSyncingToSupabase ||
        this.isSyncingLiveOverlay ||
        Boolean(localStorage.getItem(SIP_PENDING_SESSION_SYNC_KEY)) ||
        Date.now() - this.lastLocalMutationAt < 2000)
    ) {
      return null;
    }

    if (!readError && rawRecord) {
      const record = rawRecord as unknown as SipStateRecord;
      if (record.updated) {
        this.lastKnownSessionServerUpdated = record.updated;
      }
      if (record && record.payload) {
        let sessionData = record.payload as unknown as SipSession;
        // WICHTIG: Falls siplivestate000 (oder unser lokales Live-Overlay) aktueller als currentsession0 ist,
        // wenden wir das Live-Overlay über currentsession0 an, damit kein älterer 500KB-Stand neue Klicks überschreibt!
        if (
          this.latestLiveOverlay &&
          (!this.latestLiveOverlay.sessionId ||
            this.latestLiveOverlay.sessionId === sessionData.id) &&
          parsePbTimestamp(this.latestLiveOverlay.updatedAt) >=
            parsePbTimestamp(sessionData.updatedAt)
        ) {
          sessionData = this.mergeOverlayIntoSession(sessionData, this.latestLiveOverlay);
        }
        this.setAppState(sessionData, true);
        return sessionData;
      }
      return null;
    }

    const status = readError ? readError.status : 0;
    if (status === 404) {
      const createObj = {
        id: rowId,
        payload: DEFAULT_SIP_SESSION,
      };

      let createdRaw: any = null;
      let createError: any = null;

      try {
        createdRaw = await pb.collection(SIP_DATABASE_TABLE).create(createObj, {
          requestKey: null,
        });
      } catch (err: any) {
        createError = err;
      }

      if (!createError && createdRaw) {
        const createdRecord = createdRaw as unknown as SipStateRecord;
        if (createdRecord.updated) {
          this.lastKnownSessionServerUpdated = createdRecord.updated;
        }
        if (createdRecord && createdRecord.payload) {
          const sessionData = createdRecord.payload as unknown as SipSession;
          this.setAppState(sessionData, false);
          return sessionData;
        }
      } else if (createError) {
        console.warn('Could not auto-create initial SiP session in PocketBase:', createError);
      }
      return null;
    }

    if (readError) {
      console.warn('Could not fetch SiP session from PocketBase:', readError);
    }
    return null;
  }

  public async fetchFromSupabase(settings?: AppSettings, forceOverwrite = false): Promise<SipSession | null> {
    return this.fetchFromPocketBase(settings, forceOverwrite);
  }

  private stripRedundantTextFromSession(session: SipSession): SipSession {
    return {
      ...session,
      antraege: (session.antraege || []).map((a: any) => {
        if (a && a.text && a.text === a.content) {
          const { text, ...rest } = a;
          return rest as SipAntrag;
        }
        return a as SipAntrag;
      }),
    };
  }

  private async syncLiveOverlayToPocketBase(overlay: SipLiveStateOverlay): Promise<void> {
    this.lastLocalMutationAt = Date.now();
    this.latestLiveOverlay = overlay;
    try {
      localStorage.setItem(SIP_LIVE_OVERLAY_STORAGE_KEY, JSON.stringify(overlay));
      localStorage.setItem(SIP_PENDING_SESSION_SYNC_KEY, JSON.stringify(overlay));
    } catch (e) {}

    if (this.isSyncingLiveOverlay) {
      this.pendingLiveOverlay = overlay;
      return;
    }

    this.isSyncingLiveOverlay = true;
    let currentOverlay: SipLiveStateOverlay | null = overlay;

    try {
      while (currentOverlay) {
        const snapshot = currentOverlay;
        this.pendingLiveOverlay = null;
        this.lastLocalMutationAt = Date.now();

        const res = await upsertSipRow({
          id: SIP_LIVE_ROW_ID,
          payload: snapshot,
        });

        if (res.success && res.data?.updated) {
          this.lastKnownLiveServerUpdated = res.data.updated;
          try {
            localStorage.setItem(SIP_LAST_LIVE_SERVER_UPDATED_KEY, res.data.updated);
          } catch (e) {}
        }

        if (
          res.success &&
          !this.pendingLiveOverlay &&
          this.latestLiveOverlay?.updatedAt === snapshot.updatedAt
        ) {
          try {
            localStorage.removeItem(SIP_PENDING_SESSION_SYNC_KEY);
          } catch (e) {}
        }

        this.lastLocalMutationAt = Date.now();
        currentOverlay = this.pendingLiveOverlay;
      }
    } finally {
      this.lastLocalMutationAt = Date.now();
      this.isSyncingLiveOverlay = false;
    }
  }

  private scheduleFullSessionSync(sessionToSave: SipSession): void {
    if (this.fullSessionSyncTimer) {
      clearTimeout(this.fullSessionSyncTimer);
    }
    this.fullSessionSyncTimer = setTimeout(() => {
      this.fullSessionSyncTimer = null;
      void this.syncFullSessionRecord(sessionToSave);
    }, 300);
  }

  private async persistSingleSessionToPocketBase(sessionToSave: SipSession): Promise<void> {
    const rowId = SIP_DB_ROW_ID;
    const optimizedSession = this.stripRedundantTextFromSession(sessionToSave);
    const recordData = {
      id: rowId,
      payload: optimizedSession,
    };

    let updateError: any = null;

    try {
      const updated = await pb.collection(SIP_DATABASE_TABLE).update(rowId, recordData, {
        fields: 'id,updated',
        requestKey: null,
      });
      if (updated && updated.updated) {
        this.lastKnownSessionServerUpdated = updated.updated;
      }
    } catch (err: any) {
      updateError = err;
    }

    if (!updateError) {
      return;
    }

    const status = updateError ? updateError.status : 0;
    if (status === 404) {
      const createObj = {
        id: rowId,
        payload: optimizedSession,
      };

      try {
        const created = await pb.collection(SIP_DATABASE_TABLE).create(createObj, {
          fields: 'id,updated',
          requestKey: null,
        });
        if (created && created.updated) {
          this.lastKnownSessionServerUpdated = created.updated;
        }
      } catch (createErr: any) {
        console.warn('Could not create SiP session in PocketBase:', createErr);
      }
      return;
    }

    console.warn('Could not update SiP session in PocketBase:', updateError);
  }

  private async syncFullSessionRecord(targetSession: SipSession): Promise<void> {
    if (this.isSyncingToSupabase) {
      this.pendingSyncSession = {
        settings: this.cachedSettings || undefined,
        session: targetSession,
      };
      return;
    }

    this.isSyncingToSupabase = true;
    let currentToSync: { settings?: AppSettings; session: SipSession } | null = {
      settings: this.cachedSettings || undefined,
      session: targetSession,
    };

    try {
      while (currentToSync) {
        const itemToSync = currentToSync;
        const newState = itemToSync.session;
        this.pendingSyncSession = null;
        this.lastLocalMutationAt = Date.now();

        await this.persistSingleSessionToPocketBase(newState);

        this.lastLocalMutationAt = Date.now();
        currentToSync = this.pendingSyncSession;
      }
    } finally {
      this.lastLocalMutationAt = Date.now();
      this.isSyncingToSupabase = false;
    }
  }

  public async syncSessionToPocketBase(_settings?: AppSettings, session?: SipSession): Promise<void> {
    const targetSession = session || this.currentSession;
    this.lastLocalMutationAt = Date.now();

    // 1. Sofortiges Speichern des kompakten Live-Overlays (siplivestate000, ~25 KB, keepalive: true)
    // Dauert nur ~400ms, überlebt Seiten-Reload (F5) und triggert Echtzeit-Updates auf allen Geräten!
    const liveOverlay = this.buildLiveOverlay(targetSession);
    await this.syncLiveOverlayToPocketBase(liveOverlay);

    // 2. Vollständige Session (currentsession0) im Hintergrund nachziehen
    this.scheduleFullSessionSync(targetSession);
  }

  public async syncSessionToSupabase(settings?: AppSettings, session?: SipSession): Promise<void> {
    return this.syncSessionToPocketBase(settings, session);
  }
}

export const sipRealtime = new SipRealtimeService();

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Gavel,
  Target,
  FolderOpen,
  Smile,
  Plus,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Radio,
  User,
  Play,
  UserCheck,
  X,
  Check,
  Copy,
  Mic,
  Archive,
  Download,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  History,
  Search,
  Megaphone,
  Bookmark,
  Send,
  Edit3,
  Trash2,
  EyeOff,
} from 'lucide-react';
import { AppSettings, MemberAccount } from '../../types';
import {
  ANTRAG_TYPE_CONFIG,
  AntragType,
  DirectMessagePriority,
  SipAntrag,
  SipDirectMessage,
  SipNotification,
  SipSession,
  VoteType,
} from '../types';
import { sipRealtime } from '../sipRealtime';
import { VoteRecommendationBanner } from './VoteRecommendationBanner';
import { AntragCard } from './AntragCard';
import { BlurryMotionModal } from './BlurryMotionModal';
import { DirectMessageOverlayModal, DirectMessageComposerModal } from './DirectMessageModal';
import { NewAntragModal } from './NewAntragModal';
import { EditAntragModal } from './EditAntragModal';
import { MotionParserModal } from './MotionParserModal';
import { DriveFolderViewer } from './DriveFolderViewer';
import { MemeFeedTab } from './MemeFeedTab';
import { SipArchiveView } from './SipArchiveView';
import { downloadSipProtocol } from '../utils/protocolExporter';
import { cleanSubMotionTitle } from '../utils/sipAutoImporter';
import suLogo from '../../assets/su-logo.png';

interface PastAntragCardProps {
  hauptAntrag: SipAntrag;
  subAntraege: SipAntrag[];
}

export const PastAntragCard: React.FC<PastAntragCardProps> = ({
  hauptAntrag,
  subAntraege,
}) => {
  const [showForderungen, setShowForderungen] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showSubAntraege, setShowSubAntraege] = useState(false);
  const [hasCopiedRede, setHasCopiedRede] = useState(false);

  return (
    <div
      className={`rounded-3xl border-2 p-4 sm:p-5 shadow-xl space-y-3 transition-all ${
        hauptAntrag.plenumResult === 'ANGENOMMEN'
          ? 'bg-slate-900/90 border-emerald-500/40 shadow-emerald-500/5'
          : 'bg-slate-900/90 border-rose-500/40 shadow-rose-500/5'
      }`}
    >
      {/* 1. Header & Antragsnummer / Titel (Immer sichtbar) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-slate-800/80">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider border ${
                hauptAntrag.plenumResult === 'ANGENOMMEN'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}
            >
              {hauptAntrag.plenumResult === 'ANGENOMMEN' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                  <span>ANGENOMMEN</span>
                </>
              ) : (
                <>
                  <X className="w-4 h-4 text-rose-400 stroke-[3]" />
                  <span>ABGELEHNT</span>
                </>
              )}
            </span>

            <span className="text-xs font-mono px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
              {ANTRAG_TYPE_CONFIG[hauptAntrag.type]?.shortLabel}
            </span>

            {hauptAntrag.lineOrParagraph && (
              <span className="text-xs font-mono px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                📍 {hauptAntrag.lineOrParagraph}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Antragsteller:in: <strong className="text-white">{hauptAntrag.author}</strong></span>
            {hauptAntrag.plenumResultAt && (
              <span className="text-[11px] text-slate-500">
                • {new Date(hauptAntrag.plenumResultAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} Uhr
              </span>
            )}
          </div>
        </div>

        {/* Antragstitel */}
        <h3 className="text-base sm:text-lg font-bold text-white leading-snug">
          {hauptAntrag.title}
        </h3>
      </div>

      {/* 2. Separate Blöcke (standardmäßig alle eingeklappt) */}
      <div className="space-y-2 pt-1">
        {/* Block A: Forderungspunkte */}
        {hauptAntrag.forderungspunkte && hauptAntrag.forderungspunkte.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowForderungen(!showForderungen)}
              className="w-full flex items-center justify-between p-3 text-left text-xs font-bold text-sky-300 hover:bg-slate-900/60 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-sky-400" />
                <span>Daher fordert das Vorarlberger Schüler:innenparlament ({hauptAntrag.forderungspunkte.length})</span>
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <span className="text-[11px] font-normal">{showForderungen ? 'Einklappen' : 'Aufklappen'}</span>
                {showForderungen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showForderungen && (
              <div className="p-3.5 pt-0 border-t border-slate-800/80 mt-1 animate-in fade-in">
                <ul className="space-y-2 text-xs sm:text-sm text-slate-200 mt-2">
                  {hauptAntrag.forderungspunkte.map((fp, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-bold text-xs shrink-0 mt-0.5 border border-sky-500/30">
                        {idx + 1}
                      </span>
                      <span className="leading-relaxed font-medium">{fp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Block B: Antragstext / Vorbereitete Rede */}
        {(hauptAntrag.rede || hauptAntrag.content) && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowText(!showText)}
              className="w-full flex items-center justify-between p-3 text-left text-xs font-bold text-indigo-300 hover:bg-slate-900/60 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-indigo-400" />
                <span>{hauptAntrag.rede ? `Vorbereitete Rede (${hauptAntrag.author})` : 'Antragstext'}</span>
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <span className="text-[11px] font-normal">{showText ? 'Einklappen' : 'Aufklappen'}</span>
                {showText ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showText && (
              <div className="p-3.5 pt-0 border-t border-slate-800/80 mt-1 animate-in fade-in space-y-2">
                <div className="text-xs sm:text-sm text-slate-200 whitespace-pre-wrap leading-relaxed mt-2">
                  {hauptAntrag.rede || hauptAntrag.content}
                </div>
                {hauptAntrag.rede && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(hauptAntrag.rede || '');
                      setHasCopiedRede(true);
                      setTimeout(() => setHasCopiedRede(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    {hasCopiedRede ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{hasCopiedRede ? 'Kopiert!' : 'Rede kopieren'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Block C: Dazugehörige Nebenanträge */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSubAntraege(!showSubAntraege)}
            className="w-full flex items-center justify-between p-3 text-left text-xs font-bold text-purple-300 hover:bg-slate-900/60 transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Dazugehörige Nebenanträge ({subAntraege.length})</span>
            </div>
            <div className="flex items-center gap-1 text-slate-400">
              <span className="text-[11px] font-normal">{showSubAntraege ? 'Einklappen' : 'Aufklappen'}</span>
              {showSubAntraege ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showSubAntraege && (
            <div className="p-3.5 pt-0 border-t border-slate-800/80 mt-1 animate-in fade-in">
              {subAntraege.length === 0 ? (
                <p className="text-xs text-slate-500 italic mt-2">
                  Zu diesem Hauptantrag wurden keine Nebenanträge eingereicht.
                </p>
              ) : (
                <div className="space-y-2 mt-2">
                  {subAntraege.map((sub) => (
                    <div
                      key={sub.id}
                      className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              ANTRAG_TYPE_CONFIG[sub.type]?.badgeColor || 'bg-slate-800'
                            }`}
                          >
                            {ANTRAG_TYPE_CONFIG[sub.type]?.shortLabel}
                          </span>
                          {sub.lineOrParagraph && (
                            <span className="text-slate-400 font-mono text-[11px]">
                              📍 {sub.lineOrParagraph}
                            </span>
                          )}
                          <span className="font-semibold text-slate-200">
                            {cleanSubMotionTitle(sub.title)}
                          </span>
                        </div>
                        <p className="text-slate-400 text-xs line-clamp-2">
                          {sub.content}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                        {sub.claimedBy ? (
                          <span className="px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold">
                            🎙️ {sub.claimedBy}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">
                            Nicht geclaimed
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface SipMainViewProps {
  settings: AppSettings;
  currentMember: MemberAccount | null;
  isAdminUnlocked: boolean;
}

export type SipSubTab = 'antraege' | 'past_antraege' | 'drive' | 'memes' | 'archive';

export const SipMainView: React.FC<SipMainViewProps> = ({
  settings,
  currentMember,
  isAdminUnlocked,
}) => {
  const [session, setSession] = useState<SipSession>(() => sipRealtime.getSession());
  const [currentSubTab, setCurrentSubTab] = useState<SipSubTab>('antraege');
    const [viewMode, setViewMode] = useState<'strategy' | 'member' | 'guest'>('strategy');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isStrategieLeader, setIsStrategieLeader] = useState<boolean>(
    () => isAdminUnlocked || currentMember?.role === 'strategie' || currentMember?.role === 'admin'
  );
  // Nur der echte Administrator (nicht Strategieführung, nicht Mitglieder, nicht Gäste)
  const isStrictAdmin = currentMember?.role === 'admin';
  const isStrategyView = isStrategieLeader && viewMode === 'strategy';
  const isMemberPreview = isStrategieLeader && viewMode === 'member';
  const isGuestPreview = isStrategieLeader && viewMode === 'guest';

  const canViewPastAntraege = isGuestPreview
    ? false
    : isMemberPreview
      ? true
      : isStrategieLeader ||
        isStrictAdmin ||
        (currentMember?.role === 'mitglied' && currentMember.isExternal !== true);

  const canViewMemes = isGuestPreview
    ? false
    : isMemberPreview
      ? true
      : currentMember?.isExternal !== true &&
        (isStrategieLeader ||
          isStrictAdmin ||
          currentMember?.role === 'mitglied' ||
          currentMember?.isInternal === true);

  const isStrategieLeaderRef = useRef(isStrategieLeader);
  useEffect(() => {
    isStrategieLeaderRef.current = isStrategieLeader;
  }, [isStrategieLeader]);

useEffect(() => {
    if (!canViewPastAntraege && currentSubTab === 'past_antraege') {
      setCurrentSubTab('antraege');
    }
  }, [canViewPastAntraege, currentSubTab]);

  // Modals & Popups
  const [activeBlurAntrag, setActiveBlurAntrag] = useState<SipAntrag | null>(null);
  const [activeDirectMessagePopup, setActiveDirectMessagePopup] = useState<SipDirectMessage | null>(null);
  const [showDirectMessageModal, setShowDirectMessageModal] = useState(false);
  const [editingDirectMessageDraft, setEditingDirectMessageDraft] = useState<SipDirectMessage | null>(null);
  const [confirmActivateAntrag, setConfirmActivateAntrag] = useState<SipAntrag | null>(null);
  const [showNewAntragModal, setShowNewAntragModal] = useState(false);
  const [newAntragPreset, setNewAntragPreset] = useState<{
    defaultType?: AntragType;
    parentAntrag?: SipAntrag | null;
  } | null>(null);
  const [editingAntrag, setEditingAntrag] = useState<SipAntrag | null>(null);
  const [showParserModal, setShowParserModal] = useState(false);
  const [hasCopiedHeroRede, setHasCopiedHeroRede] = useState(false);
  const [isHeroTextExpanded, setIsHeroTextExpanded] = useState(false);

  // Filter
  const [subAntragTypeFilter, setSubAntragTypeFilter] = useState<AntragType | 'ALL'>('ALL');
  const [claimFilter, setClaimFilter] = useState<'ALL' | 'FREE' | 'MINE' | 'CLAIMED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Live Toast Notifications
  const [activeToast, setActiveToast] = useState<SipNotification | null>(null);

  const currentUserName = currentMember?.name || (isAdminUnlocked ? 'Administrator' : 'Gast-Mitglied');
  const currentUserIdentifier = currentMember?.username || currentUserName;

  const currentUserIdentityRef = useRef({
    username: currentMember?.username || '',
    name: currentUserName,
  });
  useEffect(() => {
    currentUserIdentityRef.current = {
      username: currentMember?.username || '',
      name: currentUserName,
    };
  }, [currentMember?.username, currentUserName]);

  function getDismissedMessageKeys(): Set<string> {
    try {
      const raw = localStorage.getItem('sip_dismissed_direct_messages_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch (e) {}
    return new Set();
  }

  function markDirectMessageDismissed(msg: SipDirectMessage) {
    try {
      const set = getDismissedMessageKeys();
      const key = `${msg.id}_${msg.publishedAt || msg.updatedAt}`;
      set.add(key);
      const arr = Array.from(set).slice(-50);
      localStorage.setItem('sip_dismissed_direct_messages_v1', JSON.stringify(arr));
    } catch (e) {}
  }

  function shouldShowDirectMessageOverlay(msg: SipDirectMessage): boolean {
    const key = `${msg.id}_${msg.publishedAt || msg.updatedAt}`;
    const dismissed = getDismissedMessageKeys();
    if (dismissed.has(key)) return false;

    // Dem erstellenden/veröffentlichenden User diese Nachricht NIEMALS als Overlay anzeigen
    const myUsername = (currentUserIdentityRef.current.username || '').trim().toLowerCase();
    const myName = (currentUserIdentityRef.current.name || '').trim().toLowerCase();
    const createdBy = (msg.createdBy || '').trim().toLowerCase();
    const publishedBy = (msg.publishedBy || '').trim().toLowerCase();
    const author = (msg.author || '').trim().toLowerCase();

    if (myUsername && (createdBy === myUsername || publishedBy === myUsername)) {
      return false;
    }
    if (myName && (createdBy === myName || publishedBy === myName || author === myName)) {
      return false;
    }
    return true;
  }

  // Initialize Realtime & Pocketbase
  useEffect(() => {
    sipRealtime.init(settings);

    const unsubSession = sipRealtime.subscribe((newSession) => {
      setSession(newSession);
      if (newSession.activeDirectMessage) {
        if (shouldShowDirectMessageOverlay(newSession.activeDirectMessage)) {
          setActiveDirectMessagePopup(newSession.activeDirectMessage);
        } else {
          setActiveDirectMessagePopup(null);
        }
      } else {
        setActiveDirectMessagePopup(null);
      }
    });

    const unsubBlur = sipRealtime.onBlurPopup((antrag) => {
      // WICHTIG: Das Blurry Overlay soll NUR auf den Bildschirmen der Mitglieder aufploppen,
      // NIEMALS auf dem Bildschirm der Strategieführung!
      if (!isStrategieLeaderRef.current) {
        setActiveBlurAntrag(antrag);
      }
    });

    const unsubDirectMsg = sipRealtime.onDirectMessagePopup((msg) => {
      if (shouldShowDirectMessageOverlay(msg)) {
        setActiveDirectMessagePopup(msg);
      }
    });

    let toastTimer: any = null;
    const unsubNotif = sipRealtime.onNotification((notif) => {
      setActiveToast(notif);
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        setActiveToast((current) => (current?.id === notif.id ? null : current));
      }, 6000);
    });

    return () => {
      if (toastTimer) clearTimeout(toastTimer);
      unsubSession();
      unsubBlur();
      unsubDirectMsg();
      unsubNotif();
    };
  }, [settings]);

  // Wenn globaler Admin entsperrt ist oder Rolle strategie ist, Strategieführung aktivieren
  useEffect(() => {
    if (isAdminUnlocked || currentMember?.role === 'strategie' || currentMember?.role === 'admin') {
      setIsStrategieLeader(true);
    }
  }, [isAdminUnlocked, currentMember]);

  // Anträge filtern - Alle Mitglieder sehen alle Anträge und deren aktuellen Prüfstatus
  const filteredAntraege = useMemo(() => {
    return session.antraege.filter((item) => {
      
      if (claimFilter === 'FREE' && item.claimedBy) {
        return false;
      }
      if (claimFilter === 'MINE' && item.claimedBy !== currentUserName) {
        return false;
      }
      if (claimFilter === 'CLAIMED' && !item.claimedBy) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesContent = item.content.toLowerCase().includes(q);
        const matchesAuthor = item.author.toLowerCase().includes(q);
        const matchesClaimed = (item.claimedBy || '').toLowerCase().includes(q);
        const matchesLine = (item.lineOrParagraph || '').toLowerCase().includes(q);
        return matchesTitle || matchesContent || matchesAuthor || matchesClaimed || matchesLine;
      }

      return true;
    });
  }, [session.antraege, claimFilter, searchQuery, currentUserName]);

  // Aktuell im Plenum aufgerufener Antrag
  const activeAntrag = useMemo(() => {
    if (session.activeAntragId) {
      const found = session.antraege.find((a) => a.id === session.activeAntragId);
      if (found) return found;
    }
    return session.antraege.find((a) => a.isActive) || null;
  }, [session.activeAntragId, session.antraege]);

  // Timer & Fadeout für aktiven Antrag bei Entscheidung (ANGENOMMEN / ABGELEHNT)
  const [decisionNow, setDecisionNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!activeAntrag?.plenumResult || !activeAntrag?.plenumResultAt) return;

    const interval = setInterval(() => {
      setDecisionNow(Date.now());
    }, 100);

    return () => clearInterval(interval);
  }, [activeAntrag?.plenumResult, activeAntrag?.plenumResultAt]);

  const DECISION_FADE_DURATION_MS = 3000; // 3 Sekunden (Fadeouttimer)
  const decisionElapsedMs =
    activeAntrag?.plenumResult && activeAntrag?.plenumResultAt
      ? Math.max(0, decisionNow - new Date(activeAntrag.plenumResultAt).getTime())
      : 0;
  const isDecisionExpired = decisionElapsedMs >= DECISION_FADE_DURATION_MS;
  const decisionRemainingSeconds = Math.max(
    0,
    Math.ceil((DECISION_FADE_DURATION_MS - decisionElapsedMs) / 1000)
  );
  // Linearer Übergang von 1 auf 0 über 3 Sekunden
  const decisionOpacity = activeAntrag?.plenumResult
    ? Math.max(0, 1 - decisionElapsedMs / DECISION_FADE_DURATION_MS)
    : 1;

  // Wenn 3 Sekunden abgelaufen sind, beendet die Strategieführung automatisch den Aufruf
  useEffect(() => {
    if (isStrategieLeader && activeAntrag?.plenumResult && isDecisionExpired) {
      handleClearActiveAntrag();
    }
  }, [isStrategieLeader, activeAntrag?.plenumResult, isDecisionExpired]);

  // Sobald ein Antrag ausgefadet ist (oder kein aktiver Antrag vorhanden ist),
  // wird auch die Abstimmungsempfehlung sofort auf 'KEINE' zurückgesetzt.
  const effectiveRecommendation = useMemo(() => {
    if (activeAntrag?.plenumResult && isDecisionExpired) {
      return {
        type: 'KEINE' as const,
        note: '',
        updatedAt: new Date().toISOString(),
        updatedBy: 'Strategieführung',
        isPublished: false,
      };
    }
    return session.voteRecommendation;
  }, [activeAntrag?.plenumResult, isDecisionExpired, session.voteRecommendation]);

  // 1. Hauptanträge im Plenum (nur Typ HAUPTANTRAG, die noch nicht entschieden/ausgefadet sind)
  // Strikte parlamentarische Reihung nach orderIndex
  const hauptAntraege = useMemo(() => {
    return filteredAntraege
      .filter((item) => {
        if (item.type !== 'HAUPTANTRAG') return false;
        // In der Normalansicht sind ausgefadete/entschiedene Anträge nicht mehr sichtbar
        if (item.plenumResult) return false;
        return true;
      })
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  }, [filteredAntraege]);

  // Vergangene Hauptanträge (vom Plenum entschieden & ausgefadet)
  const pastHauptAntraege = useMemo(() => {
    return (session.antraege || [])
      .filter((a) => {
        if (a.type !== 'HAUPTANTRAG') return false;
        if (!a.plenumResult) return false;
        // Wenn noch im 3s-Fadeout und aktiv, bleibt er noch kurz im aktiven Live-Block der Normalansicht
        if (a.id === activeAntrag?.id && !isDecisionExpired) return false;
        return true;
      })
      .sort((a, b) => {
        const timeA = a.plenumResultAt ? new Date(a.plenumResultAt).getTime() : 0;
        const timeB = b.plenumResultAt ? new Date(b.plenumResultAt).getTime() : 0;
        return timeB - timeA;
      });
  }, [session.antraege, activeAntrag?.id, isDecisionExpired]);

  // Anträge zur Prüfung für Strategieführung (während der Pause keine Nebenanträge zu vergangenen Hauptanträgen)
  const pendingAntraege = useMemo(() => {
    return session.antraege.filter((a) => {
      if (a.status !== 'pending_approval') return false;
      // Während der Pause (kein aktiver Antrag) sollen Nebenanträge zu vergangenen Hauptanträgen nicht aufscheinen
      if (!activeAntrag && (a.parentAntragId || a.type !== 'HAUPTANTRAG')) {
        return false;
      }
      // Wenn ein Hauptantrag aktiv ist, keine Nebenanträge zu anderen (vergangenen) Hauptanträgen
      if (activeAntrag && a.parentAntragId && a.parentAntragId !== activeAntrag.id) {
        return false;
      }
      return true;
    });
  }, [session.antraege, activeAntrag]);

  // Zähler für Anträge zur Prüfung
  const pendingCount = pendingAntraege.length;

  // Im Warteraum während der Pause: Nebenanträge zu vergangenen Hauptanträgen nicht aufscheinen lassen
  const warteraumAntraege = useMemo(() => {
    return session.antraege.filter((a) => {
      if (a.isPreFab || !a.id.startsWith('antrag_custom_')) return false;
      // Nebenanträge zu vergangenen Hauptanträgen während der Pause ausblenden:
      if (a.parentAntragId || a.type !== 'HAUPTANTRAG') return false;
      return true;
    });
  }, [session.antraege]);

  // Spezifisch zu diesem aktiven Hauptantrag eingereichte Nebenanträge (ÄA, EA, SA, WM)
const activeSubAntraege = useMemo(() => {
  if (!activeAntrag) return [];

  const subs = session.antraege.filter(
    (a) => a.parentAntragId === activeAntrag.id && a.type !== 'HAUPTANTRAG'
  );

  return [...subs].sort((a, b) => {
    const aIsCustom = !a.isPreFab && a.id.startsWith('antrag_custom_');
    const bIsCustom = !b.isPreFab && b.id.startsWith('antrag_custom_');

    if (isStrategieLeader) {
      if (aIsCustom !== bIsCustom) return aIsCustom ? -1 : 1;
    } else {
      const aIsMine = aIsCustom && a.author === currentUserName;
      const bIsMine = bIsCustom && b.author === currentUserName;
      if (aIsMine !== bIsMine) return aIsMine ? -1 : 1;
      if (aIsCustom !== bIsCustom) return aIsCustom ? -1 : 1;
    }

    if (aIsCustom && bIsCustom) {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
    return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
  });
}, [activeAntrag, session.antraege, isStrategieLeader, currentUserName]);

const visibleSubAntraege = useMemo(
  () =>
    subAntragTypeFilter === 'ALL'
      ? activeSubAntraege
      : activeSubAntraege.filter((antrag) => antrag.type === subAntragTypeFilter),
  [activeSubAntraege, subAntragTypeFilter]
);

  // Live Counters für Header: Angenommene und Abgelehnte Anträge
  const acceptedCount = useMemo(() => {
    return session.antraege.filter((a) => a.plenumResult === 'ANGENOMMEN').length;
  }, [session.antraege]);

  const rejectedCount = useMemo(() => {
    return session.antraege.filter((a) => a.plenumResult === 'ABGELEHNT').length;
  }, [session.antraege]);

  // Handlers
  async function handleActivateAntrag(antragId: string) {
    await sipRealtime.activateAntrag(antragId, settings);
  }

  function handleClearActiveAntrag() {
    sipRealtime.clearActiveAntrag(settings);
  }

  function handleDecideAntrag(antragId: string, decision: 'ANGENOMMEN' | 'ABGELEHNT') {
    sipRealtime.decideAntrag(antragId, decision, settings);
  }

  function handleClaimAntrag(antragId: string, memberName?: string) {
    const targetUser = memberName || currentUserName;
    sipRealtime.claimAntrag(antragId, targetUser, settings);
  }

  function handleUnclaimAntrag(antragId: string) {
    sipRealtime.unclaimAntrag(antragId, currentUserName, settings);
  }

  function handleVoteRecommendationUpdate(rec: { type: VoteType; note: string; isPublished: boolean }) {
    sipRealtime.setVoteRecommendation(
      {
        type: rec.type,
        note: rec.note,
        isPublished: rec.isPublished,
        updatedBy: currentUserName,
      },
      settings
    );
  }

  function handleCreateAntrag(
    antragData: Omit<SipAntrag, 'id' | 'isPreFab' | 'status' | 'createdAt'>
  ) {
    const created = sipRealtime.submitCustomAntrag(antragData, settings);
    // Wenn Strategieführung, direkt freigeben
    if (isStrategieLeader) {
      sipRealtime.updateOrApproveAntrag(created.id, { status: 'approved' }, settings);
    }
  }

  function handleApproveAntrag(antragId: string) {
    sipRealtime.updateOrApproveAntrag(antragId, { status: 'approved' }, settings);
  }

  function handleRejectAntrag(antragId: string) {
    sipRealtime.updateOrApproveAntrag(antragId, { status: 'rejected' }, settings);
  }

  function handleSaveEditedAntrag(antragId: string, updates: Partial<SipAntrag>) {
    sipRealtime.updateOrApproveAntrag(antragId, updates, settings);
  }

  function handleDeleteAntrag(antragId: string) {
    sipRealtime.deleteAntrag(antragId, settings);
  }

  function handleImportAntraege(imported: SipAntrag[], strategyNotes?: string) {
    sipRealtime.importCombinedAntraegeAndStrategy(imported, strategyNotes, settings);
  }

  function handleUpdateDriveUrl(url: string) {
    if (!isStrictAdmin) return;
    sipRealtime.updateSessionMetadata({ driveFolderUrl: url }, settings);
  }

  function handleAddMeme(meme: { author: string; imageUrl: string; caption: string }) {
    sipRealtime.addMeme(meme, settings);
  }

  function handleReactMeme(memeId: string, emoji: string) {
    sipRealtime.toggleMemeReaction(memeId, emoji, currentUserName, settings);
  }

  const directMessages = session.directMessages || [];
  const draftDirectMessages = directMessages.filter((m) => m.status === 'draft');

  async function handleSaveDirectMessageDraft(data: {
    id?: string;
    title: string;
    content: string;
    author: string;
    priority: DirectMessagePriority;
  }) {
    await sipRealtime.saveDirectMessageDraft(
      {
        ...data,
        createdBy: currentUserIdentifier,
      },
      settings
    );
  }

  async function handlePublishDirectMessage(data: {
    id?: string;
    title: string;
    content: string;
    author: string;
    priority: DirectMessagePriority;
  }) {
    await sipRealtime.publishDirectMessage(
      {
        ...data,
        createdBy: currentUserIdentifier,
        publishedBy: currentUserIdentifier,
      },
      settings
    );
  }

  async function handlePublishExistingDirectMessage(messageId: string) {
    await sipRealtime.publishExistingDirectMessage(
      messageId,
      currentUserName,
      settings,
      currentUserIdentifier
    );
  }

  async function handleDeleteDirectMessage(messageId: string) {
    await sipRealtime.deleteDirectMessage(messageId, settings);
  }

  async function handleClearActiveDirectMessage() {
    await sipRealtime.clearActiveDirectMessage(settings);
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-6">
      {/* Toast Notification for Claims / Recommendations / Submissions */}
      {activeToast && (
        <div
          className={`fixed bottom-5 right-5 z-50 max-w-sm w-full bg-slate-900 border-2 text-white rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom duration-300 ${
            activeToast.type === 'vote'
              ? 'border-amber-400 shadow-amber-500/20'
              : activeToast.type === 'claim'
              ? 'border-emerald-400 shadow-emerald-500/20'
              : 'border-sky-400 shadow-sky-500/20'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                activeToast.type === 'vote'
                  ? 'bg-amber-500/20 text-amber-300'
                  : activeToast.type === 'claim'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-sky-500/20 text-sky-400'
              }`}
            >
              {activeToast.type === 'claim' ? (
                <UserCheck className="w-5 h-5" />
              ) : activeToast.type === 'vote' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Radio className="w-5 h-5 animate-pulse" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4
                className={`text-sm font-bold leading-snug ${
                  activeToast.type === 'vote'
                    ? 'text-amber-300'
                    : activeToast.type === 'claim'
                    ? 'text-emerald-300'
                    : 'text-sky-300'
                }`}
              >
                {activeToast.title}
              </h4>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                {activeToast.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveToast(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0 cursor-pointer"
              title="Schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Vollbild-Overlay für Direktnachrichten der Strategieführung auf allen Geräten */}
      {activeDirectMessagePopup && (
        <DirectMessageOverlayModal
          message={activeDirectMessagePopup}
          onDismiss={() => {
            markDirectMessageDismissed(activeDirectMessagePopup);
            setActiveDirectMessagePopup(null);
          }}
        />
      )}

      {/* Blurry Screen Modal: NUR für Mitglieder-Accounts, NIEMALS für die Strategieführung */}
      {activeBlurAntrag && !isStrategieLeader && (
        <BlurryMotionModal
          antrag={activeBlurAntrag}
          onViewNow={() => {
            setActiveBlurAntrag(null);
            setCurrentSubTab('antraege');
            // Scroll to antrag
            setTimeout(() => {
              const el = document.getElementById(`antrag-${activeBlurAntrag.id}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 100);
          }}
          onDismiss={() => setActiveBlurAntrag(null)}
        />
      )}

      {/* Bestätigungsfenster: Antrag im Plenum aufrufen */}
      {confirmActivateAntrag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border-2 border-sky-500/50 rounded-3xl p-6 sm:p-7 shadow-2xl text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center shrink-0">
                <Play className="w-6 h-6 fill-current" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">
                  Antrag im Plenum aufrufen?
                </h3>
                <p className="text-xs text-slate-400">
                  Wird auf allen Geräten der Delegierten live geschaltet
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 mb-5">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                    ANTRAG_TYPE_CONFIG[confirmActivateAntrag.type]?.badgeColor || 'bg-slate-800'
                  }`}
                >
                  {ANTRAG_TYPE_CONFIG[confirmActivateAntrag.type]?.shortLabel}
                </span>
                {confirmActivateAntrag.lineOrParagraph && (
                  <span className="text-xs text-slate-400 font-mono">
                    📍 {confirmActivateAntrag.lineOrParagraph}
                  </span>
                )}
                {confirmActivateAntrag.claimedBy && (
                  <span className="text-xs text-emerald-400 font-semibold ml-auto">
                    🎙️ {confirmActivateAntrag.claimedBy}
                  </span>
                )}
              </div>
              <h4 className="font-bold text-sm sm:text-base text-slate-100">
                {confirmActivateAntrag.title}
              </h4>
              <p className="text-xs text-slate-400 line-clamp-3 italic">
                "{confirmActivateAntrag.content}"
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 mb-6 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span className="leading-relaxed">
                Soll dieser Antrag nun auf allen Geräten angezeigt werden? Das Blurry-Vollbildoverlay öffnet sich sofort auf allen Bildschirmen im Plenum.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmActivateAntrag(null)}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmActivateAntrag;
                  setConfirmActivateAntrag(null);
                  if (target) {
                    await handleActivateAntrag(target.id);
                  }
                  // Kein Blur-Overlay für Strategieführung!
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-sky-500/25 transition cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Ja, auf allen Geräten aufrufen</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals for Custom Motion, Edit Motion, Parser */}
      {showNewAntragModal && (
        <NewAntragModal
          currentUserName={currentUserName}
          isStrategieLeader={isStrategieLeader}
          parentAntrag={newAntragPreset?.parentAntrag}
          defaultType={newAntragPreset?.defaultType || 'AAA'}
          onClose={() => {
            setShowNewAntragModal(false);
            setNewAntragPreset(null);
          }}
          onSubmit={handleCreateAntrag}
        />
      )}

      {editingAntrag && (
        <EditAntragModal
          antrag={editingAntrag}
          onClose={() => setEditingAntrag(null)}
          onSave={handleSaveEditedAntrag}
          onDelete={handleDeleteAntrag}
        />
      )}

      {showParserModal && (
        <MotionParserModal
          onClose={() => setShowParserModal(false)}
          onImport={handleImportAntraege}
          initialDriveUrl={session.driveFolderUrl}
        />
      )}

      {showDirectMessageModal && (
        <DirectMessageComposerModal
          currentUserName={currentUserName}
          directMessages={directMessages}
          activeDirectMessage={session.activeDirectMessage || null}
          initialDraft={editingDirectMessageDraft}
          onClose={() => {
            setShowDirectMessageModal(false);
            setEditingDirectMessageDraft(null);
          }}
          onSaveDraft={handleSaveDirectMessageDraft}
          onPublishNow={handlePublishDirectMessage}
          onPublishExisting={handlePublishExistingDirectMessage}
          onDeleteMessage={handleDeleteDirectMessage}
          onClearActiveOverlay={handleClearActiveDirectMessage}
        />
      )}

      {/* Top Banner / SiP Control Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl backdrop-blur flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white p-1.5 flex items-center justify-center shadow-lg shrink-0">
            <img
              src={suLogo}
              alt="Schülerunion Vorarlberg"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white">
              {session.title}
            </h1>
          </div>
        </div>

        {/* Right: Live Counters, Role toggle, User badge & Protocol download */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Live Plenum Result Counters (Angenommen / Abgelehnt) */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 p-1 rounded-2xl shadow-inner">
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-black text-xs sm:text-sm"
              title="Anzahl vom Plenum angenommener Anträge"
            >
              <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
              <span>{acceptedCount}</span>
              <span className="text-[11px] text-emerald-400/80 font-semibold hidden sm:inline">Angenommen</span>
            </div>

            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-black text-xs sm:text-sm"
              title="Anzahl vom Plenum abgelehnter Anträge"
            >
              <X className="w-4 h-4 text-rose-400 stroke-[3]" />
              <span>{rejectedCount}</span>
              <span className="text-[11px] text-rose-400/80 font-semibold hidden sm:inline">Abgelehnt</span>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
            <User className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-slate-400">Angemeldet:</span>
            <strong className="text-slate-200">{currentUserName}</strong>
          </div>

          {/* Protokoll Export Button */}
          {isStrategyView && (
          <button
            type="button"
            onClick={() => downloadSipProtocol(session)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-950 hover:bg-slate-850 hover:border-sky-500/40 border border-slate-800 text-xs text-sky-300 font-semibold transition cursor-pointer shadow-sm"
            title="Sitzungsprotokoll & Audit-Log als Textdatei herunterladen"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Protokoll exportieren</span>
          </button>

          )}
          
          {/* Strategieführung Toggle */}
         {/* Strategieführung aktivieren oder Ansichtsmodus wählen */}
          {isStrategieLeader ? (
            <div className="flex items-center gap-1 rounded-2xl border border-slate-700 bg-slate-950 p-1">
              {([
                ['strategy', 'Strategieführung'],
                ['member', 'Member View'],
                ['guest', 'Guest View'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setViewMode(mode);
                    setCurrentSubTab('antraege');
                  }}
                  aria-pressed={viewMode === mode}
                  className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
                    viewMode === mode
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (
                  !isAdminUnlocked &&
                  currentMember?.role !== 'strategie' &&
                  currentMember?.role !== 'admin'
                ) {
                  const pass = prompt('Bitte Passwort für die Strategieführung eingeben:');
                  const validPass = settings.strategiePassword || 'strategie2026';

                  if (pass === null) return;
                  if (pass !== validPass) {
                    alert('Ungültiges Passwort, bitte versuche es erneut!');
                    return;
                  }
                }

                setIsStrategieLeader(true);
                setViewMode('strategy');
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl text-xs font-bold transition cursor-pointer border bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Strategieführung aktivieren</span>
            </button>
          )}
        </div>
      </div>

      {/* Suchleiste direkt unter dem Header (Strategieführungsansicht) */}
      {isStrategyView && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Anträge durchsuchen (nach Zeile, Titel, Stichwort, Redner:in, Antragsteller:in)..."
            className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-sky-500 shadow-lg backdrop-blur"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              title="Suche zurücksetzen"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Prominent Vote Recommendation Banner (Always visible in Plenum) */}
      <VoteRecommendationBanner
        recommendation={effectiveRecommendation}
        isStrategieLeader={isStrategyView}
        onUpdateRecommendation={handleVoteRecommendationUpdate}
      />

      {isStrategyView && (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => {
          setEditingDirectMessageDraft(null);
          setShowDirectMessageModal(true);
        }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition cursor-pointer"
      >
        <Megaphone className="w-4 h-4" />
        <span>Direktnachricht schreiben</span>
        {draftDirectMessages.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-slate-950 text-amber-300 text-[10px] font-black">
            {draftDirectMessages.length}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => {
          setNewAntragPreset(null);
          setShowNewAntragModal(true);
        }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-sky-500/20 transition cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        <span>Neuen Antrag schreiben</span>
      </button>
    </div>
  </div>
)}

      {/* Main Content Area with Collapsible Left Sidebar */}
      <div className="flex flex-col md:flex-row items-start gap-5">
        {/* Collapsible Left Sidebar (Sticky am linken Rand fixiert) */}
         {!isGuestPreview && (
        <aside
          className={`transition-all duration-300 shrink-0 bg-slate-900/90 border border-slate-800 rounded-3xl p-3 sm:p-3.5 shadow-xl backdrop-blur md:sticky md:top-4 md:self-start md:max-h-[calc(100vh-2rem)] md:overflow-y-auto z-20 ${
            isSidebarCollapsed ? 'w-full md:w-16' : 'w-full md:w-64'
          }`}
        >
          {/* Sidebar Header & Toggle */}
          <div
            className={`flex items-center justify-between pb-2.5 mb-2 border-b border-slate-800/80 px-1.5 ${
              isSidebarCollapsed ? 'md:justify-center' : ''
            }`}
          >
            {!isSidebarCollapsed && (
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden md:inline truncate" title="Navigation">
                Navigation
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer hidden md:flex items-center justify-center shrink-0"
              title={isSidebarCollapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-1 md:pb-0 scrollbar-none">
            {/* 1. Anträge & Wortmeldungen */}
            <button
              type="button"
              onClick={() => setCurrentSubTab('antraege')}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer w-full min-w-0 ${
                currentSubTab === 'antraege'
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                  : 'text-slate-300 hover:bg-slate-800'
              } ${isSidebarCollapsed ? 'md:justify-center' : 'justify-between'}`}
              title="Anträge & Wortmeldungen"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Gavel className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && (
                  <span className="truncate block" title="Anträge & Wortmeldungen">
                    Anträge & Wortmeldungen
                  </span>
                )}
              </div>
              {!isSidebarCollapsed && (
                <div className="flex items-center gap-1 shrink-0 ml-1.5">
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      currentSubTab === 'antraege'
                        ? 'bg-slate-950 text-sky-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {hauptAntraege.length}
                  </span>
                  {pendingCount > 0 && isStrategieLeader && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 animate-pulse">
                      {pendingCount}
                    </span>
                  )}
                </div>
              )}
            </button>

            {/* 2. Vergangene Anträge */}
            {canViewPastAntraege && (
            <button
              type="button"
              onClick={() => setCurrentSubTab('past_antraege')}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer w-full min-w-0 ${
                currentSubTab === 'past_antraege'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-300 hover:bg-slate-800'
              } ${isSidebarCollapsed ? 'md:justify-center' : 'justify-between'}`}
              title="Vergangene Anträge (bereits abgestimmt)"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <History className="w-4 h-4 shrink-0 text-emerald-400" />
                {!isSidebarCollapsed && (
                  <span className="truncate block" title="Vergangene Anträge">
                    Vergangene Anträge
                  </span>
            )}
              </div>
              {!isSidebarCollapsed && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold shrink-0 ml-1.5 ${
                    currentSubTab === 'past_antraege'
                      ? 'bg-slate-950 text-emerald-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {pastHauptAntraege.length}
                </span>
              )}
            </button>
            )}
            {/* 3. Google Drive Unterlagen (Nur für den Admin sichtbar) */}
            {isStrictAdmin && isStrategyView && (
              <button
                type="button"
                onClick={() => setCurrentSubTab('drive')}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer w-full min-w-0 ${
                  currentSubTab === 'drive'
                    ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                    : 'text-slate-300 hover:bg-slate-800'
                } ${isSidebarCollapsed ? 'md:justify-center' : 'justify-start'}`}
                title="Google Drive Unterlagen"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <FolderOpen className="w-4 h-4 shrink-0 text-amber-400" />
                  {!isSidebarCollapsed && (
                    <span className="truncate block" title="Google Drive Unterlagen">
                      Drive Unterlagen
                    </span>
                  )}
                </div>
              </button>
            )}

            {/* 5. Meme-Feed 🎭 */}
             {canViewMemes && (
              <button
                type="button"
                onClick={() => setCurrentSubTab('memes')}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer w-full min-w-0 ${
                  currentSubTab === 'memes'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-md shadow-pink-500/20'
                    : 'text-slate-300 hover:bg-slate-800'
                } ${isSidebarCollapsed ? 'md:justify-center' : 'justify-between'}`}
                title="Meme-Feed 🎭"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Smile className="w-4 h-4 shrink-0 text-pink-400" />
                  {!isSidebarCollapsed && (
                    <span className="truncate block" title="Meme-Feed 🎭">
                      Meme-Feed 🎭
                    </span>
                  )}
                </div>
                {!isSidebarCollapsed && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold shrink-0 ml-1.5 ${
                    currentSubTab === 'memes'
                      ? 'bg-white text-pink-900'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {session.memes.length}
                  </span>
                )}
              </button>
            )}

            {/* 6. Archiv & Protokolle (nur Strategieführung / Admin) */}
            {isStrategyView && (
              <button
                type="button"
                onClick={() => setCurrentSubTab('archive')}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer w-full min-w-0 ${
                  currentSubTab === 'archive'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-300 hover:bg-slate-800'
                } ${isSidebarCollapsed ? 'md:justify-center' : 'justify-start'}`}
                title="Archiv & Protokolle"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Archive className="w-4 h-4 shrink-0 text-amber-400" />
                  {!isSidebarCollapsed && (
                    <span className="truncate block" title="Archiv & Protokolle">
                      Archiv & Logs
                    </span>
                  )}
                </div>
              </button>
            )}
          </nav>
        </aside>
        )}

        {/* Right Main Content Pane */}
        <main className="flex-1 min-w-0 w-full space-y-5">

      {/* Subtab 1: Anträge & Wortmeldungen */}
      {currentSubTab === 'antraege' && (
        <div className="space-y-5">
          {/* ========================================================================= */}
          {/* A: STRATEGIEFÜHRUNGS-VIEW (Alle Anträge untereinander sichtbar & aufrufbar) */}
          {/* ========================================================================= */}
          {isStrategyView ? (
            <div className="space-y-5">
              {/* Active Plenum Banner & Sub-Motions for Leadership */}
              {activeAntrag && (
                <div
                  style={{
                    opacity: decisionOpacity,
                    transition: 'opacity 0.1s linear',
                  }}
                  className="space-y-4"
                >
                  <div
                    className={`border-2 rounded-3xl p-4 sm:p-5 shadow-xl flex flex-col gap-3 transition-colors duration-300 animate-in fade-in ${
                      activeAntrag.plenumResult === 'ANGENOMMEN'
                        ? 'bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/80 border-emerald-400 ring-2 ring-emerald-400/40'
                        : activeAntrag.plenumResult === 'ABGELEHNT'
                        ? 'bg-gradient-to-r from-rose-950/80 via-slate-900 to-rose-950/80 border-rose-500 ring-2 ring-rose-500/40'
                        : 'bg-gradient-to-r from-sky-950/60 via-slate-900 to-indigo-950/60 border-sky-400'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="relative flex h-4 w-4 shrink-0">
                          {activeAntrag.plenumResult === 'ANGENOMMEN' ? (
                            <Check className="w-5 h-5 text-emerald-400 stroke-[3]" />
                          ) : activeAntrag.plenumResult === 'ABGELEHNT' ? (
                            <X className="w-5 h-5 text-rose-400 stroke-[3]" />
                          ) : (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                            </>
                          )}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-bold uppercase tracking-wider ${
                                activeAntrag.plenumResult === 'ANGENOMMEN'
                                  ? 'text-emerald-300'
                                  : activeAntrag.plenumResult === 'ABGELEHNT'
                                  ? 'text-rose-300'
                                  : 'text-sky-400'
                              }`}
                            >
                              {activeAntrag.plenumResult === 'ANGENOMMEN'
                                ? '🎉 Antrag vom Plenum ANGENOMMEN'
                                : activeAntrag.plenumResult === 'ABGELEHNT'
                                ? '❌ Antrag vom Plenum ABGELEHNT'
                                : 'Aktuell auf allen Geräten im Plenum aktiv'}
                            </span>
                            
                          </div>
                          <h3 className="text-base sm:text-lg font-bold text-white">
                            {activeAntrag.title}
                          </h3>
                          {activeAntrag.claimedBy && (
                            <p className="text-xs text-emerald-400 font-medium">
                              🎙️ Redner:in: {activeAntrag.claimedBy}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons: ANGENOMMEN & ABGELEHNT oder Countdown */}
                      <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                        {!activeAntrag.plenumResult ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDecideAntrag(activeAntrag.id, 'ANGENOMMEN')}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 cursor-pointer transition"
                              title="Antrag als ANGENOMMEN kennzeichnen (10s Timer startet)"
                            >
                              <Check className="w-4 h-4 stroke-[3]" />
                              <span>ANGENOMMEN</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDecideAntrag(activeAntrag.id, 'ABGELEHNT')}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-md shadow-rose-600/20 cursor-pointer transition"
                              title="Antrag als ABGELEHNT kennzeichnen (10s Timer startet)"
                            >
                              <X className="w-4 h-4 stroke-[3]" />
                              <span>ABGELEHNT</span>
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 ${
                                activeAntrag.plenumResult === 'ANGENOMMEN'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              }`}
                            >
                              <span>Schließt in {decisionRemainingSeconds}s...</span>
                            </span>
                            <button
                              type="button"
                              onClick={handleClearActiveAntrag}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                              title="Sofort schließen"
                            >
                              Sofort schließen
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Nebenanträge zu diesem aktiven Hauptantrag */}
                  <div className="bg-gradient-to-r from-purple-950/30 via-slate-900 to-indigo-950/30 border-2 border-purple-500/40 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-purple-500/20">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center justify-center shrink-0">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                            <span>Nebenanträge zur laufenden Debatte</span>
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[11px] font-bold border border-purple-500/30">
                              {visibleSubAntraege.length}
                            </span>
                          </h3>
                          <p className="text-xs text-slate-400">
                            Zusatzanträge & Wortmeldungen zu {activeAntrag.title} (ÄA, EA, SA, WM)
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Option, eigene Nebenanträge zu erstellen: Vor allen vorgefertigten Nebenanträgen */}
                    {!isGuestPreview && (
                    <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-sky-950/40 via-slate-950 to-indigo-950/40 border border-sky-500/30">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Sparkles className="w-4 h-4 text-sky-400" />
                        <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-300">
                          <div className="flex flex-wrap gap-1.5">
                          </div>
                          Eigenen Nebenantrag oder Wortmeldung erstellen
                        </h4>
                      </div>
                    

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'AAA', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-sky-500/20 border border-sky-500/40 text-sky-200 transition text-center cursor-pointer group shadow"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">✏️ ÄA</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Abänderungsantrag</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'EA', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 transition text-center cursor-pointer group shadow"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">➕ EA</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Erweiterungsantrag</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'SA', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-rose-500/20 border border-rose-500/40 text-rose-200 transition text-center cursor-pointer group shadow"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">❌ SA</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Streichungsantrag</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'WM', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-amber-500/20 border border-amber-500/40 text-amber-200 transition text-center cursor-pointer group shadow"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">🙋 WM</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Wortmeldung</span>
                        </button>
                      </div>
                    </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                    <span className="mr-1 text-xs font-semibold text-slate-400">
                      Nebenanträge filtern:
                    </span>

                    {(['ALL', 'AAA', 'EA', 'SA', 'WM'] as const).map((type) => {
                      const active = subAntragTypeFilter === type;

                      const colors =
                        type === 'AAA'
                          ? active
                            ? 'bg-sky-500 border-sky-400 text-slate-950'
                            : 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20'
                          : type === 'EA'
                          ? active
                            ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                          : type === 'SA'
                          ? active
                            ? 'bg-rose-500 border-rose-400 text-white'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                          : type === 'WM'
                          ? active
                            ? 'bg-amber-400 border-amber-300 text-slate-950'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                          : active
                          ? 'bg-slate-300 border-slate-200 text-slate-950'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700';

                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setSubAntragTypeFilter(type)}
                          aria-pressed={active}
                          className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${colors}`}
                        >
                          {type === 'ALL'
                            ? 'Alle Typen'
                            : ANTRAG_TYPE_CONFIG[type]?.shortLabel || type}
                        </button>
                      );
                    })}
                  </div>
                    {/* Liste der Nebenanträge (von Mitgliedern eingereichte IMMER ganz oben) */}
                    {visibleSubAntraege.length === 0 ? (
                      <div className="p-5 text-center rounded-2xl bg-slate-950/50 border border-slate-800 text-slate-400 text-xs">
                        Keine Nebenanträge dieses Typs vorhanden
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {visibleSubAntraege.map((antrag) => (
                          <AntragCard
                            key={antrag.id}
                            antrag={antrag}
                            currentUserName={currentUserName}
                            isStrategieLeader={true}
                            onClaim={handleClaimAntrag}
                            onAssignClaim={(id, name) => handleClaimAntrag(id, name)}
                            onUnclaim={handleUnclaimAntrag}
                            onActivate={() => {}}
                            onEdit={(a) => setEditingAntrag(a)}
                            onDelete={handleDeleteAntrag}
                            onApprove={handleApproveAntrag}
                            onReject={handleRejectAntrag}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              
              {/* Vorgeschriebene Direktnachrichten (Entwürfe) & Aktive Direktnachricht Schnellzugriff */}
              {(draftDirectMessages.length > 0 || session.activeDirectMessage) && (
                <div className="bg-slate-900/90 border border-amber-500/40 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-lg">
                  {session.activeDirectMessage && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            ● gesendet
                          </span>
                          <span className="text-xs font-bold text-white truncate">
                            {session.activeDirectMessage.title}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1 line-clamp-1">
                          {session.activeDirectMessage.content}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePublishExistingDirectMessage(session.activeDirectMessage!.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold cursor-pointer transition"
                          title="Overlay erneut auf allen Geräten einblenden"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Erneut einblenden</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleClearActiveDirectMessage}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-semibold cursor-pointer transition"
                          title="Aktives Overlay beenden"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Beenden</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {draftDirectMessages.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                          <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                          <span>Vorgeschriebene Direktnachrichten ({draftDirectMessages.length})</span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Bereit zur Veröffentlichung
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {draftDirectMessages.map((draft) => (
                          <div
                            key={draft.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/40 transition"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-white truncate">
                                {draft.title}
                              </div>
                              <p className="text-xs text-slate-400 line-clamp-1">
                                {draft.content}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                              <button
                                type="button"
                                onClick={() => handlePublishExistingDirectMessage(draft.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 cursor-pointer transition"
                                title="Jetzt als Overlay auf allen Geräten veröffentlichen"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Jetzt veröffentlichen</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDirectMessageDraft(draft);
                                  setShowDirectMessageModal(true);
                                }}
                                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition"
                                title="Entwurf bearbeiten"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDirectMessage(draft.id)}
                                className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer transition"
                                title="Entwurf löschen"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Pending Approval Section for Leadership */}
              {pendingCount > 0 && (
                <div className="bg-amber-950/20 border-2 border-amber-500/40 rounded-3xl p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                    <h3 className="text-sm font-bold text-amber-300">
                      Anträge von Mitgliedern zur Prüfung & Freigabe ({pendingCount})
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {pendingAntraege.map((antrag) => (
                      <AntragCard
                        key={antrag.id}
                          antrag={antrag}
                          currentUserName={currentUserName}
                          isStrategieLeader={true}
                          onClaim={handleClaimAntrag}
                          onAssignClaim={(id, name) => handleClaimAntrag(id, name)}
                          onUnclaim={handleUnclaimAntrag}
                          onActivate={(a) => setConfirmActivateAntrag(a)}
                          onEdit={(a) => setEditingAntrag(a)}
                          onDelete={handleDeleteAntrag}
                          onApprove={handleApproveAntrag}
                          onReject={handleRejectAntrag}
                        />
                      ))}
                  </div>
                </div>
              )}

           

              {/* ========================================================================= */}
              {/* HAUPTANTRÄGE BLOCK (Antrag 1 bis Antrag 33)                               */}
              {/* ========================================================================= */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between px-1 pt-1">
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Gavel className="w-4 h-4 text-sky-400" />
                    <span>Hauptanträge im Plenum ({hauptAntraege.length})</span>
                  </h3>
                </div>

                {hauptAntraege.length === 0 ? (
                  <div className="p-8 text-center bg-slate-900/50 rounded-3xl border border-slate-800 text-slate-400">
                    <Gavel className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                    <p className="text-sm font-medium">Keine Hauptanträge gefunden.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Passe deine Filtereinstellungen an oder erstelle einen neuen Antrag!
                    </p>
                  </div>
                ) : (
                  hauptAntraege.map((antrag) => (
                    <AntragCard
                      key={antrag.id}
                      antrag={antrag}
                      currentUserName={currentUserName}
                      isStrategieLeader={true}
                      onClaim={handleClaimAntrag}
                      onAssignClaim={(id, name) => handleClaimAntrag(id, name)}
                      onUnclaim={handleUnclaimAntrag}
                      onActivate={(a) => setConfirmActivateAntrag(a)}
                      onEdit={(a) => setEditingAntrag(a)}
                      onDelete={handleDeleteAntrag}
                      onApprove={handleApproveAntrag}
                      onReject={handleRejectAntrag}
                    />
                  ))
                )}
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* B: MITGLIEDER-VIEW (Immer nur der von der Strategieführung freigegebene TOP) */
            /* ========================================================================= */
            <div className="space-y-5">
              {activeAntrag && !isDecisionExpired ? (
                <div
                  style={{
                    opacity: decisionOpacity,
                    transition: 'opacity 0.1s linear',
                  }}
                  className="space-y-5"
                >
                  {/* Hero Card des aktuell freigegebenen Antrags */}
                  <div
                    className={`relative rounded-3xl p-5 sm:p-7 shadow-2xl overflow-hidden border-2 transition-colors duration-300 ${
                      activeAntrag.plenumResult === 'ANGENOMMEN'
                        ? 'bg-slate-900 border-emerald-400 ring-2 ring-emerald-400/40 shadow-emerald-500/20'
                        : activeAntrag.plenumResult === 'ABGELEHNT'
                        ? 'bg-slate-900 border-rose-500 ring-2 ring-rose-500/40 shadow-rose-500/20'
                        : 'bg-slate-900 border-sky-400 shadow-sky-500/15'
                    }`}
                  >
                    {/* Background glow */}
                    <div
                      className={`absolute -top-24 -right-24 w-56 h-56 rounded-full blur-3xl pointer-events-none ${
                        activeAntrag.plenumResult === 'ANGENOMMEN'
                          ? 'bg-emerald-500/20'
                          : activeAntrag.plenumResult === 'ABGELEHNT'
                          ? 'bg-rose-500/20'
                          : 'bg-sky-500/15'
                      }`}
                    />

                    {/* Top Header Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        {activeAntrag.plenumResult === 'ANGENOMMEN' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black uppercase tracking-wider">
                            <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                            <span>Vom Plenum ANGENOMMEN (schließt in {decisionRemainingSeconds}s...)</span>
                          </span>
                        ) : activeAntrag.plenumResult === 'ABGELEHNT' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-black uppercase tracking-wider">
                            <X className="w-4 h-4 text-rose-400 stroke-[3]" />
                            <span>Vom Plenum ABGELEHNT (schließt in {decisionRemainingSeconds}s...)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-black uppercase tracking-wider">
                            <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                            <span>Aktuell im Plenum aufgerufen</span>
                          </span>
                        )}

                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            ANTRAG_TYPE_CONFIG[activeAntrag.type]?.badgeColor || 'bg-slate-800 text-slate-200'
                          }`}
                        >
                          {ANTRAG_TYPE_CONFIG[activeAntrag.type]?.shortLabel} • {ANTRAG_TYPE_CONFIG[activeAntrag.type]?.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-sky-300 bg-sky-950/80 border border-sky-500/40 px-3 py-1 rounded-xl shadow-sm">
                          Antragsteller:in: <strong className="text-white">{activeAntrag.author}</strong>
                        </span>
                        {activeAntrag.lineOrParagraph && (
                          <span className="text-xs font-mono px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                            📍 {activeAntrag.lineOrParagraph}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Motion Title */}
                    <h2 className="text-xl sm:text-2xl font-black text-white mb-4 leading-tight">
                      {activeAntrag.title}
                    </h2>

                    {/* 1. Antragstext / Vorbereitete Rede (VOR den Forderungspunkten, standardmäßig eingeklappt) */}
                    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 mb-4 shadow-inner">
                      <div className="flex items-center justify-between gap-3 mb-2.5 pb-2 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <Mic className="w-4 h-4 text-indigo-400" />
                          <h3 className="text-xs sm:text-sm font-bold text-indigo-300">
                            {activeAntrag.rede ? `Vorbereitete Rede für das Plenum (${activeAntrag.author})` : 'Antragstext'}
                          </h3>
                        </div>
                        {isHeroTextExpanded && activeAntrag.rede && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(activeAntrag.rede || '');
                              setHasCopiedHeroRede(true);
                              setTimeout(() => setHasCopiedHeroRede(false), 2000);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                            title="Redetext in Zwischenablage kopieren"
                          >
                            {hasCopiedHeroRede ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Rede kopiert!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Rede kopieren</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Text-Preview (2 Zeilen wenn eingeklappt, Klick klappt auf / zu) */}
                      <div
                        onClick={() => setIsHeroTextExpanded(!isHeroTextExpanded)}
                        className={`text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans cursor-pointer hover:text-white transition ${
                          isHeroTextExpanded ? '' : 'line-clamp-2'
                        }`}
                        title={isHeroTextExpanded ? 'Klicken zum Einklappen' : 'Klicken zum Aufklappen'}
                      >
                        {activeAntrag.rede || activeAntrag.content}
                      </div>

                      {/* Aufklappen / Einklappen Toggle Button */}
                      <button
                        type="button"
                        onClick={() => setIsHeroTextExpanded(!isHeroTextExpanded)}
                        className="mt-3 text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1.5 cursor-pointer transition"
                      >
                        {isHeroTextExpanded ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            <span>Weniger anzeigen (Einklappen)</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            <span>Ganzen Antragstext zeigen (Aufklappen)</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* 2. Forderungen des Vorarlberger Schüler:innenparlaments (standardmäßig ausgeklappt) */}
                    {activeAntrag.forderungspunkte && activeAntrag.forderungspunkte.length > 0 && (
                      <div className="bg-gradient-to-r from-sky-950/60 via-slate-950 to-indigo-950/50 border border-sky-500/40 rounded-2xl p-4 sm:p-5 shadow-lg">
                        <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-sky-300 mb-3 pb-2 border-b border-sky-500/20">
                          <Target className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />
                          <span>Daher fordert das Vorarlberger Schüler:innenparlament ({activeAntrag.forderungspunkte.length}):</span>
                        </div>
                        <ul className="space-y-2.5">
                          {activeAntrag.forderungspunkte.map((fp, idx) => (
                            <li key={idx} className="flex items-start gap-3 text-xs sm:text-sm text-slate-100">
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 font-bold text-xs shrink-0 mt-0.5 border border-sky-500/40">
                                {idx + 1}
                              </span>
                              <span className="leading-relaxed font-medium">{fp}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  </div>

                  {/* Claimbare Nebenanträge & Option, eigene Nebenanträge zu erstellen */}
                  <div className="bg-gradient-to-r from-purple-950/20 via-slate-900 to-indigo-950/20 border-2 border-purple-500/30 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-purple-500/20">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center justify-center shrink-0">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                            <span>Nebenanträge zur laufenden Debatte</span>
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[11px] font-bold border border-purple-500/30">
                              {visibleSubAntraege.length}
                            </span>
                          </h3>
                          <p className="text-xs text-slate-400">
                            Direkt hier claimen oder eigenen Zusatzantrag einbringen
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Option, eigene Nebenanträge zu erstellen: Vor allen vorgefertigten Nebenanträgen */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-sky-950/40 via-slate-950 to-indigo-950/40 border border-sky-500/30">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Sparkles className="w-4 h-4 text-sky-400" />
                        <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-300">
                          <div className="flex flex-wrap gap-1.5">
                        </div>
                          Eigenen Nebenantrag oder Wortmeldung erstellen
                        </h4>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'AAA', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-sky-500/20 border border-sky-500/40 text-sky-200 transition text-center cursor-pointer group shadow"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">✏️ ÄA</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Abänderungsantrag</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'EA', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 transition text-center cursor-pointer group shadow"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">➕ EA</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Erweiterungsantrag</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'SA', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-rose-500/20 border border-rose-500/40 text-rose-200 transition text-center cursor-pointer group shadow"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">❌ SA</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Streichungsantrag</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewAntragPreset({ defaultType: 'WM', parentAntrag: activeAntrag });
                            setShowNewAntragModal(true);
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 hover:bg-amber-500/20 border border-amber-500/40 text-amber-200 transition text-center cursor-pointer group shadow"
                        >
                          <span className="text-sm font-black group-hover:scale-105 transition">🙋 WM</span>
                          <span className="text-[10px] text-slate-400 mt-0.5">Wortmeldung</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                    <span className="mr-1 text-xs font-semibold text-slate-400">
                      Nebenanträge filtern:
                    </span>

                    {(['ALL', 'AAA', 'EA', 'SA', 'WM'] as const).map((type) => {
                      const active = subAntragTypeFilter === type;

                      const colors =
                        type === 'AAA'
                          ? active
                            ? 'bg-sky-500 border-sky-400 text-slate-950'
                            : 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20'
                          : type === 'EA'
                          ? active
                            ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                          : type === 'SA'
                          ? active
                            ? 'bg-rose-500 border-rose-400 text-white'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                          : type === 'WM'
                          ? active
                            ? 'bg-amber-400 border-amber-300 text-slate-950'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                          : active
                          ? 'bg-slate-300 border-slate-200 text-slate-950'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700';

                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setSubAntragTypeFilter(type)}
                          aria-pressed={active}
                          className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${colors}`}
                        >
                          {type === 'ALL'
                            ? 'Alle Typen'
                            : ANTRAG_TYPE_CONFIG[type]?.shortLabel || type}
                        </button>
                      );
                    })}
                  </div>

                    {/* Liste der Nebenanträge (Eigene Anträge GANZ OBEN) */}
                    {visibleSubAntraege.length === 0 ? (
                      <div className="p-5 text-center rounded-2xl bg-slate-950/50 border border-slate-800 text-slate-400 text-xs">
                       Keine Nebenanträge dieses Typs vorhanden
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {visibleSubAntraege.map((sub) => (
                          <AntragCard
                            key={sub.id}
                            antrag={sub}
                            currentUserName={currentUserName}
                            isStrategieLeader={false}
                            onClaim={handleClaimAntrag}
                            onAssignClaim={(id, name) => handleClaimAntrag(id, name)}
                            onUnclaim={handleUnclaimAntrag}
                            onActivate={() => {}}
                            onEdit={() => {}}
                            onDelete={() => {}}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Warteraum wenn noch kein Antrag aufgerufen ist */
                <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center text-slate-400">
                  <div className="relative mb-5">
                    <div className="w-16 h-16 rounded-3xl bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center animate-pulse">
                      <Radio className="w-8 h-8" />
                    </div>
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 animate-ping" />
                  </div>

                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-1">
                    Plenum bereit
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-white mb-2">
                    Warte auf Aufruf der Strategieführung...
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
                    Sobald die Strategieführung den nächsten Antrag im Plenum aufruft, ploppt dieser automatisch mit Vollbild-Overlay auf deinem Bildschirm auf.
                  </p>
                  {!isGuestPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewAntragPreset(null);
                      setShowNewAntragModal(true);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs sm:text-sm transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Antrag / Wortmeldung vorab vorbereiten</span>
                  </button>
                  )}
                  {/* Eingereichte Anträge aus dem Plenum im Warteraum anzeigen (während der Pause keine Nebenanträge zu vergangenen Hauptanträgen) */}
                  {warteraumAntraege.length > 0 && (
                    <div className="w-full max-w-2xl mt-8 text-left bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                        Aus dem Plenum eingereichte Anträge:
                      </h4>
                      <div className="space-y-2.5">
                        {warteraumAntraege.map((a) => (
                            <div key={a.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-bold text-slate-200">{a.title}</span>
                                {a.status === 'pending_approval' ? (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                                    ⏳ Bestätigung ausstehend
                                  </span>
                                ) : a.status === 'approved' ? (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                    {a.isEditedByAdmin ? '✏️ Geändert von Strategieführung' : '✅ Bestätigt'}
                                  </span>
                                ) : a.status === 'rejected' ? (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                                    ❌ Abgelehnt
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-[11px] text-slate-400">Antragsteller:in: {a.author}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}


            </div>
          )}
        </div>
      )}

      {/* Subtab: Vergangene Anträge */}
      {currentSubTab === 'past_antraege' && canViewPastAntraege && (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white">
                  Vergangene Anträge des Plenums
                </h2>
                <p className="text-xs text-slate-400">
                  Bereits abgestimmte Hauptanträge inklusive aller dazugehörigen Nebenanträge
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                <span>{pastHauptAntraege.filter((a) => a.plenumResult === 'ANGENOMMEN').length} Angenommen</span>
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold">
                <X className="w-3.5 h-3.5 text-rose-400 stroke-[3]" />
                <span>{pastHauptAntraege.filter((a) => a.plenumResult === 'ABGELEHNT').length} Abgelehnt</span>
              </span>
            </div>
          </div>

          {pastHauptAntraege.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center text-slate-400">
              <History className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <h3 className="text-base font-bold text-slate-300 mb-1">
                Noch keine vergangenen Anträge
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
                Sobald im Plenum ein Antrag als ANGENOMMEN oder ABGELEHNT markiert wird und ausfadet, erscheint er hier dauerhaft mit allen dazugehörigen Nebenanträgen.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pastHauptAntraege.map((hauptAntrag) => {
                const subAntraege = session.antraege.filter(
                  (a) => a.parentAntragId === hauptAntrag.id && a.type !== 'HAUPTANTRAG'
                );

                return (
                  <PastAntragCard
                    key={hauptAntrag.id}
                    hauptAntrag={hauptAntrag}
                    subAntraege={subAntraege}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Subtab 3: Google Drive & Unterlagen (Nur für Admin zugänglich) */}
      {currentSubTab === 'drive' && isStrictAdmin && (
        <DriveFolderViewer
          driveFolderUrl={session.driveFolderUrl}
          isStrictAdmin={isStrictAdmin}
          sessionId={session.id}
          onUpdateFolderUrl={handleUpdateDriveUrl}
          onOpenParser={() => setShowParserModal(true)}
        />
      )}

      {/* Subtab 4: Meme-Feed */}
      {currentSubTab === 'memes' && canViewMemes && (
        <MemeFeedTab
          memes={session.memes}
          currentUserName={currentUserName}
          isStrategieLeader={isStrategieLeader}
          onAddMeme={handleAddMeme}
          onReactMeme={handleReactMeme}
          onDeleteMeme={(memeId) => sipRealtime.deleteMeme(memeId, settings)}
        />
      )}

      {/* Subtab 5: Archiv & Protokolle (nur Strategieführung & Admin) */}
      {currentSubTab === 'archive' && isStrategyView && (
        <SipArchiveView
          currentSession={session}
          settings={settings}
          currentUserName={currentUserName}
          onArchiveAndClearSession={async () => {
            await sipRealtime.archiveAndClearCurrentSession(settings);
          }}
          onStartNewSession={async (options) => {
            await sipRealtime.startNewSession(options, settings);
          }}
        />
      )}
        </main>
      </div>

      {/* Footer */}
      <footer className="pt-6 pb-2 text-center text-xs text-slate-500 border-t border-slate-900/60 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-3">
        <span>Schüler:innenparlament (SiP)</span>
        <span className="hidden sm:inline text-slate-700">•</span>
        <span className="text-slate-400 font-semibold">© Elias Mathis</span>
      </footer>
    </div>
  );
};

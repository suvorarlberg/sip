import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Send,
  Bookmark,
  Trash2,
  Edit3,
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
  BellRing,
  Clock,
  EyeOff,
} from 'lucide-react';
import { DirectMessagePriority, SipDirectMessage } from '../types';

export const PRIORITY_CONFIG: Record<
  DirectMessagePriority,
  {
    label: string;
    badgeText: string;
    borderClass: string;
    glowClass: string;
    iconBgClass: string;
    badgeClass: string;
    buttonClass: string;
  }
> = {
  info: {
    label: 'ℹ️ Hinweis / Info',
    badgeText: 'Information der Strategieführung',
    borderClass: 'border-sky-500/70 shadow-sky-500/25',
    glowClass: 'bg-sky-500/20',
    iconBgClass: 'bg-sky-500/20 border-sky-400/40 text-sky-300',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    buttonClass:
      'from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 shadow-sky-500/30',
  },
  important: {
    label: '⚠️ Wichtig',
    badgeText: 'Wichtige Mitteilung der Strategieführung',
    borderClass: 'border-amber-500/70 shadow-amber-500/25',
    glowClass: 'bg-amber-500/20',
    iconBgClass: 'bg-amber-500/20 border-amber-400/40 text-amber-300',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    buttonClass:
      'from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-amber-500/30',
  },
  urgent: {
    label: '🚨 Dringend / Eilmeldung',
    badgeText: 'Dringende Eilmeldung der Strategieführung',
    borderClass: 'border-rose-500/80 shadow-rose-500/30',
    glowClass: 'bg-rose-500/25',
    iconBgClass: 'bg-rose-500/20 border-rose-400/50 text-rose-300',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    buttonClass:
      'from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white shadow-rose-500/30',
  },
};

interface DirectMessageOverlayModalProps {
  message: SipDirectMessage;
  onDismiss: () => void;
}

export const DirectMessageOverlayModal: React.FC<DirectMessageOverlayModalProps> = ({
  message,
  onDismiss,
}) => {
  const prio = PRIORITY_CONFIG[message.priority] || PRIORITY_CONFIG.important;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xl animate-in fade-in duration-300">
      <div
        className={`relative w-full max-w-lg bg-slate-900/95 border-2 ${prio.borderClass} rounded-3xl p-6 sm:p-8 shadow-2xl text-white overflow-hidden`}
      >
        {/* Glow Effects */}
        <div
          className={`absolute -top-24 -left-24 w-52 h-52 ${prio.glowClass} rounded-full blur-3xl pointer-events-none`}
        />
        <div
          className={`absolute -bottom-24 -right-24 w-52 h-52 ${prio.glowClass} rounded-full blur-3xl pointer-events-none`}
        />

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Icon */}
          <div
            className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl border ${prio.iconBgClass} mb-4 animate-bounce`}
          >
            {message.priority === 'urgent' ? (
              <BellRing className="w-8 h-8" />
            ) : message.priority === 'info' ? (
              <Info className="w-8 h-8" />
            ) : (
              <Megaphone className="w-8 h-8" />
            )}
          </div>

          <span
            className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border mb-2.5 ${prio.badgeClass}`}
          >
            📢 {prio.badgeText}
          </span>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-4 leading-snug">
            {message.title || 'Mitteilung der Strategieführung'}
          </h2>

          {/* Message Body Box */}
          <div className="w-full text-left bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 mb-5 shadow-inner max-h-[50vh] overflow-y-auto">
            <p className="text-sm sm:text-base text-slate-100 whitespace-pre-wrap leading-relaxed font-medium">
              {message.content}
            </p>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>
                Gesendet von: <strong className="text-slate-200">{message.author}</strong>
              </span>
              {message.publishedAt && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(message.publishedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  Uhr
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className={`w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r ${prio.buttonClass} font-black shadow-lg transition transform hover:-translate-y-0.5 cursor-pointer text-sm sm:text-base`}
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Verstanden & Schließen</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface DirectMessageComposerModalProps {
  currentUserName: string;
  directMessages: SipDirectMessage[];
  activeDirectMessage: SipDirectMessage | null;
  initialDraft?: SipDirectMessage | null;
  onClose: () => void;
  onSaveDraft: (data: {
    id?: string;
    title: string;
    content: string;
    author: string;
    priority: DirectMessagePriority;
  }) => Promise<void>;
  onPublishNow: (data: {
    id?: string;
    title: string;
    content: string;
    author: string;
    priority: DirectMessagePriority;
  }) => Promise<void>;
  onPublishExisting: (messageId: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onClearActiveOverlay: () => Promise<void>;
}

export const DirectMessageComposerModal: React.FC<DirectMessageComposerModalProps> = ({
  currentUserName,
  directMessages,
  activeDirectMessage,
  initialDraft,
  onClose,
  onSaveDraft,
  onPublishNow,
  onPublishExisting,
  onDeleteMessage,
  onClearActiveOverlay,
}) => {
  const [editingId, setEditingId] = useState<string | undefined>(initialDraft?.id);
  const [title, setTitle] = useState(initialDraft?.title || '');
  const [content, setContent] = useState(initialDraft?.content || '');
  const [priority, setPriority] = useState<DirectMessagePriority>(
    initialDraft?.priority || 'important'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  useEffect(() => {
    if (initialDraft) {
      setEditingId(initialDraft.id);
      setTitle(initialDraft.title);
      setContent(initialDraft.content);
      setPriority(initialDraft.priority || 'important');
    }
  }, [initialDraft]);

  const drafts = directMessages.filter((m) => m.status === 'draft');
  const publishedHistory = directMessages.filter((m) => m.status === 'published');

  function resetForm() {
    setEditingId(undefined);
    setTitle('');
    setContent('');
    setPriority('important');
  }

  async function handleSaveAsDraft() {
    if (!content.trim()) return;
    setIsSubmitting(true);
    try {
      await onSaveDraft({
        id: editingId,
        title: title.trim() || 'Wichtige Mitteilung der Strategieführung',
        content: content.trim(),
        author: currentUserName,
        priority,
      });
      resetForm();
      setFeedbackBanner('Entwurf wurde gespeichert und kann jederzeit veröffentlicht werden.');
      setTimeout(() => setFeedbackBanner(null), 4000);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendImmediately(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setIsSubmitting(true);
    try {
      await onPublishNow({
        id: editingId,
        title: title.trim() || 'Wichtige Mitteilung der Strategieführung',
        content: content.trim(),
        author: currentUserName,
        priority,
      });
      resetForm();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLoadDraftForEdit(msg: SipDirectMessage) {
    setEditingId(msg.id);
    setTitle(msg.title);
    setContent(msg.content);
    setPriority(msg.priority || 'important');
    setFeedbackBanner(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-5 sm:p-7 shadow-2xl text-white space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center shrink-0">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white">
                {editingId ? 'Direktnachricht bearbeiten' : 'Direktnachricht schreiben'}
              </h2>
              <p className="text-xs text-slate-400">
                Nachricht sofort als Vollbild-Overlay an alle Geräte senden oder vorab als Entwurf speichern
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            title="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {feedbackBanner && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{feedbackBanner}</span>
          </div>
        )}

        {/* Active Message Status if one is currently live */}
        {activeDirectMessage && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs">
              <span className="font-bold text-amber-300 block">
                ● Aktuell als Overlay aktiv: „{activeDirectMessage.title}“
              </span>
              <span className="text-slate-400 line-clamp-1">{activeDirectMessage.content}</span>
            </div>
            <button
              type="button"
              onClick={onClearActiveOverlay}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-bold shrink-0 cursor-pointer transition"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>Overlay beenden</span>
            </button>
          </div>
        )}

        {/* Form: Write / Pre-write Message */}
        <form onSubmit={handleSendImmediately} className="space-y-4">
          {/* Priority Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Dringlichkeit / Darstellung
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['info', 'important', 'urgent'] as DirectMessagePriority[]).map((prioKey) => {
                const conf = PRIORITY_CONFIG[prioKey];
                const isSelected = priority === prioKey;
                return (
                  <button
                    key={prioKey}
                    type="button"
                    onClick={() => setPriority(prioKey)}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'bg-white text-slate-950 border-white shadow-md'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <span>{conf.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title / Subject */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Überschrift / Titel (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Wichtige Mitteilung der Strategieführung / Treffpunkt in der Pause"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Message Content */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Nachrichtentext *
            </label>
            <textarea
              rows={4}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Schreibe hier die Nachricht, die als Overlay-Fenster auf allen Geräten erscheinen soll..."
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-amber-500 leading-relaxed"
            />
          </div>

          {/* Action Buttons: Save Draft vs. Publish Immediately */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2">
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer transition"
              >
                Bearbeitung abbrechen
              </button>
            ) : (
              <div />
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                type="button"
                disabled={!content.trim() || isSubmitting}
                onClick={handleSaveAsDraft}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-amber-500/40 text-amber-300 font-bold text-xs sm:text-sm transition cursor-pointer"
                title="Nachricht nur vorschreiben und für eine spätere Veröffentlichung speichern"
              >
                <Bookmark className="w-4 h-4" />
                <span>
                  {editingId ? 'Änderung als Entwurf speichern' : 'Als Entwurf speichern (Vorschreiben)'}
                </span>
              </button>

              <button
                type="submit"
                disabled={!content.trim() || isSubmitting}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/25 transition cursor-pointer"
                title="Nachricht sofort als Vollbild-Overlay auf allen Geräten anzeigen"
              >
                <Send className="w-4 h-4" />
                <span>Jetzt an alle senden (Veröffentlichen)</span>
              </button>
            </div>
          </div>
        </form>

        {/* Saved Drafts Section ("Vorgeschriebene Nachrichten") */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-amber-300 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-amber-400" />
              <span>Vorgeschriebene Nachrichten / Entwürfe ({drafts.length})</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              Für spätere Veröffentlichung gespeichert
            </span>
          </div>

          {drafts.length === 0 ? (
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center text-xs text-slate-400">
              Noch keine vorgeschriebenen Entwürfe vorhanden. Nutze oben „Als Entwurf speichern (Vorschreiben)“, um Nachrichten vorab vorzubereiten.
            </div>
          ) : (
            <div className="space-y-2.5">
              {drafts.map((draft) => {
                const prioConf = PRIORITY_CONFIG[draft.priority] || PRIORITY_CONFIG.important;
                return (
                  <div
                    key={draft.id}
                    className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-amber-500/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${prioConf.badgeClass}`}
                        >
                          {prioConf.label}
                        </span>
                        <span className="text-xs font-bold text-white truncate">
                          {draft.title}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          • von {draft.author}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2 whitespace-pre-wrap">
                        {draft.content}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={async () => {
                          await onPublishExisting(draft.id);
                          onClose();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 cursor-pointer transition"
                        title="Diesen Entwurf jetzt live als Overlay auf allen Geräten veröffentlichen"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Veröffentlichen</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleLoadDraftForEdit(draft)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Entwurf bearbeiten"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteMessage(draft.id)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                        title="Entwurf löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sent Messages History */}
        {publishedHistory.length > 0 && (
          <div className="pt-4 border-t border-slate-800 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Zuletzt veröffentlichte Direktnachrichten ({publishedHistory.length})
            </h3>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {publishedHistory.slice(0, 8).map((msg) => (
                <div
                  key={msg.id}
                  className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-200 truncate">{msg.title}</div>
                    <div className="text-slate-400 truncate">{msg.content}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        await onPublishExisting(msg.id);
                        onClose();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 border border-slate-700 hover:border-amber-500/40 text-amber-300 font-semibold cursor-pointer transition"
                      title="Erneut als Overlay auf allen Geräten anzeigen"
                    >
                      Erneut senden
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteMessage(msg.id)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer transition"
                      title="Löschen"
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
    </div>
  );
};

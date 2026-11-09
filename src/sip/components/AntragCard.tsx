import React, { useState } from 'react';
import {
  UserCheck,
  UserX,
  Play,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  Sparkles,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Target,
  Mic,
  Copy,
  Check,
} from 'lucide-react';
import { ANTRAG_TYPE_CONFIG, SipAntrag } from '../types';
import { cleanSubMotionTitle } from '../utils/sipAutoImporter';

interface AntragCardProps {
  antrag: SipAntrag;
  currentUserName: string;
  isStrategieLeader: boolean;
  onClaim: (antragId: string) => void;
  onUnclaim: (antragId: string) => void;
  onAssignClaim?: (antragId: string, memberName: string) => void;
  onActivate: (antrag: SipAntrag) => void;
  onEdit: (antrag: SipAntrag) => void;
  onDelete: (antragId: string) => void;
  onApprove?: (antragId: string) => void;
  onReject?: (antragId: string) => void;
}

export const AntragCard: React.FC<AntragCardProps> = ({
  antrag,
  currentUserName,
  isStrategieLeader,
  onClaim,
  onUnclaim,
  onAssignClaim,
  onActivate,
  onEdit,
  onDelete,
  onApprove,
  onReject,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasCopiedRede, setHasCopiedRede] = useState(false);
  const typeConfig = ANTRAG_TYPE_CONFIG[antrag.type] || ANTRAG_TYPE_CONFIG.SONSTIGES;
  const isClaimedByMe = antrag.claimedBy === currentUserName;
  const isPending = antrag.status === 'pending_approval';

  return (
    <div
      id={`antrag-${antrag.id}`}
      className={`relative rounded-2xl border transition-all duration-300 p-4 sm:p-5 ${
        antrag.isActive
          ? 'bg-slate-900 border-sky-400 ring-2 ring-sky-400/40 shadow-xl shadow-sky-500/10'
          : antrag.plenumResult === 'ANGENOMMEN'
          ? 'bg-slate-900/80 border-emerald-500/50 hover:border-emerald-500/70'
          : antrag.plenumResult === 'ABGELEHNT'
          ? 'bg-slate-900/80 border-rose-500/50 hover:border-rose-500/70'
          : isPending
          ? 'bg-slate-900/60 border-amber-500/40'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Top Banner if Active in Plenum */}
      {antrag.isActive && (
        <div className="absolute -top-3 left-4 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-sky-500 text-slate-950 text-xs font-black uppercase tracking-wider shadow-md">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Aktuell im Plenum</span>
        </div>
      )}

      {/* Status banner for custom motions */}
      {!antrag.isPreFab &&
        (antrag.id.startsWith('antrag_custom_') ||
          antrag.status !== 'approved' ||
          antrag.isEditedByAdmin) && (
        <div className="mb-3">
          {antrag.status === 'pending_approval' ? (
            <div className="w-full bg-amber-500/15 border border-amber-500/30 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs text-amber-300">
              <span className="flex items-center gap-1.5 font-bold">
                <Clock className="w-4 h-4 text-amber-400" />
                Bestätigung ausstehend
              </span>
              <span className="text-[11px] text-amber-400/80">
                Wartet auf Prüfung durch die Strategieführung
              </span>
              {isStrategieLeader && onApprove && onReject && (
                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onApprove(antrag.id);
                    }}
                    className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer shadow"
                  >
                    Bestätigen
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReject(antrag.id);
                    }}
                    className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-semibold text-xs cursor-pointer"
                  >
                    Ablehnen
                  </button>
                </div>
              )}
            </div>
          ) : antrag.status === 'approved' ? (
            <div className="w-full bg-emerald-500/15 border border-emerald-500/30 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs text-emerald-300">
              <span className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {antrag.isEditedByAdmin ? 'Geändert durch Strategieführung' : 'Bestätigt & freigegeben'}
              </span>
              <span className="text-[11px] text-emerald-400/80">
                Im Plenum zugelassen
              </span>
            </div>
          ) : antrag.status === 'rejected' ? (
            <div className="w-full bg-rose-500/15 border border-rose-500/30 p-2.5 rounded-xl flex items-center justify-between gap-2 text-xs text-rose-300">
              <span className="flex items-center gap-1.5 font-bold">
                <Clock className="w-4 h-4 text-rose-400" />
                Von Strategieführung abgelehnt
              </span>
              <span className="text-[11px] text-rose-400/80">
                Nicht im Plenum zugelassen
              </span>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        {/* Left: Badges, Author & Title */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
                       {antrag.type !== 'HAUPTANTRAG' && (
              <span
                title={typeConfig.description}
                className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-bold ${typeConfig.badgeColor}`}
              >
                {typeConfig.label}
              </span>
            )}

            {antrag.lineOrParagraph && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                📍 {antrag.lineOrParagraph}
              </span>
            )}

            {/* Plenums-Ergebnis Badge falls bereits entschieden */}
            {antrag.plenumResult && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-black border ${
                  antrag.plenumResult === 'ANGENOMMEN'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}
              >
                {antrag.plenumResult === 'ANGENOMMEN' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                    <span>ANGENOMMEN</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>ABGELEHNT</span>
                  </>
                )}
              </span>
            )}

            {/* Antragsteller:in nur bei Hauptanträgen anzeigen (bei Nebenanträgen steht daneben, wer geclaimed hat) */}
            {antrag.type === 'HAUPTANTRAG' && (
              <span className="text-xs font-semibold text-sky-300 bg-sky-950/60 border border-sky-500/30 px-2.5 py-0.5 rounded-lg">
                Antragsteller:in: <strong className="text-white">{antrag.author}</strong>
              </span>
            )}
          </div>

          <h3 className="text-base sm:text-lg font-bold text-white mb-2 leading-snug">
            {antrag.type !== 'HAUPTANTRAG' ? cleanSubMotionTitle(antrag.title) : antrag.title}
          </h3>

          {/* Main Content Area: 2-line snippet by default, expandable */}
          <div className="bg-slate-950/70 p-3 sm:p-4 rounded-xl border border-slate-800/80 mb-2">
            {antrag.rede ? (
              <>
                <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                    <Mic className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Vorbereitete Rede ({antrag.author}):</span>
                  </div>
                  {isExpanded && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(antrag.rede || '');
                        setHasCopiedRede(true);
                        setTimeout(() => setHasCopiedRede(false), 2000);
                      }}
                      className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition cursor-pointer"
                      title="Redetext kopieren"
                    >
                      {hasCopiedRede ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Kopiert!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Rede kopieren</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <p
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                  className={`text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-sans cursor-pointer hover:text-white transition ${isExpanded ? '' : 'line-clamp-2'}`}
                  title={isExpanded ? 'Klicken zum Einklappen' : 'Klicken zum Aufklappen'}
                >
                  {antrag.rede}
                </p>
              </>
            ) : (
              <p
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className={`text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-sans cursor-pointer hover:text-white transition ${isExpanded ? '' : 'line-clamp-2'}`}
                title={isExpanded ? 'Klicken zum Einklappen' : 'Klicken zum Aufklappen'}
              >
                {antrag.content}
              </p>
            )}

            {/* Expanded section: Forderungspunkte */}
            {isExpanded && (
              <div className="mt-3 space-y-3 pt-3 border-t border-slate-800 animate-in fade-in">
                {antrag.forderungspunkte && antrag.forderungspunkte.length > 0 && (
                  <div className="bg-sky-950/40 border border-sky-500/30 rounded-xl p-3 sm:p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300 mb-2">
                      <Target className="w-3.5 h-3.5 text-sky-400" />
                      <span>Daher fordert das Vorarlberger Schüler:innenparlament ({antrag.forderungspunkte.length}):</span>
                    </div>
                    <ul className="space-y-1.5">
                      {antrag.forderungspunkte.map((f, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-slate-200">
                          <span className="text-sky-400 font-bold shrink-0 mt-0.5">•</span>
                          <span className="leading-snug">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Toggle button if there is overflow or extra details */}
            {((antrag.rede && (antrag.rede.length > 120 || antrag.rede.includes('\n'))) ||
              (antrag.content && (antrag.content.length > 120 || antrag.content.includes('\n'))) ||
              (antrag.forderungspunkte && antrag.forderungspunkte.length > 0)) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="inline-flex items-center gap-1 mt-2.5 text-xs font-semibold text-sky-400 hover:text-sky-300 transition cursor-pointer"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Weniger anzeigen (Einklappen)</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Ganzen Antragstext & Details zeigen (Aufklappen)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Right / Bottom: Claim Status & Actions */}
        <div className="flex flex-col sm:items-end justify-between gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
          {/* Claim Status Display: Hauptanträge können nicht geclaimed werden, daher nur für Nebenanträge */}
          {antrag.type !== 'HAUPTANTRAG' && (
            <div className="flex items-center gap-1.5 text-xs">
              {antrag.claimedBy ? (
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold border ${
                    isClaimedByMe
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {isClaimedByMe ? (
                      <>Von dir geclaimed</>
                    ) : (
                      <>
                        Geclaimed von: <strong>{antrag.claimedBy}</strong>
                      </>
                    )}
                  </span>
                </div>
              ) : (
                <span className="text-slate-400 text-xs italic">
                  Noch nicht vergeben
                </span>
              )}
            </div>
          )}

          {/* Claiming Buttons:
              1. Hauptanträge können nicht geclaimed werden.
              2. In der Strategieführungsansicht kann nichts geclaimed werden (es steht nur dort, wer geclaimed hat).
              3. Mitglieder können Nebenanträge claimen / Claim abgeben.
          */}
          <div className="flex flex-wrap items-center gap-2">
            {antrag.type !== 'HAUPTANTRAG' && !isStrategieLeader && (
              !antrag.claimedBy ? (
                <button
                  type="button"
                  onClick={() => onClaim(antrag.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-sky-500/20 transition cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Antrag claimen</span>
                </button>
              ) : isClaimedByMe ? (
                <button
                  type="button"
                  onClick={() => onUnclaim(antrag.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 font-medium text-xs transition cursor-pointer"
                  title="Claim freigeben"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Claim abgeben</span>
                </button>
              ) : null
            )}

            {/* Strategieführung Claim Controls: Claim entziehen oder vergeben */}
            {antrag.type !== 'HAUPTANTRAG' && isStrategieLeader && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {antrag.claimedBy ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const newName = prompt(
                          `Redner:in für diesen Antrag neu zuweisen (aktuell: ${antrag.claimedBy}):`,
                          antrag.claimedBy
                        );
                        if (newName && newName.trim()) {
                          if (onAssignClaim) {
                            onAssignClaim(antrag.id, newName.trim());
                          } else {
                            onClaim(antrag.id);
                          }
                        }
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 text-xs font-semibold cursor-pointer transition"
                      title={`Claim an andere Person neu vergeben (aktuell: ${antrag.claimedBy})`}
                    >
                      <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Neu vergeben</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Möchtest du den Claim von ${antrag.claimedBy} wirklich entziehen?`)) {
                          onUnclaim(antrag.id);
                        }
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 text-xs font-semibold cursor-pointer transition"
                      title={`Claim von ${antrag.claimedBy} entziehen`}
                    >
                      <UserX className="w-3.5 h-3.5 text-rose-400" />
                      <span>Claim entziehen</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const newName = prompt(
                        "Wem soll dieser Antrag/Wortmeldung zugewiesen werden? (Name eingeben):"
                      );
                      if (newName && newName.trim()) {
                        if (onAssignClaim) {
                          onAssignClaim(antrag.id, newName.trim());
                        } else {
                          onClaim(antrag.id);
                        }
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 cursor-pointer transition"
                    title="Claim an Delegierte:n vergeben"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Claim vergeben</span>
                  </button>
                )}
              </div>
            )}

            {/* Strategieführung Controls */}
            {isStrategieLeader && (
              <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2">
                {antrag.type === 'HAUPTANTRAG' && (
                  !antrag.isActive ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onActivate(antrag);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs shadow-md shadow-sky-500/25 transition cursor-pointer"
                      title="Antrag im Plenum aufrufen (Bestätigungsfenster)"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Aufrufen</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Aktiv
                    </span>
                  )
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(antrag);
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Antrag bearbeiten"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(antrag.id);
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                  title="Antrag löschen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

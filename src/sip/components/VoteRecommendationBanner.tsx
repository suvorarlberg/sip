import React, { useState } from 'react';
import {
  Edit3,
  Send,
  EyeOff,
  Radio,
} from 'lucide-react';
import { VoteRecommendation, VoteType } from '../types';

interface VoteRecommendationBannerProps {
  recommendation: VoteRecommendation;
  isStrategieLeader: boolean;
  onUpdateRecommendation: (rec: { type: VoteType; note: string; isPublished: boolean }) => void;
}

export const VoteRecommendationBanner: React.FC<VoteRecommendationBannerProps> = ({
  recommendation,
  isStrategieLeader,
  onUpdateRecommendation,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedType, setSelectedType] = useState<VoteType>(
    recommendation.type === 'KEINE' ? 'JA' : recommendation.type
  );
  const [customNote, setCustomNote] = useState(recommendation.note);

  const isPublished = recommendation.isPublished ?? false;
  const hasActiveRec = recommendation.type !== 'KEINE';

  const getStyleForVote = (type: VoteType) => {
    switch (type) {
      case 'JA':
        return {
          emoji: '✅',
          label: 'JA',
          title: 'ABSTIMMUNGSEMPFEHLUNG: JA',
        };
      case 'NEIN':
        return {
          emoji: '❌',
          label: 'NEIN',
          title: 'ABSTIMMUNGSEMPFEHLUNG: NEIN',
        };
      case 'ENTHALTUNG':
        return {
          emoji: '⚠️',
          label: 'ENTHALTUNG',
          title: 'ABSTIMMUNGSEMPFEHLUNG: ENTHALTUNG',
        };
      case 'FREI':
        return {
          emoji: '⚖️',
          label: 'FREIE WAHL',
          title: 'FREIE ABSTIMMUNG / GEWISSENSENTSCHEID',
        };
      case 'KEINE':
      default:
        return {
          emoji: '⏳',
          label: 'NOCH OFFEN',
          title: 'KEINE ABSTIMMUNGSEMPFEHLUNG',
        };
    }
  };

  const currentStyle = getStyleForVote(hasActiveRec ? recommendation.type : 'KEINE');

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    onUpdateRecommendation({
      type: selectedType,
      note: customNote.trim(),
      isPublished: true,
    });
    setIsEditing(false);
  }

  function handleUnpublish() {
    onUpdateRecommendation({
      type: 'KEINE',
      note: '',
      isPublished: false,
    });
    setIsEditing(false);
  }

  // 1. Wenn Mitglied und Empfehlung noch nicht veröffentlicht ist:
  if (!isStrategieLeader && (!isPublished || !hasActiveRec)) {
    return (
      <div className="w-full mb-6 p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 text-white shadow-xl flex items-center justify-between gap-4 animate-in fade-in">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Debatte läuft
              </span>
            </div>
            <h4 className="text-sm sm:text-base font-bold text-white">
              Abstimmungsempfehlung folgt im Laufe der Debatte
            </h4>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Die Strategieführung legt die offizielle Abstimmungsempfehlung während der Redebeiträge fest und sendet sie kurz vor dem Votum an alle Bildschirme.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mb-6">
      <div
        className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 text-white shadow-xl transition-all duration-300"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Discreet Vote Decision (Text + Emoji only) */}
          <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {isPublished ? 'Offizielle Abstimmungsempfehlung' : 'Entwurf (Noch nicht gesendet)'}
                </span>

                {isPublished && (
                  <span className="text-xs text-slate-400">
                    {new Date(recommendation.updatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    Uhr
                  </span>
                )}

                {isStrategieLeader && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isPublished
                        ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                        : 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                    }`}
                  >
                    {isPublished ? '● an alle übertragen' : '⏳ Für Mitglieder noch unsichtbar'}
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2.5">
                <span className="text-xs sm:text-sm font-semibold text-slate-400">
                  {isPublished ? 'Empfehlung:' : 'Geplante Empfehlung:'}
                </span>
                <span className="text-base sm:text-lg font-bold tracking-tight text-white">
                  {currentStyle.emoji} {currentStyle.label}
                </span>
              </div>

              {recommendation.note && (
                <p className="mt-1.5 text-xs sm:text-sm text-slate-200 font-medium leading-relaxed max-w-2xl bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                  💬 {recommendation.note}
                </p>
              )}
            </div>
          </div>

          {/* Right: Quick Action Controls for Strategieführung */}
          {isStrategieLeader && (
            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              {!isEditing ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedType(hasActiveRec ? recommendation.type : 'JA');
                      setCustomNote(recommendation.note);
                      setIsEditing(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-slate-950 hover:bg-slate-100 font-bold text-xs sm:text-sm transition shadow-lg cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isPublished ? 'Empfehlung anpassen' : 'Empfehlung an alle senden'}</span>
                  </button>

                  {isPublished && (
                    <button
                      type="button"
                      onClick={handleUnpublish}
                      className="p-2 rounded-xl bg-black/30 hover:bg-black/50 text-white/80 hover:text-white border border-white/20 transition cursor-pointer"
                      title="Empfehlung zurückziehen (Mitglieder sehen sie nicht mehr)"
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Inline Editor for Leadership */}
        {isEditing && isStrategieLeader && (
          <form
            onSubmit={handleSave}
            className="mt-4 pt-4 border-t border-white/20 bg-black/30 p-4 rounded-2xl space-y-3"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-white">
              Abstimmungsempfehlung festlegen & an alle Mitglieder übertragen:
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['JA', 'NEIN', 'ENTHALTUNG', 'FREI'] as VoteType[]).map((type) => {
                const isSelected = selectedType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={`py-2 px-3 rounded-xl font-black text-xs sm:text-sm border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'bg-white text-slate-950 border-white shadow-lg'
                        : 'bg-black/30 text-white hover:bg-black/40 border-white/20'
                    }`}
                  >
                    {type === 'JA' && '✅ JA'}
                    {type === 'NEIN' && '❌ NEIN'}
                    {type === 'ENTHALTUNG' && '⚠️ ENTHALTUNG'}
                    {type === 'FREI' && '⚖️ FREIE WAHL'}
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-white/90 mb-1">
                Begründung / taktische Notiz für die Delegierten:
              </label>
              <input
                type="text"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="z.B. Unbedingt mit JA stimmen – wichtiger Beschluss für Vorarlberg!"
                className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl bg-black/50 border border-white/30 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 transition"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-white text-slate-950 font-black text-xs sm:text-sm hover:bg-slate-100 transition shadow-lg cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Jetzt an alle senden</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

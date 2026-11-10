import React, { useState } from 'react';
import { X, Send, FilePlus, Info } from 'lucide-react';
import { ANTRAG_TYPE_CONFIG, AntragType, SipAntrag } from '../types';

interface NewAntragModalProps {
  currentUserName: string;
  isStrategieLeader: boolean;
  parentAntrag?: SipAntrag | null;
  assigneeOptions: string[];
  defaultType?: AntragType;
  onClose: () => void;
  onSubmit: (antrag: Omit<SipAntrag, 'id' | 'isPreFab' | 'status' | 'createdAt'>) => void;
}

export const NewAntragModal: React.FC<NewAntragModalProps> = ({
  currentUserName,
  isStrategieLeader,
  parentAntrag,
  assigneeOptions,
  defaultType = 'AAA',
  onClose,
  onSubmit,
}) => {
  const [type, setType] = useState<AntragType>(defaultType);
  const [title, setTitle] = useState(
    parentAntrag ? `${defaultType === 'AAA' ? 'ÄA zu' : defaultType === 'EA' ? 'EA zu' : defaultType === 'SA' ? 'SA zu' : defaultType === 'WM' ? 'Wortmeldung zu' : 'Antrag zu'} ${parentAntrag.title}` : ''
  );
  const [lineOrParagraph, setLineOrParagraph] = useState(parentAntrag?.lineOrParagraph || '');
  const [content, setContent] = useState('');
    const [claimedBy, setClaimedBy] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

    function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setErrorMsg('Bitte gib einen Titel und den genauen Antragstext ein.');
      return;
    }

    onSubmit({
      type,
      title: title.trim(),
      lineOrParagraph: lineOrParagraph.trim() || undefined,
      content: content.trim(),
      author: currentUserName,
      isActive: false,
      parentAntragId: parentAntrag?.id,
      ...(isStrategieLeader ? { claimedBy: claimedBy.trim() || null } : {}),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl text-white max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <FilePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold">Neuen Antrag einreichen</h2>
              <p className="text-xs text-slate-400">
                Als {currentUserName} verfassen
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {parentAntrag && (
          <div className="mb-4 p-3 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center gap-2.5 text-xs text-sky-300">
            <Info className="w-4 h-4 shrink-0 text-sky-400" />
            <span>
              Bezieht sich auf aktuellen Antrag: <strong>{parentAntrag.title}</strong>
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Antragstyp Auswahl */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Antragstyp wählen
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(ANTRAG_TYPE_CONFIG) as AntragType[])
                .filter((t) => {
                  // GO-Anträge sind keine Nebenanträge und können nicht als Nebenantrag geschrieben werden
                  if (parentAntrag && (t === 'HAUPTANTRAG')) {
                    return false;
                  }
                  return true;
                })
                .map((t) => {
                const conf = ANTRAG_TYPE_CONFIG[t];
                const isSelected = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`py-2 px-2.5 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-md shadow-sky-500/10'
                        : 'bg-slate-800/60 border-slate-700 hover:border-slate-600 text-slate-300'
                    }`}
                  >
                    <span className="font-bold text-xs">{conf.shortLabel}</span>
                    <span className="text-[10px] text-slate-400 line-clamp-1">
                      {conf.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Zeile / Paragraf */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Bezug (Zeile, Absatz oder Paragraf)
            </label>
            <input
              type="text"
              value={lineOrParagraph}
              onChange={(e) => setLineOrParagraph(e.target.value)}
              placeholder="z.B. Zeile 45-48 oder § 4 Abs. 2 (optional)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {isStrategieLeader && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Optional zuweisen an
              </label>
              <select
                value={claimedBy}
                onChange={(e) => setClaimedBy(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                <option value="">Ungeclaimt lassen</option>
                {assigneeOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Titel */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Antragstitel / Kurzbeschreibung *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. ÄA zu Antrag 3: Streichung der Pflichtklausel"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Ausformulierung */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Genaue Formulierung / Text des Antrags *
            </label>
            <textarea
              required
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Formuliere hier den genauen Text, der geändert, ergänzt oder gestrichen werden soll, sowie die Begründung..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Hinweis zur Freigabe */}
          <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-start gap-2.5 text-xs text-slate-300">
            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <span>
              {isStrategieLeader
                ? 'Du bist als Strategieführung eingeloggt: Der Antrag wird direkt freigegeben.'
                : 'Eingereichte Anträge werden zunächst der Strategieführung zur Prüfung & redaktionellen Bearbeitung vorgelegt, bevor sie im Plenum freigeschaltet werden.'}
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 transition cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Antrag einreichen</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

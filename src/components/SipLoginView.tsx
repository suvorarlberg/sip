import React, { useState, useMemo } from 'react';
import {
  Lock,
  User,
  LogIn,
  AlertCircle,
  Eye,
  EyeOff,
  Smartphone,
  KeyRound,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import {
  isAccountExpired,
  MemberAccount,
  normalizeUsernameForComparison,
} from '../types';
import suLogo from '../assets/su-logo.png';
import { verifyTotpCode, verifyAndConsumeBackupCode } from '../utils/totp';

interface SipLoginViewProps {
  memberAccounts: MemberAccount[];
  strategiePassword: string;
  adminPassword?: string;
  totpEnabled?: boolean;
  totpSecret?: string;
  totpBackupCodes?: string[];
  onConsumeBackupCode?: (usedCode: string) => Promise<boolean>;
  onLoginSuccess: (account: MemberAccount, isAdminUnlocked?: boolean) => void;
}

export const SipLoginView: React.FC<SipLoginViewProps> = ({
  memberAccounts,
  strategiePassword,
  adminPassword = 'admin2026!',
  totpEnabled = false,
  totpSecret = '',
  totpBackupCodes = [],
  onConsumeBackupCode,
  onLoginSuccess,
}) => {
  const [stage, setStage] = useState<'credentials' | 'admin_totp' | 'admin_backup_code'>('credentials');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCodeInput, setTotpCodeInput] = useState('');
  const [backupCodeInput, setBackupCodeInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const matchingSuggestions = useMemo(() => {
    const q = usernameInput.trim().toLowerCase();
    if (!q) return [];
    const exactMatch = memberAccounts.some((acc) => acc.username.toLowerCase() === q);
    if (exactMatch) return [];
    return memberAccounts
      .filter(
        (acc) =>
          acc.username.toLowerCase().includes(q) ||
          acc.name.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [usernameInput, memberAccounts]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const rawUser = usernameInput.trim();
    const rawPass = passwordInput.trim();

    if (!rawUser || !rawPass) {
      setErrorMsg('ungültiger Benutzername oder Passwort, bitte versuche es erneut');
      return;
    }

    const lowerUser = rawUser.toLowerCase();

    // 0. Administrator-Login (mit 2-Ebenen-2FA oder Notfallcode-Option)
    if (lowerUser === 'admin' || lowerUser === 'administrator') {
      const validAdminPass = adminPassword || 'admin2026!';
      if (rawPass === validAdminPass) {
        // Stufe 1 bestanden -> Falls 2FA aktiviert ist: Stufe 2 (Handycode)
        if (totpEnabled && totpSecret) {
          setStage('admin_totp');
          setTotpCodeInput('');
          setErrorMsg(null);
          return;
        }

        // Ohne 2FA direkt als Administrator einloggen
        onLoginSuccess(
          {
            name: 'Administrator',
            username: 'admin@schuelerunion.at',
            password: rawPass,
            role: 'admin',
          },
          true
        );
        return;
      }
      setErrorMsg('ungültiger Benutzername oder Passwort, bitte versuche es erneut');
      return;
    }

    // 1. Eigener Strategieführung-Systemaccount (optional)
    if (lowerUser === 'strategieführung' || lowerUser === 'strategie' || lowerUser === 'leitung') {
      const validStratPass = strategiePassword && strategiePassword !== 'admin' ? strategiePassword : 'strategie2026';
      if (rawPass === validStratPass) {
        onLoginSuccess({
          name: 'Strategieführung',
          username: 'strategie@schuelerunion.at',
          password: rawPass,
          role: 'strategie',
        });
        return;
      }
      setErrorMsg('ungültiger Benutzername oder Passwort, bitte versuche es erneut');
      return;
    }

    // 3. Personen-Accounts (Mitglieder, Gäste, zur Strategieführung ernannte Personen)
    const withDomain = rawUser.includes('@') ? rawUser : `${rawUser}@schuelerunion.at`;
    const normalizedInput = normalizeUsernameForComparison(withDomain);

    const matchedAccount = memberAccounts.find(
      (acc) =>
        normalizeUsernameForComparison(acc.username) === normalizedInput ||
        acc.name.toLowerCase() === lowerUser
    );

    if (!matchedAccount) {
      setErrorMsg('ungültiger Benutzername oder Passwort, bitte versuche es erneut');
      return;
    }

    // Prüfe Ablaufzeit (Expiration bei Gästen)
    if (isAccountExpired(matchedAccount)) {
      const expDate = new Date(matchedAccount.expiresAt!).toLocaleString('de-AT', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      setErrorMsg(
        `Dieser Gastzugang ist am ${expDate} Uhr abgelaufen. Bitte wende dich an die Administration für eine Verlängerung.`
      );
      return;
    }

    // Passwort-Vergleich
    if (matchedAccount.password !== rawPass) {
      setErrorMsg('ungültiger Benutzername oder Passwort, bitte versuche es erneut');
      return;
    }

    // Wenn Person zur Strategieführung erhoben wurde, hat das Konto role === 'strategie'
    onLoginSuccess(matchedAccount);
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!totpSecret) {
      setErrorMsg('2FA-Geheimschlüssel nicht konfiguriert. Bitte Notfallcode nutzen.');
      return;
    }

    const clean = totpCodeInput.replace(/\s+/g, '').trim();
    if (clean.length !== 6) {
      setErrorMsg('Bitte gib den vollständigen 6-stelligen Code aus der Authenticator-App ein.');
      return;
    }

    setIsVerifying(true);
    try {
      const valid = await verifyTotpCode(totpSecret, clean);
      if (!valid) {
        setErrorMsg('Ungültiger 6-stelliger Code. Bitte überprüfe die Authenticator-App und versuche es erneut.');
        return;
      }

      onLoginSuccess(
        {
          name: 'Administrator',
          username: 'admin@schuelerunion.at',
          password: passwordInput || adminPassword,
          role: 'admin',
        },
        true
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleBackupCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const clean = backupCodeInput.trim();
    if (!clean) {
      setErrorMsg('Bitte gib einen Notfallcode ein.');
      return;
    }

    const verification = verifyAndConsumeBackupCode(clean, totpBackupCodes);
    if (!verification.valid || !verification.usedCode) {
      setErrorMsg('Ungültiger oder bereits verbrauchter Notfallcode. Bitte überprüfe deine Notfall-Liste.');
      return;
    }

    setIsVerifying(true);
    try {
      if (onConsumeBackupCode) {
        await onConsumeBackupCode(verification.usedCode);
      }
      setSuccessNotice(`Notfallcode eingelöst! Noch ${verification.remainingCodes.length} Ersatzcodes übrig.`);
      setTimeout(() => {
        onLoginSuccess(
          {
            name: 'Administrator',
            username: 'admin@schuelerunion.at',
            password: adminPassword,
            role: 'admin',
          },
          true
        );
      }, 600);
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden selection:bg-sky-500 selection:text-slate-950">
      {/* Background Glows */}
      <div className="absolute top-1/4 -left-32 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-white">
        {/* Header Icon & Title */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-white p-2 shadow-xl shadow-sky-500/10 flex items-center justify-center mb-3">
            <img
              src={suLogo}
              alt="Schülerunion Vorarlberg Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-1">
            Schüler:innenparlament
          </span>
          <h1 className="text-2xl font-black text-white">
            SiP Live-Tool Login
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Melde dich mit deinen Zugangsdaten an
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {successNotice && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-300 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed font-semibold">{successNotice}</span>
          </div>
        )}

        {/* STUFE 1: Reguläres Login-Formular */}
        {stage === 'credentials' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Input */}
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Benutzername
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={usernameInput}
                  onChange={(e) => {
                    setUsernameInput(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Benutzername"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>

              {/* Suggestions list */}
              {showSuggestions && matchingSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                  {matchingSuggestions.map((acc) => (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => {
                        setUsernameInput(acc.username);
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs hover:bg-slate-800 text-slate-200 flex items-center justify-between transition cursor-pointer"
                    >
                      <span className="font-semibold">{acc.name}</span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {acc.username.replace('@schuelerunion.at', '')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Passwort
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Passwort"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/25 transition cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Im SiP anmelden</span>
            </button>

            {/* Notfall-Link für Admins */}
            <div className="pt-2 text-center border-t border-slate-800/60">
              <button
                type="button"
                onClick={() => {
                  setStage('admin_backup_code');
                  setErrorMsg(null);
                }}
                className="text-xs text-slate-400 hover:text-amber-400 underline decoration-slate-700 hover:decoration-amber-400 underline-offset-4 transition cursor-pointer"
              >
                Admin-Notfallzugang (Passwort oder Handy verloren?)
              </button>
            </div>
          </form>
        )}

        {/* STUFE 2: 2FA Handycode für Admin */}
        {stage === 'admin_totp' && (
          <form onSubmit={handleTotpSubmit} className="space-y-4 animate-in fade-in">
            <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-center space-y-1.5">
              <div className="w-10 h-10 mx-auto rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">Zwei-Faktor-Authentifizierung (2FA)</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Gib den aktuellen 6-stelligen Bestätigungscode aus deiner <strong>Authenticator-App</strong> ein:
              </p>
            </div>

            <div>
              <input
                type="text"
                required
                autoFocus
                maxLength={6}
                value={totpCodeInput}
                onChange={(e) => setTotpCodeInput(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full py-3 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-[0.5em] text-2xl font-bold focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <button
              type="submit"
              disabled={isVerifying || totpCodeInput.length !== 6}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/25 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isVerifying ? 'Überprüfe Code...' : 'Code bestätigen & anmelden'}</span>
            </button>

            <div className="pt-2 flex flex-col items-center gap-2 text-xs border-t border-slate-800/60">
              <button
                type="button"
                onClick={() => {
                  setStage('admin_backup_code');
                  setErrorMsg(null);
                }}
                className="text-amber-400 hover:underline cursor-pointer"
              >
                Kein Zugriff auf das Smartphone? Notfallcode verwenden
              </button>
              <button
                type="button"
                onClick={() => {
                  setStage('credentials');
                  setErrorMsg(null);
                }}
                className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Zurück zur Passworteingabe</span>
              </button>
            </div>
          </form>
        )}

        {/* NOTFALLSTUFE: Ersatzcode für Admin */}
        {stage === 'admin_backup_code' && (
          <form onSubmit={handleBackupCodeSubmit} className="space-y-4 animate-in fade-in">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <KeyRound className="w-4 h-4" />
                <span>Admin-Notfallzugang</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Gib einen deiner 10 Notfallcodes ein. Jeder Code kann genau einmal genutzt werden, falls du dein Passwort oder dein Handy verloren hast.
              </p>
              <div className="text-[11px] text-slate-400 font-mono pt-1">
                Verbleibende Notfallcodes: <strong className="text-white">{totpBackupCodes.length}</strong> von 10
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ersatzcode eingeben (z. B. XXXX-XXXX)
              </label>
              <input
                type="text"
                required
                autoFocus
                value={backupCodeInput}
                onChange={(e) => setBackupCodeInput(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                className="w-full py-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-widest text-base font-bold focus:outline-none focus:border-amber-500 uppercase"
              />
            </div>

            <button
              type="submit"
              disabled={isVerifying || !backupCodeInput.trim()}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/25 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isVerifying ? 'Prüfe Notfallcode...' : 'Mit Notfallcode als Admin anmelden'}</span>
            </button>

            <div className="pt-2 text-center border-t border-slate-800/60">
              <button
                type="button"
                onClick={() => {
                  setStage('credentials');
                  setErrorMsg(null);
                }}
                className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 mx-auto cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Zurück zur regulären Anmeldung</span>
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center space-y-2">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Zugangsdaten vergessen oder externer Gast? Wende dich an die <strong>Strategieführung</strong> im Plenum.
          </p>
          <p className="text-[11px] text-slate-500 font-medium">
            © Elias Mathis
          </p>
        </div>
      </div>
    </div>
  );
};

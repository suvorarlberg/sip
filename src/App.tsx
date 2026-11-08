import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  User,
  LogOut,
  Star,
} from 'lucide-react';
import {
  AppSettings,
  DEFAULT_SIP_SETTINGS,
  isAccountExpired,
  MemberAccount,
  normalizeUsernameForComparison,
} from './types';
import suLogo from './assets/su-logo.png';
import { SipLoginView } from './components/SipLoginView';
import { SipAdminView } from './components/SipAdminView';
import { AdminUnlockModal } from './components/AdminUnlockModal';
import { SipMainView } from './sip/components/SipMainView';
import { sipRealtime } from './sip/sipRealtime';
import {
  verifyAdmin2FACode,
  querySipRow,
  upsertSipRow,
  SIP_CONFIG_ROW_ID,
  parsePbTimestamp,
} from './utils/pocketbaseSync';
import { verifyTotpCode } from './utils/totp';

const STORAGE_KEYS = {
  SETTINGS: 'sip_standalone_settings_v3',
  PENDING_CONFIG_SYNC: 'sip_pending_config_sync_v3',
  LAST_CONFIG_SERVER_UPDATED: 'sip_config_server_updated_v3',
  LOGGED_USER: 'sip_logged_in_user_v3',
  ADMIN_UNLOCKED: 'sip_admin_unlocked_v3',
};

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.adminPassword === 'admin') {
          parsed.adminPassword = 'admin2026!';
        }
        return {
          ...DEFAULT_SIP_SETTINGS,
          ...parsed,
          adminPassword: parsed.adminPassword || 'admin2026!',
          strategiePassword: parsed.strategiePassword || 'strategie2026',
          totpSecret: parsed.totpSecret || '',
          totpEnabled: parsed.totpEnabled ?? false,
          totpBackupCodes: Array.isArray(parsed.totpBackupCodes) ? parsed.totpBackupCodes : [],
        };
      }
    } catch (loadSettingsErr) {}
    return DEFAULT_SIP_SETTINGS;
  });

  const [currentUser, setCurrentUser] = useState<MemberAccount | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LOGGED_USER);
      if (saved) {
        const acc = JSON.parse(saved) as MemberAccount;
        if (!isAccountExpired(acc)) return acc;
      }
    } catch (loadUserErr) {}
    return null;
  });

  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.ADMIN_UNLOCKED) === 'true';
  });

  const [currentView, setCurrentView] = useState<'parliament' | 'admin'>('parliament');
  const [initial2FAVerified, setInitial2FAVerified] = useState(false);
  const [showAdminUnlockModal, setShowAdminUnlockModal] = useState(false);

  const settingsRef = useRef<AppSettings>(settings);
  const lastConfigMutationAtRef = useRef<number>(0);
  const isSyncingConfigRef = useRef<boolean>(false);
  const pendingSyncSettingsRef = useRef<AppSettings | null>(null);
  const lastAppliedServerUpdatedRef = useRef<string>(
    typeof window !== 'undefined'
      ? localStorage.getItem(STORAGE_KEYS.LAST_CONFIG_SERVER_UPDATED) || ''
      : ''
  );
  const deletedUsernamesRef = useRef<Set<string>>(
    new Set((settings.deletedUsernames || []).map(normalizeUsernameForComparison))
  );
  const cachedCloudExtraPayloadRef = useRef<Record<string, any>>({});

  function saveSettingsToLocalStorage(nextSettings: AppSettings, markPendingSync: boolean) {
    const serialized = JSON.stringify(nextSettings);
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, serialized);
      if (markPendingSync) {
        localStorage.setItem(STORAGE_KEYS.PENDING_CONFIG_SYNC, serialized);
      }
    } catch (storageErr) {
      // Falls LocalStorage wegen alter Archiv-Daten voll ist (QuotaExceededError), Archiv-Cache bereinigen
      try {
        localStorage.removeItem('sip_archived_sessions_v1');
        localStorage.setItem(STORAGE_KEYS.SETTINGS, serialized);
        if (markPendingSync) {
          localStorage.setItem(STORAGE_KEYS.PENDING_CONFIG_SYNC, serialized);
        }
      } catch (retryErr) {
        console.error('Fehler beim Speichern der Einstellungen im LocalStorage:', retryErr);
      }
    }
  }

  function nextConfigTimestamp(prevUpdatedAt?: string): string {
    const now = Date.now();
    const prev = parsePbTimestamp(prevUpdatedAt);
    const next = prev > 0 && now <= prev ? prev + 1 : now;
    return new Date(next).toISOString();
  }

  function applyCloudSettingsPayload(
    payload: any,
    recordUpdated?: string,
    forceOverwrite = false
  ) {
    if (!payload || typeof payload !== 'object') return;

    // Niemals lokale ungespeicherte Änderungen (während eines laufenden oder nach Reload ausstehenden Syncs) überschreiben!
    if (isSyncingConfigRef.current || Boolean(localStorage.getItem(STORAGE_KEYS.PENDING_CONFIG_SYNC))) {
      return;
    }

    if (!forceOverwrite) {
      if (Date.now() - lastConfigMutationAtRef.current < 2500) {
        return;
      }
      if (recordUpdated) {
        const incomingServerTime = parsePbTimestamp(recordUpdated);
        const lastServerTime = parsePbTimestamp(lastAppliedServerUpdatedRef.current);
        if (incomingServerTime > 0 && lastServerTime > 0 && incomingServerTime <= lastServerTime) {
          return;
        }
      } else {
        const remoteTime = parsePbTimestamp(payload.updatedAt);
        const localTime = parsePbTimestamp(settingsRef.current.updatedAt);
        if (remoteTime > 0 && localTime > 0 && remoteTime <= localTime) {
          return;
        }
      }
    }

    const remoteDeletedSet = new Set<string>(
      Array.isArray(payload.deletedUsernames)
        ? payload.deletedUsernames.filter(Boolean).map(normalizeUsernameForComparison)
        : []
    );

    if (Array.isArray(payload.memberAccounts)) {
      payload.memberAccounts.forEach((acc: MemberAccount) => {
        if (acc && acc.username) {
          const norm = normalizeUsernameForComparison(acc.username);
          if (!remoteDeletedSet.has(norm)) {
            deletedUsernamesRef.current.delete(norm);
          }
        }
      });
    }

    remoteDeletedSet.forEach((norm) => {
      deletedUsernamesRef.current.add(norm);
    });

    const rawAccounts: MemberAccount[] = Array.isArray(payload.memberAccounts)
      ? payload.memberAccounts
      : settingsRef.current.memberAccounts;

    const filteredAccounts = rawAccounts.filter(
      (acc) => !deletedUsernamesRef.current.has(normalizeUsernameForComparison(acc.username))
    );

    if (recordUpdated) {
      lastAppliedServerUpdatedRef.current = recordUpdated;
      sipRealtime.markConfigServerUpdated(recordUpdated);
      try {
        localStorage.setItem(STORAGE_KEYS.LAST_CONFIG_SERVER_UPDATED, recordUpdated);
      } catch (e) {}
    }

    const nextSettings: AppSettings = {
      ...settingsRef.current,
      memberAccounts: filteredAccounts,
      deletedUsernames: Array.from(deletedUsernamesRef.current),
      adminPassword: payload.adminPassword || settingsRef.current.adminPassword,
      strategiePassword: payload.strategiePassword || settingsRef.current.strategiePassword,
      adminEmail:
        payload.adminEmail !== undefined ? payload.adminEmail : settingsRef.current.adminEmail,
      totpSecret:
        payload.totpSecret !== undefined ? payload.totpSecret : settingsRef.current.totpSecret,
      totpEnabled:
        payload.totpEnabled !== undefined ? payload.totpEnabled : settingsRef.current.totpEnabled,
      totpBackupCodes:
        payload.totpBackupCodes !== undefined
          ? payload.totpBackupCodes
          : settingsRef.current.totpBackupCodes,
      updatedAt: payload.updatedAt || recordUpdated || settingsRef.current.updatedAt,
    };

    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    saveSettingsToLocalStorage(nextSettings, false);
  }

  // Automatische Erkennung beim Öffnen über den 2FA-Bestätigungslink aus der E-Mail (wie im Inventurprogramm)
  useEffect(() => {
    const url = new URL(window.location.href);
    const has2FAParam =
      url.searchParams.get('2fa') === 'verify' ||
      url.hash.includes('access_token') ||
      Boolean(url.searchParams.get('2fa_code'));

    function grantAdminSession() {
      setInitial2FAVerified(true);
      setIsAdminUnlocked(true);
      localStorage.setItem(STORAGE_KEYS.ADMIN_UNLOCKED, 'true');
      setCurrentView('admin');

      // Falls aktuell noch kein Benutzer eingeloggt ist, erstelle eine verifizierte Admin-Sitzung
      setCurrentUser((prev) => {
        if (prev) return prev;
        const matched = settings.memberAccounts.find(
          (a) => a.username.toLowerCase() === settings.adminEmail?.toLowerCase()
        );
        const adminUser: MemberAccount = matched || {
          name: 'Administrator',
          username: settings.adminEmail || 'admin@schuelerunion.at',
          password: settings.adminPassword,
          role: 'admin',
        };
        localStorage.setItem(STORAGE_KEYS.LOGGED_USER, JSON.stringify(adminUser));
        return adminUser;
      });

      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (has2FAParam && settings.adminEmail) {
      verifyAdmin2FACode(settings, settings.adminEmail, window.location.href).then((ok) => {
        if (ok) {
          grantAdminSession();
        }
      });
    }
  }, [settings.adminEmail, settings.memberAccounts, settings.adminPassword]);

  // Cloud Sync für Einstellungen & Accounts
  useEffect(() => {
    async function initAndFetchUsers() {
      try {
        // 1. Prüfe zuerst, ob vor einem Seiten-Reload (F5) noch eine ungespeicherte Änderung ausstand
        const pendingRaw = localStorage.getItem(STORAGE_KEYS.PENDING_CONFIG_SYNC);
        if (pendingRaw) {
          try {
            const pendingSettings = JSON.parse(pendingRaw) as AppSettings;
            if (pendingSettings && Array.isArray(pendingSettings.memberAccounts)) {
              await syncConfigToPocketBase(pendingSettings);
              return;
            }
          } catch (pendingErr) {
            localStorage.removeItem(STORAGE_KEYS.PENDING_CONFIG_SYNC);
          }
        }

        // 2. Kein ausstehender Sync -> lade aktuellen Stand aus PocketBase
        const res = await querySipRow(SIP_CONFIG_ROW_ID);
        const data = res ? res.data : null;
        const error = res ? res.error : null;

        if (error) {
          console.error('[SiP Config Fetch] Fehler beim Laden der Benutzer-Konfiguration:', error);
          return;
        }

        if (data && data.payload) {
          cachedCloudExtraPayloadRef.current = data.payload;
          const serverTime = parsePbTimestamp(data.updated);
          const knownServerTime = parsePbTimestamp(lastAppliedServerUpdatedRef.current);
          if (knownServerTime > 0 && serverTime > 0 && serverTime < knownServerTime) {
            // Der Server-Datensatz ist älter als unser zuletzt bestätigter Stand -> lokalen Stand erneut pushen
            void syncConfigToPocketBase(settingsRef.current);
          } else {
            applyCloudSettingsPayload(data.payload, data.updated, true);
          }
        }
      } catch (err) {
        console.error('[SiP Config Fetch] Unerwarteter Fehler beim Laden der Accounts:', err);
      }
    }
    initAndFetchUsers();

    const unsubConfig = sipRealtime.onConfigUpdate((payload, recordUpdated) => {
      if (payload && typeof payload === 'object') {
        cachedCloudExtraPayloadRef.current = {
          ...cachedCloudExtraPayloadRef.current,
          ...payload,
        };
        applyCloudSettingsPayload(payload, recordUpdated, false);
      }
    });

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.SETTINGS && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as AppSettings;
          if (parsed && typeof parsed === 'object') {
            applyCloudSettingsPayload(parsed, undefined, false);
          }
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      unsubConfig();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Halte aktuellen Benutzer-State (Rolle, Ablaufdatum, Name) synchron mit Änderungen in settings.memberAccounts
  useEffect(() => {
    if (!currentUser) return;
    const normCurrent = normalizeUsernameForComparison(currentUser.username);
    const matched = settings.memberAccounts.find(
      (a) => normalizeUsernameForComparison(a.username) === normCurrent
    );
    if (matched) {
      if (
        matched.role !== currentUser.role ||
        matched.name !== currentUser.name ||
        matched.expiresAt !== currentUser.expiresAt ||
        matched.password !== currentUser.password ||
        matched.isExternal !== currentUser.isExternal
      ) {
        setCurrentUser(matched);
        try {
          localStorage.setItem(STORAGE_KEYS.LOGGED_USER, JSON.stringify(matched));
        } catch (e) {}
      }
    }
  }, [settings.memberAccounts, currentUser]);

  // Initialisiere SiP-Realtime sofort beim Start der App (lädt currentsession0 sofort aus PocketBase)
  useEffect(() => {
    sipRealtime.init(settings);
  }, []);

  async function persistSettingsToPocketBase(targetSettings: AppSettings): Promise<void> {
    const newPayload = {
      ...cachedCloudExtraPayloadRef.current,
      memberAccounts: targetSettings.memberAccounts,
      deletedUsernames: targetSettings.deletedUsernames || [],
      adminPassword: targetSettings.adminPassword,
      strategiePassword: targetSettings.strategiePassword,
      adminEmail: targetSettings.adminEmail,
      totpSecret: targetSettings.totpSecret,
      totpEnabled: targetSettings.totpEnabled,
      totpBackupCodes: targetSettings.totpBackupCodes,
      updatedAt: targetSettings.updatedAt,
    };

    const recordData = {
      id: SIP_CONFIG_ROW_ID,
      payload: newPayload,
    };

    const res = await upsertSipRow(recordData);
    if (!res.success || res.error) {
      throw (
        res.error ||
        new Error('Datenbank-Update für Benutzer-Konfiguration (sipusersconfig0) fehlgeschlagen')
      );
    }
    if (res.data?.updated) {
      lastAppliedServerUpdatedRef.current = res.data.updated;
      sipRealtime.markConfigServerUpdated(res.data.updated);
      try {
        localStorage.setItem(STORAGE_KEYS.LAST_CONFIG_SERVER_UPDATED, res.data.updated);
      } catch (e) {}
    }
    if (res.data?.payload) {
      cachedCloudExtraPayloadRef.current = res.data.payload;
    }
    if (!pendingSyncSettingsRef.current && settingsRef.current.updatedAt === targetSettings.updatedAt) {
      try {
        localStorage.removeItem(STORAGE_KEYS.PENDING_CONFIG_SYNC);
      } catch (e) {}
    }
  }

  async function syncConfigToPocketBase(targetSettings: AppSettings): Promise<void> {
    lastConfigMutationAtRef.current = Date.now();

    if (isSyncingConfigRef.current) {
      pendingSyncSettingsRef.current = targetSettings;
      return;
    }

    isSyncingConfigRef.current = true;
    let currentToSync: AppSettings | null = targetSettings;
    let lastError: any = null;

    try {
      while (currentToSync) {
        const snapshotToSave = currentToSync;
        pendingSyncSettingsRef.current = null;
        lastConfigMutationAtRef.current = Date.now();

        try {
          await persistSettingsToPocketBase(snapshotToSave);
        } catch (err) {
          lastError = err;
          console.error('[SiP Settings Sync] Fehler beim Speichern in PocketBase:', err);
        }

        lastConfigMutationAtRef.current = Date.now();
        currentToSync = pendingSyncSettingsRef.current;
      }
      if (lastError) {
        throw lastError;
      }
    } finally {
      lastConfigMutationAtRef.current = Date.now();
      isSyncingConfigRef.current = false;
    }
  }

  async function handleDeleteUserAccount(username: string): Promise<void> {
    const normTarget = normalizeUsernameForComparison(username);
    lastConfigMutationAtRef.current = Date.now();
    deletedUsernamesRef.current.add(normTarget);

    const updatedAt = nextConfigTimestamp(settingsRef.current.updatedAt);
    const filteredAccounts = settingsRef.current.memberAccounts.filter(
      (acc) =>
        acc.username !== username &&
        normalizeUsernameForComparison(acc.username) !== normTarget &&
        !deletedUsernamesRef.current.has(normalizeUsernameForComparison(acc.username))
    );

    const nextSettings: AppSettings = {
      ...settingsRef.current,
      memberAccounts: filteredAccounts,
      deletedUsernames: Array.from(deletedUsernamesRef.current),
      updatedAt,
    };

    // 1. Sofortiges lokales & Cross-Tab UI-Update (0ms Optimistic Update + Pending-Sync-Schutz bei F5)
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    saveSettingsToLocalStorage(nextSettings, true);
    sipRealtime.broadcastConfigSync(nextSettings);

    // 2. Asynchrones Persistieren in PocketBase (mit keepalive: true gegen Reload-Abbruch)
    try {
      await syncConfigToPocketBase(nextSettings);
    } catch (err) {
      console.error('[SiP Account Delete] Fehler beim Löschen des Accounts in der Datenbank:', err);
      throw err;
    }
  }

  async function handleSaveSettings(newSettings: AppSettings): Promise<void> {
    lastConfigMutationAtRef.current = Date.now();

    const currentNormSet = new Set(
      settingsRef.current.memberAccounts.map((a) => normalizeUsernameForComparison(a.username))
    );
    newSettings.memberAccounts.forEach((acc) => {
      const norm = normalizeUsernameForComparison(acc.username);
      if (!currentNormSet.has(norm)) {
        deletedUsernamesRef.current.delete(norm);
      }
    });

    const updatedAt = nextConfigTimestamp(settingsRef.current.updatedAt);
    const sanitizedAccounts = newSettings.memberAccounts.filter(
      (acc) => !deletedUsernamesRef.current.has(normalizeUsernameForComparison(acc.username))
    );

    const nextSettings: AppSettings = {
      ...settingsRef.current,
      ...newSettings,
      memberAccounts: sanitizedAccounts,
      deletedUsernames: Array.from(deletedUsernamesRef.current),
      updatedAt,
    };

    // 1. Sofortiges lokales & Cross-Tab UI-Update (0ms Optimistic Update + Pending-Sync-Schutz bei F5)
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    saveSettingsToLocalStorage(nextSettings, true);
    sipRealtime.broadcastConfigSync(nextSettings);

    // 2. Asynchrones Persistieren in PocketBase (mit keepalive: true gegen Reload-Abbruch)
    try {
      await syncConfigToPocketBase(nextSettings);
    } catch (err) {
      console.error('[SiP Settings Sync] Fehler beim Speichern der Einstellungen in der Datenbank:', err);
      throw err;
    }
  }

  async function handleConsumeBackupCode(usedCode: string): Promise<boolean> {
    const currentCodes = settings.totpBackupCodes || [];
    const normalizedUsed = usedCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const nextCodes = currentCodes.filter(
      (c) => c.replace(/[^A-Za-z0-9]/g, '').toUpperCase() !== normalizedUsed
    );
    const newSettings: AppSettings = {
      ...settings,
      totpBackupCodes: nextCodes,
    };
    await handleSaveSettings(newSettings);
    return true;
  }

  function handleLoginSuccess(account: MemberAccount, unlockAdmin?: boolean) {
    setCurrentUser(account);
    localStorage.setItem(STORAGE_KEYS.LOGGED_USER, JSON.stringify(account));
    if (unlockAdmin || account.role === 'admin') {
      setIsAdminUnlocked(true);
      localStorage.setItem(STORAGE_KEYS.ADMIN_UNLOCKED, 'true');
    }
  }

  function handleLogout() {
    setCurrentUser(null);
    setIsAdminUnlocked(false);
    setCurrentView('parliament');
    localStorage.removeItem(STORAGE_KEYS.LOGGED_USER);
    localStorage.removeItem(STORAGE_KEYS.ADMIN_UNLOCKED);
  }

  function handleAdminButtonClick() {
    if (isAdminUnlocked) {
      setCurrentView(currentView === 'admin' ? 'parliament' : 'admin');
    } else {
      setShowAdminUnlockModal(true);
    }
  }

  // 1. Vorgeschaltetes Login-Fenster wenn nicht angemeldet
  if (!currentUser) {
    return (
      <SipLoginView
        memberAccounts={settings.memberAccounts}
        strategiePassword={settings.strategiePassword}
        adminPassword={settings.adminPassword}
        totpEnabled={settings.totpEnabled}
        totpSecret={settings.totpSecret}
        totpBackupCodes={settings.totpBackupCodes || []}
        onConsumeBackupCode={handleConsumeBackupCode}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  // 2. Angemeldeter Bereich
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-slate-950">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <div
            onClick={() => setCurrentView('parliament')}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-lg shrink-0">
              <img
                src={suLogo}
                alt="Schülerunion Vorarlberg"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-sky-400 block leading-tight">
                Schüler:innenparlament
              </span>
              <span className="text-sm sm:text-base font-black text-white leading-tight">
                SiP Live-Tool
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switch: Parlament vs. Admin-Bereich */}
            <button
              type="button"
              onClick={handleAdminButtonClick}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer border ${
                currentView === 'admin'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{currentView === 'admin' ? 'Zum Plenum' : 'Admin & Konten'}</span>
            </button>

            {/* User badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-200">
              <User className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold">{currentUser.name}</span>
              {currentUser.role === 'strategie' && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded font-black flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-current" />
                  Strategie
                </span>
              )}
              {currentUser.role === 'admin' && (
                <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/40 px-1.5 py-0.2 rounded font-bold">
                  Admin
                </span>
              )}
              {currentUser.isExternal && (
                <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.2 rounded font-bold">
                  Gast
                </span>
              )}
            </div>

            {/* Logout button */}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-medium transition cursor-pointer"
              title="Abmelden"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-4">
        {currentView === 'admin' ? (
          <SipAdminView
            settings={settings}
            onUpdateSettings={handleSaveSettings}
            onDeleteUser={handleDeleteUserAccount}
            onClose={() => setCurrentView('parliament')}
            initial2FAVerified={initial2FAVerified}
          />
        ) : (
          <SipMainView
            settings={settings}
            currentMember={currentUser}
            isAdminUnlocked={isAdminUnlocked || currentUser.role === 'admin'}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-500 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-3">
        <span>Schüler:innenparlament (SiP) • Angemeldet als <strong>{currentUser.name}</strong> ({currentUser.username})</span>
        <span className="hidden sm:inline text-slate-700">•</span>
        <span className="text-slate-400 font-semibold">© Elias Mathis</span>
      </footer>

      {/* Modal zum Entsperren des Admin-Bereichs per Passwort & 2FA / Notfallcode */}
      <AdminUnlockModal
        isOpen={showAdminUnlockModal}
        onClose={() => setShowAdminUnlockModal(false)}
        adminPassword={settings.adminPassword}
        totpEnabled={settings.totpEnabled}
        totpSecret={settings.totpSecret}
        totpBackupCodes={settings.totpBackupCodes || []}
        onConsumeBackupCode={handleConsumeBackupCode}
        onUnlockSuccess={() => {
          setIsAdminUnlocked(true);
          localStorage.setItem(STORAGE_KEYS.ADMIN_UNLOCKED, 'true');
          setCurrentView('admin');
        }}
      />
    </div>
  );
};
export default App;

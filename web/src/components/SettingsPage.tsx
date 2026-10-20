import { useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, Building2, Camera, Check, Database, Download, Globe, LogOut, Minus, Moon, Palette, Play, Plus, Sun, Timer, Trash2, UserRound } from 'lucide-react';
import { ROLE_RANK, api, errorMessage } from '../api';
import { exportTasksCsv, resizeAvatar } from '../csv';
import { startFocus, useFocusSession } from '../focus';
import { PALETTES, WALLPAPERS, useAllTasks, useAppearanceContext, useWorkspace } from '../hooks';
import { LANGS, useI18n, type MessageKey } from '../i18n';
import { setPrefs, usePrefs, type Prefs } from '../prefs';
import { toast } from '../toast';
import { PALETTE_SWATCH } from './SettingsMenu';
import { WorkspaceSettingsPanel } from './TeamPage';
import { Avatar } from './ui';

type SectionId = 'profile' | 'notifications' | 'appearance' | 'focus' | 'language' | 'data' | 'workspace';

const SECTIONS: { id: SectionId; key: MessageKey; icon: ReactNode; tone: string }[] = [
  { id: 'profile', key: 'settings.profile', icon: <UserRound size={15} />, tone: '#3b5bfd' },
  { id: 'notifications', key: 'settings.notifications', icon: <Bell size={15} />, tone: '#e5484d' },
  { id: 'appearance', key: 'settings.appearance', icon: <Palette size={15} />, tone: '#8b5cf6' },
  { id: 'focus', key: 'settings.focus', icon: <Timer size={15} />, tone: '#f97316' },
  { id: 'language', key: 'settings.language', icon: <Globe size={15} />, tone: '#0ea5e9' },
  { id: 'data', key: 'settings.data', icon: <Database size={15} />, tone: '#14b8a6' },
  { id: 'workspace', key: 'members.settings', icon: <Building2 size={15} />, tone: '#64748b' },
];

function Switch({ on, onChange, labelledBy }: { on: boolean; onChange: (on: boolean) => void; labelledBy: string }) {
  return (
    <button role="switch" aria-checked={on} aria-labelledby={labelledBy} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

function SectionIcon({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className="section-icon" style={{ ['--tone' as string]: tone }} aria-hidden="true">
      {children}
    </span>
  );
}

export function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { me, workspace, projects, members } = useWorkspace();
  const look = useAppearanceContext();
  const prefs = usePrefs();
  const focus = useFocusSession();
  const { data: tasks = [] } = useAllTasks();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me.name);
  const [saving, setSaving] = useState(false);
  const isAdmin = ROLE_RANK[workspace.role] >= ROLE_RANK.admin;
  const sections = SECTIONS.filter((s) => s.id !== 'workspace' || isAdmin);

  const saveProfile = async (patch: Parameters<typeof api.updateMe>[0], message?: MessageKey) => {
    setSaving(true);
    try {
      const user = await api.updateMe(patch);
      qc.setQueryData(['me'], user);
      qc.invalidateQueries({ queryKey: ['members'] });
      if (message) toast(t(message));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const avatar = await resizeAvatar(file);
      await saveProfile({ avatar }, 'settings.photoSaved');
    } catch {
      toast(t('settings.photoError'), 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const jump = (id: SectionId) => document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const notificationRows: { key: keyof Prefs; title: MessageKey; hint: MessageKey; tone: string; icon: ReactNode }[] = [
    { key: 'liveToasts', title: 'settings.notifyLive', hint: 'settings.notifyLiveHint', tone: '#3b5bfd', icon: <Bell size={14} /> },
    { key: 'dueReminder', title: 'settings.notifyDue', hint: 'settings.notifyDueHint', tone: '#f97316', icon: <Bell size={14} /> },
    { key: 'focusDone', title: 'settings.notifyFocus', hint: 'settings.notifyFocusHint', tone: '#8b5cf6', icon: <Timer size={14} /> },
  ];

  return (
    <div className="page-scroll settings-page">
      <header className="page-head reveal">
        <div className="page-title">
          <h1>{t('nav.settings')}</h1>
          <p className="page-sub">{t('settings.subtitle')}</p>
        </div>
      </header>

      <div className="settings-layout">
        <aside className="settings-nav glass reveal" aria-label={t('nav.settings')}>
          <div className="settings-me">
            <Avatar user={me} size={38} />
            <div className="person-text">
              <strong className="truncate">{me.name}</strong>
              <span className="muted small truncate">{me.email}</span>
            </div>
          </div>
          <nav>
            {sections.map((s) => (
              <button key={s.id} className="settings-nav-item" onClick={() => jump(s.id)}>
                <SectionIcon tone={s.tone}>{s.icon}</SectionIcon>
                <span>{t(s.key)}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="settings-sections">
          <section id="settings-profile" className="panel glass reveal">
            <header className="panel-head">
              <div>
                <h2>{t('settings.profile')}</h2>
                <p className="muted small">{t('settings.profileHint')}</p>
              </div>
            </header>
            <div className="profile-hero">
              <button className="avatar-edit" onClick={() => fileRef.current?.click()} aria-label={t('settings.changePhoto')}>
                <Avatar user={me} size={84} />
                <span className="avatar-edit-badge">
                  <Camera size={15} />
                </span>
              </button>
              <div className="profile-actions">
                <strong className="profile-name">{me.name}</strong>
                <span className="muted small">
                  {t(`role.${workspace.role}`)} · {workspace.name}
                </span>
                <div className="profile-buttons">
                  <button className="btn btn-sm btn-ghost-glass" onClick={() => fileRef.current?.click()} disabled={saving}>
                    <Camera size={14} /> {me.avatar ? t('settings.changePhoto') : t('settings.addPhoto')}
                  </button>
                  {me.avatar && (
                    <button className="btn btn-sm btn-ghost-glass" onClick={() => saveProfile({ avatar: null }, 'settings.photoRemoved')} disabled={saving}>
                      <Trash2 size={14} /> {t('settings.removePhoto')}
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => pickPhoto(e.target.files?.[0])}
              />
            </div>
            <dl className="settings-list">
              <div>
                <dt>{t('auth.name')}</dt>
                <dd>
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (name.trim() && name.trim() !== me.name) saveProfile({ name: name.trim() }, 'members.saved');
                    }}
                  >
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label={t('auth.name')} />
                    {name.trim() !== me.name && (
                      <button className="btn btn-sm btn-primary" disabled={!name.trim() || saving}>
                        {t('members.save')}
                      </button>
                    )}
                  </form>
                </dd>
              </div>
              <div>
                <dt>{t('auth.email')}</dt>
                <dd className="muted">{me.email}</dd>
              </div>
              <div>
                <dt>{t('settings.timezone')}</dt>
                <dd className="muted">{me.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}</dd>
              </div>
            </dl>
            <div className="profile-foot">
              <button className="btn btn-sm btn-ghost-glass" onClick={onLogout}>
                <LogOut size={15} /> {t('nav.signOut')}
              </button>
            </div>
          </section>

          <section id="settings-notifications" className="panel glass reveal">
            <header className="panel-head">
              <div>
                <h2>{t('settings.notifications')}</h2>
                <p className="muted small">{t('settings.notificationsHint')}</p>
              </div>
            </header>
            {notificationRows.map((row) => (
              <div key={row.key} className="setting-row">
                <SectionIcon tone={row.tone}>{row.icon}</SectionIcon>
                <div className="setting-text">
                  <strong id={`pref-${row.key}`}>{t(row.title)}</strong>
                  <p className="muted small">{t(row.hint)}</p>
                </div>
                <Switch on={Boolean(prefs[row.key])} onChange={(on) => setPrefs({ [row.key]: on })} labelledBy={`pref-${row.key}`} />
              </div>
            ))}
          </section>

          <section id="settings-appearance" className="panel glass reveal">
            <header className="panel-head">
              <div>
                <h2>{t('settings.appearance')}</h2>
                <p className="muted small">{t('settings.appearanceHint')}</p>
              </div>
            </header>
            <div className="setting-row">
              <SectionIcon tone="#8b5cf6">
                <Moon size={14} />
              </SectionIcon>
              <div className="setting-text">
                <strong>{t('settings.theme')}</strong>
              </div>
              <div className="segmented">
                <button className={look.theme === 'light' ? 'on' : ''} onClick={() => look.setTheme('light')} aria-pressed={look.theme === 'light'}>
                  <Sun size={14} /> {t('settings.light')}
                </button>
                <button className={look.theme === 'dark' ? 'on' : ''} onClick={() => look.setTheme('dark')} aria-pressed={look.theme === 'dark'}>
                  <Moon size={14} /> {t('settings.dark')}
                </button>
              </div>
            </div>
            <div className="setting-block">
              <strong>{t('settings.wallpaper')}</strong>
              <p className="muted small">{t(`wallpaper.${look.wallpaper}`)}</p>
              <div className="wallpaper-grid" role="radiogroup" aria-label={t('settings.wallpaper')}>
                {WALLPAPERS.map((w) => (
                  <button
                    key={w}
                    role="radio"
                    aria-checked={look.wallpaper === w}
                    className={`wp-option${look.wallpaper === w ? ' on' : ''}`}
                    onClick={() => look.setWallpaper(w)}
                  >
                    <span className="wp-thumb" data-wallpaper={w} aria-hidden="true">
                      <i className="wp-thumb-ribbon" />
                      <i className="wp-thumb-bubble" />
                      <i className="wp-thumb-card" />
                      {look.wallpaper === w && (
                        <span className="wp-check">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span>{t(`wallpaper.${w}`)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-block">
              <strong>{t('settings.color')}</strong>
              <div className="accent-row" role="radiogroup" aria-label={t('settings.color')}>
                {PALETTES.map((p) => (
                  <button
                    key={p}
                    role="radio"
                    aria-checked={look.palette === p}
                    aria-label={t(`palette.${p}`)}
                    title={t(`palette.${p}`)}
                    className={`accent-dot${look.palette === p ? ' on' : ''}`}
                    style={{ background: PALETTE_SWATCH[p] }}
                    onClick={() => look.setPalette(p)}
                  >
                    {look.palette === p && <Check size={14} strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-text">
                <strong>{t('settings.glass')}</strong>
                <p className="muted small">{t('settings.glassHint')}</p>
              </div>
              <div className="segmented">
                <button className={look.glass === 'clear' ? 'on' : ''} onClick={() => look.setGlass('clear')} aria-pressed={look.glass === 'clear'}>
                  {t('settings.glassClear')}
                </button>
                <button className={look.glass === 'tinted' ? 'on' : ''} onClick={() => look.setGlass('tinted')} aria-pressed={look.glass === 'tinted'}>
                  {t('settings.glassTinted')}
                </button>
              </div>
            </div>
            <div className="setting-row">
              <div className="setting-text">
                <strong id="solid-label">{t('settings.solid')}</strong>
                <p className="muted small">{t('settings.solidHint')}</p>
              </div>
              <Switch on={look.solid} onChange={look.setSolid} labelledBy="solid-label" />
            </div>
          </section>

          <section id="settings-focus" className="panel glass reveal">
            <header className="panel-head">
              <div>
                <h2>{t('settings.focus')}</h2>
                <p className="muted small">{t('settings.focusHint')}</p>
              </div>
            </header>
            <div className="stepper-row">
              {(
                [
                  ['focusMinutes', 'settings.session', 5, 120, 5],
                  ['breakMinutes', 'settings.break', 1, 30, 1],
                ] as const
              ).map(([key, label, min, max, step]) => (
                <div key={key} className="stepper">
                  <span className="muted small">{t(label)}</span>
                  <div className="stepper-body">
                    <button
                      className="icon-btn"
                      onClick={() => setPrefs({ [key]: Math.max(min, prefs[key] - step) })}
                      aria-label={`${t(label)} −${step}`}
                      disabled={prefs[key] <= min}
                    >
                      <Minus size={16} />
                    </button>
                    <strong className="mono">
                      {prefs[key]}
                      <small>{t('focus.min')}</small>
                    </strong>
                    <button
                      className="icon-btn"
                      onClick={() => setPrefs({ [key]: Math.min(max, prefs[key] + step) })}
                      aria-label={`${t(label)} +${step}`}
                      disabled={prefs[key] >= max}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="setting-row">
              <SectionIcon tone="#f97316">
                <Play size={14} />
              </SectionIcon>
              <div className="setting-text">
                <strong>{t('settings.startNow')}</strong>
                <p className="muted small">{t('settings.startNowHint', { session: prefs.focusMinutes, break: prefs.breakMinutes })}</p>
              </div>
              <button className="btn btn-sm btn-accent" onClick={() => startFocus(prefs.focusMinutes)} disabled={Boolean(focus)}>
                <Play size={14} /> {t('focus.start')}
              </button>
            </div>
          </section>

          <section id="settings-language" className="panel glass reveal">
            <header className="panel-head">
              <h2>{t('settings.language')}</h2>
            </header>
            <div className="segmented segmented-block" role="radiogroup" aria-label={t('settings.language')}>
              {LANGS.map((l) => (
                <button key={l.id} role="radio" aria-checked={lang === l.id} className={lang === l.id ? 'on' : ''} onClick={() => setLang(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          </section>

          <section id="settings-data" className="panel glass reveal">
            <header className="panel-head">
              <div>
                <h2>{t('settings.data')}</h2>
                <p className="muted small">{t('settings.dataHint')}</p>
              </div>
            </header>
            <button className="setting-row setting-action" onClick={() => exportTasksCsv(tasks, projects, members, workspace.name)}>
              <SectionIcon tone="#14b8a6">
                <Download size={14} />
              </SectionIcon>
              <div className="setting-text">
                <strong>{t('insights.export')}</strong>
                <p className="muted small">{t('settings.exportHint', { n: tasks.length })}</p>
              </div>
            </button>
          </section>

          {isAdmin && (
            <div id="settings-workspace">
              <WorkspaceSettingsPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { Check, LogOut, Moon, Sun } from 'lucide-react';
import { ROLE_RANK } from '../api';
import { PALETTES, WALLPAPERS, useAppearanceContext, useWorkspace } from '../hooks';
import { LANGS, useI18n } from '../i18n';
import { PALETTE_SWATCH } from './SettingsMenu';
import { WorkspaceSettingsPanel } from './TeamPage';
import { Avatar } from './ui';

export function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { me, workspace } = useWorkspace();
  const look = useAppearanceContext();

  return (
    <div className="page-scroll settings-page">
      <header className="page-head reveal">
        <div className="page-title">
          <h1>{t('nav.settings')}</h1>
          <p className="page-sub">{t('settings.subtitle')}</p>
        </div>
      </header>

      <section className="panel glass reveal">
        <header className="panel-head">
          <div>
            <h2>{t('settings.appearance')}</h2>
            <p className="muted small">{t('settings.appearanceHint')}</p>
          </div>
        </header>

        <div className="setting-row">
          <div>
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
          <div>
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
          <div>
            <strong id="solid-label">{t('settings.solid')}</strong>
            <p className="muted small">{t('settings.solidHint')}</p>
          </div>
          <button
            role="switch"
            aria-checked={look.solid}
            aria-labelledby="solid-label"
            className={`switch${look.solid ? ' on' : ''}`}
            onClick={() => look.setSolid(!look.solid)}
          >
            <span />
          </button>
        </div>
      </section>

      <section className="panel glass reveal">
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

      <section className="panel glass reveal">
        <header className="panel-head">
          <h2>{t('settings.profile')}</h2>
        </header>
        <div className="profile-row">
          <Avatar user={me} size={44} />
          <div className="person-text">
            <strong>{me.name}</strong>
            <span className="muted small">
              {me.email} · {t(`role.${workspace.role}`)}
            </span>
          </div>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost-glass" onClick={onLogout}>
            <LogOut size={15} /> {t('nav.signOut')}
          </button>
        </div>
      </section>

      {ROLE_RANK[workspace.role] >= ROLE_RANK.admin && <WorkspaceSettingsPanel />}
    </div>
  );
}

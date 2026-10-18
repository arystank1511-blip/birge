import { useEffect, useRef, useState } from 'react';
import { Check, Moon, Settings2, Sun } from 'lucide-react';
import { PALETTES, useAppearanceContext, type Palette } from '../hooks';
import { LANGS, useI18n } from '../i18n';

export const PALETTE_SWATCH: Record<Palette, string> = {
  cobalt: '#3b5bfd',
  lime: '#b6ea4a',
  indigo: '#8b7cff',
  ocean: '#2dd4bf',
  sunset: '#ff8a5b',
  rose: '#ff7eb6',
};

/** Language, light/dark and accent palette. Used in the sidebar and on the sign-in screen. */
export function SettingsMenu({ placement = 'up' }: { placement?: 'up' | 'down' }) {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme, palette, setPalette } = useAppearanceContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="settings" ref={ref}>
      <button
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('settings.title')}
        aria-expanded={open}
        title={t('settings.title')}
      >
        <Settings2 size={17} />
      </button>
      {open && (
        <div className={`popover glass settings-pop settings-${placement}`} role="dialog" aria-label={t('settings.title')}>
          <p className="pop-label">{t('settings.language')}</p>
          <div className="segmented segmented-block">
            {LANGS.map((l) => (
              <button key={l.id} className={lang === l.id ? 'on' : ''} onClick={() => setLang(l.id)} aria-pressed={lang === l.id}>
                {l.label}
              </button>
            ))}
          </div>

          <p className="pop-label">{t('settings.theme')}</p>
          <div className="segmented segmented-block">
            <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')} aria-pressed={theme === 'light'}>
              <Sun size={14} /> {t('settings.light')}
            </button>
            <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'}>
              <Moon size={14} /> {t('settings.dark')}
            </button>
          </div>

          <p className="pop-label">{t('settings.color')}</p>
          <div className="palette-grid" role="radiogroup" aria-label={t('settings.color')}>
            {PALETTES.map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={palette === p}
                className={`palette-option${palette === p ? ' on' : ''}`}
                onClick={() => setPalette(p)}
              >
                <span className="palette-dot" style={{ background: PALETTE_SWATCH[p] }}>
                  {palette === p && <Check size={12} strokeWidth={3} />}
                </span>
                {t(`palette.${p}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

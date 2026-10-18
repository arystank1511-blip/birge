import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Sparkles } from 'lucide-react';
import { api, errorMessage, type User } from '../api';
import { useI18n } from '../i18n';
import { SettingsMenu } from './SettingsMenu';
import { Logo } from './ui';

export function AuthScreen({ banner }: { banner?: ReactNode }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>(banner ? 'register' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (promise: Promise<User>) => {
    setBusy(true);
    setError(null);
    try {
      qc.setQueryData(['me'], await promise);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    finish(mode === 'login' ? api.login(email, password) : api.register(name, email, password));
  };

  return (
    <main className="auth">
      <div className="auth-settings">
        <SettingsMenu placement="down" />
      </div>
      <section className="auth-card glass">
        <Logo />
        {banner}
        <h1>{mode === 'login' ? t('auth.welcomeBack') : t('auth.createTitle')}</h1>
        {!banner && <p className="muted">{t('app.tagline')}</p>}

        {!banner && (
          <>
            <button type="button" className="btn btn-accent btn-block" onClick={() => finish(api.demo())} disabled={busy}>
              <Sparkles size={16} /> {t('auth.demo')}
            </button>
            <div className="divider">
              <span>{t('auth.orEmail')}</span>
            </div>
          </>
        )}

        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <label className="field">
              <span>{t('auth.name')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" />
            </label>
          )}
          <label className="field">
            <span>{t('auth.email')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="name@company.com"
            />
          </label>
          <label className="field">
            <span>{t('auth.password')}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : 1}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {mode === 'login' ? t('auth.signIn') : t('auth.createAccount')} <ArrowRight size={16} />
          </button>
        </form>

        <p className="auth-switch muted">
          {mode === 'login' ? t('auth.newHere') : t('auth.haveAccount')}{' '}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
          </button>
        </p>
      </section>
    </main>
  );
}

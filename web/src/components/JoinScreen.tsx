import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinkIcon, Users } from 'lucide-react';
import { api, errorMessage, type User } from '../api';
import { useI18n } from '../i18n';
import { toast } from '../toast';
import { AuthScreen } from './AuthScreen';
import { Logo } from './ui';

interface Props {
  token: string;
  me: User | null;
  onDone: (workspaceId?: number) => void;
}

/** Landing page for /join/:token. Shows who invited you, asks you to sign in if needed, then joins. */
export function JoinScreen({ token, me, onDone }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const preview = useQuery({ queryKey: ['invite', token], queryFn: () => api.invitePreview(token), retry: false });

  const accept = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: ({ workspace }) => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      toast(t('join.joined', { workspace: workspace.name }));
      onDone(workspace.id);
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  if (preview.isPending) {
    return (
      <div className="splash">
        <Logo />
      </div>
    );
  }

  if (preview.isError) {
    return (
      <main className="auth">
        <section className="auth-card glass">
          <Logo />
          <div className="join-icon join-icon-muted">
            <LinkIcon size={22} />
          </div>
          <h1>{t('join.invalid')}</h1>
          <p className="muted">{t('join.askNew')}</p>
          <button className="btn btn-primary btn-block" onClick={() => onDone()}>
            {t('join.goToApp')}
          </button>
        </section>
      </main>
    );
  }

  const invite = preview.data;
  const banner = (
    <div className="invite-banner">
      <div className="join-icon">
        <Users size={22} />
      </div>
      <div>
        <strong>{t('join.title', { workspace: invite.workspace.name })}</strong>
        <p className="muted small">
          {invite.invitedBy && `${t('join.by', { name: invite.invitedBy, role: t(`role.${invite.role}`).toLowerCase() })} `}
          {t('ws.memberCount', { n: invite.workspace.memberCount })}
        </p>
      </div>
    </div>
  );

  if (!me) {
    return <AuthScreen banner={banner} />;
  }

  return (
    <main className="auth">
      <section className="auth-card glass">
        <Logo />
        {banner}
        <button className="btn btn-accent btn-block" onClick={() => accept.mutate()} disabled={accept.isPending}>
          {t('join.accept')}
        </button>
        <button className="btn btn-ghost btn-block" onClick={() => onDone()}>
          {t('join.decline')}
        </button>
      </section>
    </main>
  );
}

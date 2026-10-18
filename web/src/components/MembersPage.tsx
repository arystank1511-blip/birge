import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, LogOut, Trash2, X } from 'lucide-react';
import { ROLE_RANK, type Invite, type Member, type Role } from '../api';
import { formatDate } from '../dates';
import { useWorkspace } from '../hooks';
import { useI18n } from '../i18n';
import { toast, toastError } from '../toast';
import { Avatar, Select } from './ui';

const EXPIRY_OPTIONS = [1, 7, 30];

export function MembersPage({ online }: { online: number[] }) {
  const { t } = useI18n();
  const { workspace, api: wsApi, me, members } = useWorkspace();
  const qc = useQueryClient();
  const myRank = ROLE_RANK[workspace.role];
  const isAdmin = myRank >= ROLE_RANK.admin;
  const isOwner = workspace.role === 'owner';

  const refreshMembers = () => {
    qc.invalidateQueries({ queryKey: ['members', workspace.id] });
    qc.invalidateQueries({ queryKey: ['workspaces'] });
  };

  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: Role }) => wsApi.setRole(userId, role),
    onSuccess: refreshMembers,
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: (userId: number) => wsApi.removeMember(userId),
    onSuccess: (_data, userId) => {
      if (userId === me.id) {
        qc.invalidateQueries({ queryKey: ['workspaces'] });
      } else {
        refreshMembers();
        qc.invalidateQueries({ queryKey: ['tasks'] });
      }
    },
    onError: toastError,
  });

  const canRemove = (m: Member) => m.id !== me.id && (isOwner || myRank > ROLE_RANK[m.role]);

  return (
    <div className="page-scroll">
      <section className="panel glass">
        <header className="panel-head">
          <div>
            <h2>{t('members.title')}</h2>
            <p className="muted small">{t('members.subtitle')}</p>
          </div>
          <span className="count mono">{members.length}</span>
        </header>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id} className="member-row">
              <span className="avatar-wrap">
                <Avatar user={m} size={36} />
                {online.includes(m.id) && <span className="online-dot" title={t('head.online')} />}
              </span>
              <div className="member-text">
                <strong className="truncate">
                  {m.name} {m.id === me.id && <span className="muted">{t('task.you')}</span>}
                </strong>
                <span className="muted small truncate">
                  {m.email} · {t('members.joined', { date: formatDate(m.joinedAt) })}
                </span>
              </div>
              {isOwner && m.id !== me.id ? (
                <Select
                  value={m.role}
                  onChange={(e) => setRole.mutate({ userId: m.id, role: e.target.value as Role })}
                  aria-label={t('members.changeRole', { name: m.name })}
                >
                  {(['owner', 'admin', 'member'] as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {t(`role.${r}`)}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className={`role-badge role-${m.role}`}>{t(`role.${m.role}`)}</span>
              )}
              {canRemove(m) ? (
                <button
                  className="icon-btn danger"
                  aria-label={`${t('members.remove')}: ${m.name}`}
                  title={t('members.remove')}
                  onClick={() => {
                    if (confirm(t('members.confirmRemove', { name: m.name, workspace: workspace.name }))) remove.mutate(m.id);
                  }}
                >
                  <X size={17} />
                </button>
              ) : m.id === me.id ? (
                <button
                  className="icon-btn danger"
                  aria-label={t('members.leave')}
                  title={t('members.leave')}
                  onClick={() => {
                    if (confirm(t('members.confirmLeave', { workspace: workspace.name }))) remove.mutate(m.id);
                  }}
                >
                  <LogOut size={17} />
                </button>
              ) : (
                <span className="icon-btn-placeholder" />
              )}
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && <InvitesPanel />}
      {isAdmin && <SettingsPanel />}
    </div>
  );
}

function InvitesPanel() {
  const { t } = useI18n();
  const { workspace, api: wsApi } = useWorkspace();
  const qc = useQueryClient();
  const [role, setRole] = useState<Role>('member');
  const [days, setDays] = useState(7);
  const [created, setCreated] = useState<Invite | null>(null);
  const invites = useQuery({ queryKey: ['invites', workspace.id], queryFn: wsApi.invites });

  const create = useMutation({
    mutationFn: () => wsApi.createInvite(role, days),
    onSuccess: (invite) => {
      setCreated(invite);
      qc.invalidateQueries({ queryKey: ['invites', workspace.id] });
    },
    onError: toastError,
  });
  const revoke = useMutation({
    mutationFn: wsApi.revokeInvite,
    onSuccess: (_data, id) => {
      if (created?.id === id) setCreated(null);
      qc.invalidateQueries({ queryKey: ['invites', workspace.id] });
    },
    onError: toastError,
  });

  const link = created?.token ? `${location.origin}/join/${created.token}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast(t('members.copied'));
    } catch {
      // Clipboard blocked: the field is selectable, so the link can still be copied by hand.
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <section className="panel glass">
      <header className="panel-head">
        <div>
          <h2>{t('members.inviteTitle')}</h2>
          <p className="muted small">{t('members.inviteHint')}</p>
        </div>
      </header>
      <form className="invite-form" onSubmit={submit}>
        <label className="field">
          <span>{t('members.inviteRole')}</span>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="member">{t('role.member')}</option>
            {workspace.role === 'owner' && <option value="admin">{t('role.admin')}</option>}
          </Select>
        </label>
        <label className="field">
          <span>{t('members.inviteExpires')}</span>
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {EXPIRY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {t('members.days', { n: d })}
              </option>
            ))}
          </Select>
        </label>
        <button className="btn btn-accent" disabled={create.isPending}>
          <Link2 size={16} /> {t('members.createLink')}
        </button>
      </form>

      {link && (
        <div className="invite-link">
          <input className="input mono" value={link} readOnly onFocus={(e) => e.target.select()} aria-label="Invite link" />
          <button className="btn btn-primary" onClick={copy}>
            <Copy size={15} /> {t('members.copy')}
          </button>
        </div>
      )}

      <h3 className="sub-heading">{t('members.activeLinks')}</h3>
      {invites.data?.length ? (
        <ul className="invite-list">
          {invites.data.map((i) => (
            <li key={i.id}>
              <span className={`role-badge role-${i.role}`}>{t(`role.${i.role}`)}</span>
              <span className="muted small invite-meta">
                {i.createdBy && `${t('members.by', { name: i.createdBy })} · `}
                {t('members.until', { date: formatDate(i.expiresAt) })} · {t('members.used', { n: i.uses })}
              </span>
              <button className="link link-muted" onClick={() => revoke.mutate(i.id)}>
                {t('members.revoke')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{t('members.noLinks')}</p>
      )}
    </section>
  );
}

function SettingsPanel() {
  const { t } = useI18n();
  const { workspace, api: wsApi } = useWorkspace();
  const qc = useQueryClient();
  const [name, setName] = useState(workspace.name);

  const rename = useMutation({
    mutationFn: () => wsApi.rename(name.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      toast(t('members.saved'));
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: wsApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
    onError: toastError,
  });

  return (
    <section className="panel glass">
      <header className="panel-head">
        <h2>{t('members.settings')}</h2>
      </header>
      <form
        className="invite-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== workspace.name) rename.mutate();
        }}
      >
        <label className="field field-grow">
          <span>{t('members.rename')}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </label>
        <button className="btn btn-primary" disabled={!name.trim() || name.trim() === workspace.name || rename.isPending}>
          {t('members.save')}
        </button>
      </form>
      {workspace.role === 'owner' && (
        <div className="danger-zone">
          <div>
            <strong>{t('members.deleteWs')}</strong>
            <p className="muted small">{t('members.deleteWsHint')}</p>
          </div>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm(t('members.confirmDeleteWs', { workspace: workspace.name }))) remove.mutate();
            }}
          >
            <Trash2 size={15} /> {t('members.deleteWs')}
          </button>
        </div>
      )}
    </section>
  );
}

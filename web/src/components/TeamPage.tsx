import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Clock, Copy, Link2, LogOut, Trash2, UserPlus, X } from 'lucide-react';
import { ROLE_RANK, type Invite, type Member, type Role } from '../api';
import { formatDate, todayISO } from '../dates';
import { useAllTasks, useWorkspace } from '../hooks';
import { useI18n } from '../i18n';
import { completedBetween, isOpen, lastDays, workload } from '../metrics';
import { toast, toastError } from '../toast';
import { presenceOf } from './FocusUi';
import { localTime } from './MemberPanel';
import { Avatar, Select } from './ui';

const EXPIRY_OPTIONS = [1, 7, 30];
type RoleFilter = 'all' | Role;

export function TeamPage() {
  const { t } = useI18n();
  const { workspace, api, me, members, online, navigate, openMember } = useWorkspace();
  const { data: tasks = [] } = useAllTasks();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<RoleFilter>('all');
  const [inviting, setInviting] = useState(false);
  const myRank = ROLE_RANK[workspace.role];
  const isAdmin = myRank >= ROLE_RANK.admin;
  const isOwner = workspace.role === 'owner';

  const refreshMembers = () => {
    qc.invalidateQueries({ queryKey: ['members', workspace.id] });
    qc.invalidateQueries({ queryKey: ['workspaces'] });
  };
  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: Role }) => api.setRole(userId, role),
    onSuccess: refreshMembers,
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: (userId: number) => api.removeMember(userId),
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
  const week = lastDays(7, todayISO());
  const doneThisWeek = completedBetween(tasks, week[0], week[6]);
  const loads = new Map(members.map((m) => [m.id, workload(tasks.filter((task) => task.assigneeId === m.id))]));
  const maxLoad = Math.max(1, ...loads.values());
  const shown = members.filter((m) => filter === 'all' || m.role === filter);
  const onlineCount = members.filter((m) => online.includes(m.id)).length;
  const openPerPerson = members.length
    ? tasks.filter((task) => isOpen(task) && task.assigneeId).length / members.length
    : 0;

  return (
    <div className="page-scroll">
      <header className="page-head reveal">
        <div className="page-title">
          <h1>{t('nav.team')}</h1>
          <p className="page-sub">{t('team.subtitle', { n: members.length, workspace: workspace.name })}</p>
        </div>
        <span className="spacer" />
        <div className="segmented" role="tablist" aria-label={t('members.inviteRole')}>
          {(['all', 'owner', 'admin', 'member'] as RoleFilter[]).map((r) => (
            <button key={r} role="tab" aria-selected={filter === r} className={filter === r ? 'on' : ''} onClick={() => setFilter(r)}>
              {r === 'all' ? t('team.all') : t(`role.${r}`)}
            </button>
          ))}
        </div>
        {isAdmin && (
          <button className="btn btn-accent" onClick={() => setInviting((v) => !v)} aria-expanded={inviting}>
            <UserPlus size={16} /> <span className="hide-sm">{t('team.invite')}</span>
          </button>
        )}
      </header>

      <section className="chips-row reveal">
        <div className="mini-stat glass">
          <span>{t('head.online')}</span>
          <strong className="mono">
            {onlineCount}
            <small>/{members.length}</small>
          </strong>
        </div>
        <div className="mini-stat glass">
          <span>{t('team.doneWeek')}</span>
          <strong className="mono">{doneThisWeek.length}</strong>
        </div>
        <div className="mini-stat glass">
          <span>{t('team.openPerPerson')}</span>
          <strong className="mono">{openPerPerson.toFixed(1)}</strong>
        </div>
      </section>

      {isAdmin && inviting && <InvitesPanel />}

      <section className="team-grid">
        {shown.map((m) => {
          const theirs = tasks.filter((task) => task.assigneeId === m.id);
          const open = theirs.filter(isOpen).length;
          const done = doneThisWeek.filter((task) => task.assigneeId === m.id).length;
          const load = loads.get(m.id) ?? 0;
          const isOnline = online.includes(m.id);
          const presence = presenceOf(m, online);
          const zone = localTime(m.timezone);
          return (
            <article key={m.id} className="person glass reveal">
              <header className="person-head">
                <span className="avatar-wrap">
                  <Avatar user={m} size={42} />
                  {isOnline && <span className={`presence-dot presence-${presence}`} title={t('head.online')} />}
                </span>
                <div className="person-text person-open" role="button" tabIndex={0} onClick={() => openMember(m.id)} onKeyDown={(e) => { if (e.key === 'Enter') openMember(m.id); }}>
                  <strong className="truncate">
                    {m.name} {m.id === me.id && <span className="muted">{t('task.you')}</span>}
                  </strong>
                  <span className="muted small truncate">{m.email}</span>
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
              </header>

              <div className="person-status small">
                <span>
                  <span className={`status-dot status-${presence}`} />
                  {presence === 'focus'
                    ? t('now.focusUntil', { time: new Date(m.focusUntil!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
                    : presence === 'online'
                      ? t('team.onlineNow')
                      : t('now.offline')}
                </span>
                {zone && (
                  <span className="person-time" title={m.timezone ?? ''}>
                    <Clock size={13} /> <strong className="mono">{zone.time}</strong> {zone.city}
                    <em>
                      {m.id === me.id
                        ? t('member.yourTime')
                        : zone.diffHours === 0
                          ? t('member.sameTime')
                          : t(zone.diffHours > 0 ? 'member.ahead' : 'member.behind', { n: Math.abs(zone.diffHours) })}
                    </em>
                  </span>
                )}
              </div>

              <div className="person-load">
                <div className="person-load-head">
                  <span>{t('team.workload')}</span>
                  <span className="mono">{t('insights.openDone', { open, done })}</span>
                </div>
                <div className="load-bar" aria-hidden="true">
                  <span style={{ width: `${(load / maxLoad) * 100}%` }} />
                </div>
              </div>

              <footer className="person-foot">
                <button className="btn btn-sm btn-ghost-glass" onClick={() => openMember(m.id)}>
                  {t('member.profile')}
                </button>
                <button className="btn btn-sm btn-ghost-glass" onClick={() => navigate({ page: 'tasks', assignee: m.id })}>
                  {t('team.tasks')} <ArrowUpRight size={14} />
                </button>
                <span className="spacer" />
                {canRemove(m) && (
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
                )}
                {m.id === me.id && (
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
                )}
              </footer>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function InvitesPanel() {
  const { t } = useI18n();
  const { workspace, api } = useWorkspace();
  const qc = useQueryClient();
  const [role, setRole] = useState<Role>('member');
  const [days, setDays] = useState(7);
  const [created, setCreated] = useState<Invite | null>(null);
  const invites = useQuery({ queryKey: ['invites', workspace.id], queryFn: api.invites });

  const create = useMutation({
    mutationFn: () => api.createInvite(role, days),
    onSuccess: (invite) => {
      setCreated(invite);
      qc.invalidateQueries({ queryKey: ['invites', workspace.id] });
    },
    onError: toastError,
  });
  const revoke = useMutation({
    mutationFn: api.revokeInvite,
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
    <section className="panel glass reveal">
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
          <input
            className="input mono"
            value={link}
            readOnly
            onFocus={(e) => e.target.select()}
            aria-label={t('members.inviteTitle')}
          />
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

/** Rename or delete the workspace. Lives on the Settings page. */
export function WorkspaceSettingsPanel() {
  const { t } = useI18n();
  const { workspace, api } = useWorkspace();
  const qc = useQueryClient();
  const [name, setName] = useState(workspace.name);

  const rename = useMutation({
    mutationFn: () => api.rename(name.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      toast(t('members.saved'));
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: api.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspaces'] }),
    onError: toastError,
  });

  return (
    <section className="panel glass reveal">
      <header className="panel-head">
        <div>
          <h2>{t('members.settings')}</h2>
          <p className="muted small">{workspace.name}</p>
        </div>
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

import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { PRIORITIES, STATUSES, type Priority, type Project, type Status } from '../api';
import { useEscape, useInvalidateTasks, useWorkspace } from '../hooks';
import { useI18n } from '../i18n';
import { toast, toastError } from '../toast';
import { Select } from './ui';

interface Props {
  initialStatus: Status;
  defaultProjectId?: number;
  projects: Project[];
  onClose: () => void;
}

export function NewTaskModal({ initialStatus, defaultProjectId, projects, onClose }: Props) {
  const { t } = useI18n();
  const { api: wsApi, me, members } = useWorkspace();
  const invalidate = useInvalidateTasks();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState<number | ''>(me.id);
  useEscape(onClose);

  const create = useMutation({
    mutationFn: wsApi.createTask,
    onSuccess: (task) => {
      invalidate();
      toast(t('new.created', { title: task.title }));
      onClose();
    },
    onError: toastError,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    create.mutate({
      title: title.trim(),
      projectId,
      status,
      priority,
      dueDate: dueDate || null,
      assigneeId: assigneeId === '' ? null : assigneeId,
    });
  };

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="modal glass" role="dialog" aria-modal="true" aria-labelledby="new-task-title">
        <header className="modal-head">
          <h2 id="new-task-title">{t('new.title')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('task.close')}>
            <X size={18} />
          </button>
        </header>
        {projects.length === 0 ? (
          <p className="muted">{t('new.needProject')}</p>
        ) : (
          <form onSubmit={submit} className="modal-form">
            <input
              className="input input-lg"
              placeholder={t('new.placeholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
              required
              aria-label={t('task.title')}
            />
            <div className="modal-grid">
              <label className="field">
                <span>{t('task.project')}</span>
                <Select value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field">
                <span>{t('task.status')}</span>
                <Select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field">
                <span>{t('task.priority')}</span>
                <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {t(`priority.${p}`)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field">
                <span>{t('task.assignee')}</span>
                <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">{t('board.unassigned')}</option>
                  {members.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field">
                <span>{t('task.dueDate')}</span>
                <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
            </div>
            <footer className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {t('new.cancel')}
              </button>
              <button className="btn btn-primary" disabled={!title.trim() || create.isPending}>
                {t('new.create')}
              </button>
            </footer>
          </form>
        )}
      </div>
    </>
  );
}

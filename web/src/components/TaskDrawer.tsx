import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, Flag, FolderKanban, Send, Trash2, UserRound, X } from 'lucide-react';
import { PRIORITIES, STATUSES, type Project, type Status, type TaskInput } from '../api';
import { timeAgo } from '../dates';
import { useEscape, useInvalidateTasks, useWorkspace } from '../hooks';
import { useI18n } from '../i18n';
import { toast, toastError } from '../toast';
import { Avatar, Select, STATUS_COLOR } from './ui';

interface Props {
  taskId: number;
  projects: Project[];
  onClose: () => void;
}

export function TaskDrawer({ taskId, projects, onClose }: Props) {
  const { t } = useI18n();
  const { workspace, api: wsApi, me, members } = useWorkspace();
  const invalidate = useInvalidateTasks();
  const { data: task, isPending, isError } = useQuery({
    queryKey: ['task', workspace.id, taskId],
    queryFn: () => wsApi.task(taskId),
  });
  useEscape(onClose);

  const onSuccess = () => invalidate();
  const update = useMutation({ mutationFn: (patch: TaskInput) => wsApi.updateTask(taskId, patch), onSuccess, onError: toastError });
  const remove = useMutation({
    mutationFn: () => wsApi.deleteTask(taskId),
    onSuccess: () => {
      invalidate();
      toast(t('task.deleted'));
      onClose();
    },
    onError: toastError,
  });
  const addSubtask = useMutation({ mutationFn: (title: string) => wsApi.addSubtask(taskId, title), onSuccess, onError: toastError });
  const toggleSubtask = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) => wsApi.updateSubtask(id, { done }),
    onSuccess,
    onError: toastError,
  });
  const deleteSubtask = useMutation({ mutationFn: wsApi.deleteSubtask, onSuccess, onError: toastError });
  const addComment = useMutation({ mutationFn: (body: string) => wsApi.addComment(taskId, body), onSuccess, onError: toastError });
  const deleteComment = useMutation({ mutationFn: wsApi.deleteComment, onSuccess, onError: toastError });

  const [newSubtask, setNewSubtask] = useState('');
  const [comment, setComment] = useState('');

  const save = (patch: TaskInput) => update.mutate(patch);

  const submitSubtask = (e: FormEvent) => {
    e.preventDefault();
    const title = newSubtask.trim();
    if (!title) return;
    addSubtask.mutate(title, { onSuccess: () => setNewSubtask('') });
  };

  const submitComment = (e?: FormEvent) => {
    e?.preventDefault();
    const body = comment.trim();
    if (!body) return;
    addComment.mutate(body, { onSuccess: () => setComment('') });
  };

  const assignee = task?.assigneeId ? members.find((u) => u.id === task.assigneeId) : null;

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="drawer glass" role="dialog" aria-modal="true" aria-label={t('task.details')}>
        {isPending && <div className="drawer-loading">{t('task.loading')}</div>}
        {isError && (
          <div className="drawer-loading">
            {t('task.gone')}{' '}
            <button className="link" onClick={onClose}>
              {t('task.close')}
            </button>
          </div>
        )}
        {task && (
          <>
            <header className="drawer-head">
              <Select
                className="status-select"
                style={{ ['--col' as string]: STATUS_COLOR[task.status] }}
                value={task.status}
                onChange={(e) => save({ status: e.target.value as Status })}
                aria-label={t('task.status')}
                icon={<i className="status-dot" />}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </Select>
              <span className="spacer" />
              <button
                className="icon-btn danger"
                aria-label={t('task.deleteTask')}
                title={t('task.deleteTask')}
                onClick={() => {
                  if (confirm(t('task.confirmDelete', { title: task.title }))) remove.mutate();
                }}
              >
                <Trash2 size={17} />
              </button>
              <button className="icon-btn" aria-label={t('task.close')} onClick={onClose}>
                <X size={18} />
              </button>
            </header>

            <div className="drawer-body" key={task.id}>
              <textarea
                className="drawer-title"
                defaultValue={task.title}
                rows={1}
                maxLength={200}
                aria-label={t('task.title')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => {
                  const title = e.target.value.trim();
                  if (title && title !== task.title) save({ title });
                  else e.target.value = task.title;
                }}
              />

              <dl className="props">
                <dt>
                  <FolderKanban size={15} /> {t('task.project')}
                </dt>
                <dd>
                  <Select
                    value={task.projectId}
                    onChange={(e) => save({ projectId: Number(e.target.value) })}
                    aria-label={t('task.project')}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </dd>
                <dt>
                  <Flag size={15} /> {t('task.priority')}
                </dt>
                <dd>
                  <Select
                    value={task.priority}
                    onChange={(e) => save({ priority: e.target.value as TaskInput['priority'] })}
                    aria-label={t('task.priority')}
                    icon={<span className={`prio-dot prio-dot-${task.priority}`} />}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {t(`priority.${p}`)}
                      </option>
                    ))}
                  </Select>
                </dd>
                <dt>
                  <UserRound size={15} /> {t('task.assignee')}
                </dt>
                <dd>
                  <Select
                    value={task.assigneeId ?? ''}
                    onChange={(e) => save({ assigneeId: e.target.value ? Number(e.target.value) : null })}
                    aria-label={t('task.assignee')}
                    icon={<Avatar user={assignee} size={18} />}
                  >
                    <option value="">{t('board.unassigned')}</option>
                    {members.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.id === me.id ? ` ${t('task.you')}` : ''}
                      </option>
                    ))}
                  </Select>
                </dd>
                <dt>
                  <CalendarDays size={15} /> {t('task.dueDate')}
                </dt>
                <dd>
                  <input
                    type="date"
                    className="input-plain"
                    value={task.dueDate ?? ''}
                    onChange={(e) => save({ dueDate: e.target.value || null })}
                    aria-label={t('task.dueDate')}
                  />
                </dd>
              </dl>

              <section className="drawer-section">
                <h3>{t('task.description')}</h3>
                <textarea
                  className="textarea"
                  defaultValue={task.description}
                  placeholder={t('task.descPlaceholder')}
                  rows={4}
                  maxLength={5000}
                  onBlur={(e) => {
                    if (e.target.value !== task.description) save({ description: e.target.value });
                  }}
                />
              </section>

              <section className="drawer-section">
                <h3>
                  {t('task.subtasks')}
                  {task.subtaskList.length > 0 && (
                    <span className="count mono">
                      {task.subtasks.done}/{task.subtasks.total}
                    </span>
                  )}
                </h3>
                <ul className="subtasks">
                  {task.subtaskList.map((s) => (
                    <li key={s.id} className={s.done ? 'is-done' : ''}>
                      <label>
                        <input
                          type="checkbox"
                          checked={s.done}
                          onChange={(e) => toggleSubtask.mutate({ id: s.id, done: e.target.checked })}
                        />
                        <span>{s.title}</span>
                      </label>
                      <button
                        className="icon-btn icon-btn-sm"
                        aria-label={t('task.deleteSubtask', { title: s.title })}
                        onClick={() => deleteSubtask.mutate(s.id)}
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                <form onSubmit={submitSubtask} className="inline-form">
                  <input
                    className="input"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    placeholder={t('task.addSubtask')}
                    aria-label={t('task.addSubtask')}
                    maxLength={200}
                  />
                </form>
              </section>

              <section className="drawer-section">
                <h3>
                  {t('task.comments')}
                  {task.comments.length > 0 && <span className="count mono">{task.comments.length}</span>}
                </h3>
                <ul className="comments">
                  {task.comments.map((c) => (
                    <li key={c.id}>
                      <Avatar user={c.author} size={28} />
                      <div>
                        <p className="comment-head">
                          <strong>{c.author?.name ?? t('task.deletedUser')}</strong>
                          <span className="muted">{timeAgo(c.createdAt)}</span>
                          {c.author?.id === me.id && (
                            <button className="link link-muted" onClick={() => deleteComment.mutate(c.id)}>
                              {t('task.delete')}
                            </button>
                          )}
                        </p>
                        <p className="comment-body">{c.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <form onSubmit={submitComment} className="comment-form">
                  <textarea
                    className="textarea"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment();
                    }}
                    placeholder={t('task.commentPlaceholder')}
                    aria-label={t('task.comments')}
                    rows={2}
                    maxLength={2000}
                  />
                  <button className="btn btn-primary" disabled={!comment.trim() || addComment.isPending}>
                    <Send size={15} /> {t('task.send')}
                  </button>
                </form>
              </section>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

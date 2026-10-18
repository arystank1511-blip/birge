import { CalendarDays, CheckCircle2, MessageCircle } from 'lucide-react';
import type { Project, Task, User } from '../api';
import { dueInfo } from '../dates';
import { useI18n } from '../i18n';
import { Avatar } from './ui';

interface Props {
  task: Task;
  project?: Project;
  assignee?: User;
  overlay?: boolean;
  onOpen?: () => void;
}

export function TaskCard({ task, project, assignee, overlay, onOpen }: Props) {
  const { t } = useI18n();
  const done = task.status === 'done';
  const due = dueInfo(task.dueDate, done);
  const { done: subDone, total: subTotal } = task.subtasks;

  return (
    <article
      className={`card prio-${task.priority}${overlay ? ' card-overlay' : ''}${done ? ' card-done' : ''}`}
      onClick={onOpen}
    >
      <div className="card-top">
        {project && (
          <span className="tag" style={{ ['--tag' as string]: project.color }}>
            <i />
            {project.name}
          </span>
        )}
        {(task.priority === 'high' || task.priority === 'urgent') && (
          <span className={`prio-badge prio-badge-${task.priority}`}>{t(`priority.${task.priority}`)}</span>
        )}
      </div>

      <h3 className="card-title">
        {done && <CheckCircle2 size={15} className="card-check" />}
        {task.title}
      </h3>

      {subTotal > 0 && (
        <div className="progress" title={t('board.subtasksDone', { done: subDone, total: subTotal })}>
          <div className="progress-bar">
            <span style={{ width: `${(subDone / subTotal) * 100}%` }} />
          </div>
          <span className="mono">
            {subDone}/{subTotal}
          </span>
        </div>
      )}

      <footer className="card-meta">
        {due && (
          <span className={`due due-${due.tone}`}>
            <CalendarDays size={13} />
            {due.label}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="meta" title={t('board.comments', { n: task.commentCount })}>
            <MessageCircle size={13} />
            {task.commentCount}
          </span>
        )}
        <span className="spacer" />
        {assignee && <Avatar user={assignee} size={22} />}
      </footer>
    </article>
  );
}

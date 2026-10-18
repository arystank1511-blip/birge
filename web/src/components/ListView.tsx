import { CalendarDays, Check, MessageCircle } from 'lucide-react';
import { STATUSES, type Project, type Task, type User } from '../api';
import { dueInfo } from '../dates';
import { useI18n } from '../i18n';
import { Avatar, STATUS_COLOR } from './ui';

interface Props {
  tasks: Task[];
  projects: Map<number, Project>;
  users: Map<number, User>;
  onOpen: (id: number) => void;
  onToggleDone: (task: Task) => void;
}

export function ListView({ tasks, projects, users, onOpen, onToggleDone }: Props) {
  const { t } = useI18n();
  return (
    <div className="list glass">
      {STATUSES.map((status) => {
        const rows = tasks.filter((task) => task.status === status).sort((a, b) => a.position - b.position);
        if (!rows.length) return null;
        return (
          <section key={status} className="list-group">
            <h2 className="list-heading">
              <i style={{ background: STATUS_COLOR[status] }} />
              {t(`status.${status}`)}
              <span className="count mono">{rows.length}</span>
            </h2>
            <ul>
              {rows.map((task) => {
                const project = projects.get(task.projectId);
                const due = dueInfo(task.dueDate, task.status === 'done');
                return (
                  <li key={task.id} className={`list-row prio-${task.priority}${task.status === 'done' ? ' card-done' : ''}`}>
                    <button
                      className={`check${task.status === 'done' ? ' checked' : ''}`}
                      onClick={() => onToggleDone(task)}
                      aria-label={t(task.status === 'done' ? 'board.reopen' : 'board.complete', { title: task.title })}
                    >
                      <Check size={13} strokeWidth={3} />
                    </button>
                    <button className="list-title" onClick={() => onOpen(task.id)}>
                      {task.title}
                    </button>
                    <span className="list-cell list-project">
                      {project && (
                        <span className="tag" style={{ ['--tag' as string]: project.color }}>
                          <i />
                          {project.name}
                        </span>
                      )}
                    </span>
                    <span className="list-cell">
                      <span className={`prio-dot prio-dot-${task.priority}`} />
                      <span>{t(`priority.${task.priority}`)}</span>
                    </span>
                    <span className="list-cell list-meta">
                      {task.commentCount > 0 && (
                        <span className="meta" title={t('board.comments', { n: task.commentCount })}>
                          <MessageCircle size={13} />
                          {task.commentCount}
                        </span>
                      )}
                    </span>
                    <span className="list-cell list-due">
                      {due && (
                        <span className={`due due-${due.tone}`}>
                          <CalendarDays size={13} />
                          {due.label}
                        </span>
                      )}
                    </span>
                    <Avatar user={task.assigneeId ? users.get(task.assigneeId) : null} size={24} />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {tasks.length === 0 && <p className="empty">{t('board.empty')}</p>}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BarChart3, CalendarDays, CheckSquare, FolderKanban, Home, Moon, Plus, Search, Settings, Sun, UserPlus, Users } from 'lucide-react';
import { useAllTasks, useAppearanceContext, useWorkspace } from '../hooks';
import { useI18n } from '../i18n';
import type { Route } from '../router';

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

/** Ctrl/⌘+K: jump to a page, project or task, or run a quick action. Fully keyboard driven. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { projects, navigate, openTask, newTask } = useWorkspace();
  const { theme, setTheme } = useAppearanceContext();
  const { data: tasks = [] } = useAllTasks();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo(() => {
    const go = (route: Route) => () => navigate(route);
    const q = query.trim().toLocaleLowerCase();
    const match = (s: string) => !q || s.toLocaleLowerCase().includes(q);

    const pages: Item[] = [
      { id: 'p-home', group: t('palette.pages'), label: t('nav.home'), icon: <Home size={16} />, run: go({ page: 'home' }) },
      { id: 'p-tasks', group: t('palette.pages'), label: t('nav.tasks'), icon: <CheckSquare size={16} />, run: go({ page: 'tasks' }) },
      { id: 'p-cal', group: t('palette.pages'), label: t('nav.calendar'), icon: <CalendarDays size={16} />, run: go({ page: 'calendar' }) },
      { id: 'p-ins', group: t('palette.pages'), label: t('nav.insights'), icon: <BarChart3 size={16} />, run: go({ page: 'insights' }) },
      { id: 'p-team', group: t('palette.pages'), label: t('nav.team'), icon: <Users size={16} />, run: go({ page: 'team' }) },
      { id: 'p-set', group: t('palette.pages'), label: t('nav.settings'), icon: <Settings size={16} />, run: go({ page: 'settings' }) },
    ].filter((i) => match(i.label));

    const projectItems: Item[] = projects
      .filter((p) => match(p.name))
      .map((p) => ({
        id: `pr-${p.id}`,
        group: t('nav.projects'),
        label: p.name,
        hint: t('project.openCount', { n: p.openCount }),
        icon: <i className="palette-dot-icon" style={{ background: p.color }} />,
        run: go({ page: 'project', id: p.id }),
      }));

    const taskItems: Item[] = q
      ? tasks
          .filter((task) => match(task.title))
          .slice(0, 6)
          .map((task) => ({
            id: `t-${task.id}`,
            group: t('nav.tasks'),
            label: task.title,
            hint: t(`status.${task.status}`),
            icon: <FolderKanban size={16} />,
            run: () => openTask(task.id),
          }))
      : [];

    const actions: Item[] = [
      { id: 'a-new', group: t('palette.actions'), label: t('head.newTask'), icon: <Plus size={16} />, run: () => newTask() },
      {
        id: 'a-theme',
        group: t('palette.actions'),
        label: theme === 'dark' ? t('palette.toLight') : t('palette.toDark'),
        icon: theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      { id: 'a-invite', group: t('palette.actions'), label: t('team.invite'), icon: <UserPlus size={16} />, run: go({ page: 'team' }) },
    ].filter((i) => match(i.label));

    return [...pages, ...projectItems, ...taskItems, ...actions];
  }, [query, projects, tasks, theme, t, navigate, openTask, newTask, setTheme]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(items[active]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  let lastGroup = '';
  return (
    <>
      <div className="backdrop backdrop-soft" onClick={onClose} />
      <div className="palette glass" role="dialog" aria-modal="true" aria-label={t('palette.title')} onKeyDown={onKeyDown}>
        <label className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('palette.placeholder')}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </label>
        <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {header && <p className="pop-label">{header}</p>}
                <button
                  id={`palette-${item.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={`palette-item${i === active ? ' on' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(item)}
                >
                  <span className="palette-icon">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                  {item.hint && <span className="muted small">{item.hint}</span>}
                </button>
              </li>
            );
          })}
          {!items.length && <li className="empty-note">{t('palette.empty')}</li>}
        </ul>
      </div>
    </>
  );
}

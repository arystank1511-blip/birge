import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { STATUSES, type Project, type Status, type Task, type User } from '../api';
import { useI18n } from '../i18n';
import { TaskCard } from './TaskCard';
import { Ring, STATUS_COLOR } from './ui';

export type Layout = Record<Status, number[]>;

const DONE_PREVIEW = 6;

function group(tasks: Task[]): Layout {
  const layout: Layout = { todo: [], in_progress: [], review: [], done: [] };
  [...tasks].sort((a, b) => a.position - b.position || a.id - b.id).forEach((t) => layout[t.status].push(t.id));
  return layout;
}

interface Props {
  tasks: Task[];
  projects: Map<number, Project>;
  users: Map<number, User>;
  onOpen: (id: number) => void;
  onAdd: (status: Status) => void;
  onMove: (id: number, status: Status, layout: Layout) => void;
}

export function Board({ tasks, projects, users, onOpen, onAdd, onMove }: Props) {
  const [layout, setLayout] = useState(() => group(tasks));
  const [activeId, setActiveId] = useState<number | null>(null);
  const origin = useRef<{ status: Status; index: number } | null>(null);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // Server data wins whenever nothing is being dragged.
  useEffect(() => {
    if (activeId === null) setLayout(group(tasks));
  }, [tasks, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const findColumn = (id: UniqueIdentifier | undefined, from = layout): Status | undefined => {
    if (id === undefined) return undefined;
    if (typeof id === 'string' && id in from) return id as Status;
    return STATUSES.find((s) => from[s].includes(id as number));
  };

  const handleStart = ({ active }: DragStartEvent) => {
    const id = active.id as number;
    const status = findColumn(id);
    if (!status) return;
    origin.current = { status, index: layout[status].indexOf(id) };
    setActiveId(id);
  };

  const handleOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setLayout((prev) => {
      const from = findColumn(active.id, prev);
      const to = findColumn(over.id, prev);
      if (!from || !to || from === to) return prev;
      const target = prev[to].filter((id) => id !== active.id);
      const overIndex = target.indexOf(over.id as number);
      const translated = active.rect.current.translated;
      const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;
      const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length;
      target.splice(index, 0, active.id as number);
      return { ...prev, [from]: prev[from].filter((id) => id !== active.id), [to]: target };
    });
  };

  const handleEnd = ({ active, over }: DragEndEvent) => {
    const id = active.id as number;
    const to = findColumn(over?.id);
    const from = findColumn(id);
    let next = layout;
    if (to && from === to && over && over.id !== id) {
      const oldIndex = layout[to].indexOf(id);
      const newIndex = layout[to].indexOf(over.id as number);
      if (newIndex >= 0) next = { ...layout, [to]: arrayMove(layout[to], oldIndex, newIndex) };
    }
    const status = to ? findColumn(id, next) : undefined;
    if (status && origin.current) {
      const index = next[status].indexOf(id);
      if (status !== origin.current.status || index !== origin.current.index) {
        setLayout(next);
        onMove(id, status, next);
      }
    }
    origin.current = null;
    setActiveId(null);
  };

  const active = activeId !== null ? byId.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleStart}
      onDragOver={handleOver}
      onDragEnd={handleEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="board">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            ids={layout[status].filter((id) => byId.has(id))}
            activeId={activeId}
            total={tasks.length}
            byId={byId}
            projects={projects}
            users={users}
            onOpen={onOpen}
            onAdd={onAdd}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
        {active && (
          <TaskCard
            task={active}
            project={projects.get(active.projectId)}
            assignee={active.assigneeId ? users.get(active.assigneeId) : undefined}
            overlay
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface ColumnProps {
  status: Status;
  ids: number[];
  activeId: number | null;
  total: number;
  byId: Map<number, Task>;
  projects: Map<number, Project>;
  users: Map<number, User>;
  onOpen: (id: number) => void;
  onAdd: (status: Status) => void;
}

function Column({ status, ids, activeId, total, byId, projects, users, onOpen, onAdd }: ColumnProps) {
  const { t } = useI18n();
  const label = t(`status.${status}`);
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [expanded, setExpanded] = useState(false);
  const limit = status === 'done' && !expanded ? DONE_PREVIEW : Infinity;
  const visible = ids.filter((id, i) => i < limit || id === activeId);
  const hidden = ids.length - visible.length;

  return (
    <section className={`column${isOver ? ' column-over' : ''}`} style={{ ['--col' as string]: STATUS_COLOR[status] }}>
      <header className="column-head">
        <Ring value={ids.length} total={Math.max(total, 1)} color={STATUS_COLOR[status]} />
        <h2>{label}</h2>
        <span className="count mono">{ids.length}</span>
        <button className="icon-btn icon-btn-sm" onClick={() => onAdd(status)} aria-label={t('board.addTo', { column: label })}>
          <Plus size={16} />
        </button>
      </header>
      <SortableContext items={visible} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="column-body">
          {visible.map((id) => {
            const task = byId.get(id)!;
            return (
              <SortableCard
                key={id}
                task={task}
                project={projects.get(task.projectId)}
                assignee={task.assigneeId ? users.get(task.assigneeId) : undefined}
                onOpen={() => onOpen(id)}
              />
            );
          })}
          {ids.length === 0 && <div className="column-empty">{t('board.dropHere')}</div>}
          {hidden > 0 && (
            <button className="show-more" onClick={() => setExpanded(true)}>
              {t('board.showMore', { n: hidden })}
            </button>
          )}
          {expanded && status === 'done' && ids.length > DONE_PREVIEW && (
            <button className="show-more" onClick={() => setExpanded(false)}>
              {t('board.showLess')}
            </button>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({
  task,
  project,
  assignee,
  onOpen,
}: {
  task: Task;
  project?: Project;
  assignee?: User;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    listeners?.onKeyDown?.(e);
    if (e.key === 'Enter') onOpen();
  };

  return (
    <div
      ref={setNodeRef}
      className={`sortable${isDragging ? ' sortable-ghost' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      aria-label={t('board.cardHint', { title: task.title })}
    >
      <TaskCard task={task} project={project} assignee={assignee} onOpen={onOpen} />
    </div>
  );
}

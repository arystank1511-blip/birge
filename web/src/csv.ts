import type { Member, Project, Task } from './api';
import { todayISO } from './dates';
import { toCsv } from './metrics';

/** Downloads every task of the workspace as a CSV file the viewer can open in Excel or Sheets. */
export function exportTasksCsv(tasks: Task[], projects: Project[], members: Member[], workspaceName: string) {
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const rows = [
    ['id', 'title', 'project', 'status', 'priority', 'assignee', 'due_date', 'created_at', 'completed_at'],
    ...tasks.map((task) => [
      task.id,
      task.title,
      projectName.get(task.projectId) ?? '',
      task.status,
      task.priority,
      task.assigneeId ? (memberName.get(task.assigneeId) ?? '') : '',
      task.dueDate,
      task.createdAt,
      task.completedAt,
    ]),
  ];
  // BOM so Excel opens Cyrillic and Kazakh text correctly.
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `birge-${workspaceName.toLowerCase().replace(/\s+/g, '-')}-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Square-crops and shrinks a picked photo so it fits comfortably in the profile (~15–40 KB JPEG). */
export function resizeAvatar(file: File, size = 192): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('not-an-image'));
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('unreadable-image'));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no-canvas'));
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

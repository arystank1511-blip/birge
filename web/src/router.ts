import { useCallback, useEffect, useState } from 'react';

/**
 * Tiny hash router: #/home, #/tasks, #/tasks?assignee=3, #/calendar, #/insights, #/team, #/settings, #/project/7.
 * Hash routes need no server config, survive reloads and work with the browser's back button.
 */
export type Route =
  | { page: 'home' }
  | { page: 'tasks'; assignee?: number }
  | { page: 'calendar' }
  | { page: 'insights' }
  | { page: 'team' }
  | { page: 'settings' }
  | { page: 'project'; id: number };

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [page, arg] = path.split('/');
  const params = new URLSearchParams(query);
  switch (page) {
    case 'tasks': {
      const assignee = Number(params.get('assignee'));
      return assignee > 0 ? { page: 'tasks', assignee } : { page: 'tasks' };
    }
    case 'calendar':
    case 'insights':
    case 'team':
    case 'settings':
      return { page };
    case 'project': {
      const id = Number(arg);
      return id > 0 ? { page: 'project', id } : { page: 'home' };
    }
    default:
      return { page: 'home' };
  }
}

export function routeToHash(route: Route): string {
  if (route.page === 'project') return `#/project/${route.id}`;
  if (route.page === 'tasks' && route.assignee) return `#/tasks?assignee=${route.assignee}`;
  return `#/${route.page}`;
}

/** A stable string per page, used as a React key so each navigation replays the entrance animation. */
export const routeKey = (route: Route) => routeToHash(route);

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = routeToHash(next);
    if (location.hash !== hash) location.hash = hash;
    else setRoute(next);
  }, []);

  return [route, navigate] as const;
}

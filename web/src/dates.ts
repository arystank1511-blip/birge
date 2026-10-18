import { getLocale, translate } from './i18n';

const pad = (n: number) => String(n).padStart(2, '0');
const DAY = 24 * 60 * 60 * 1000;

export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoDate(new Date());

function parseISODate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Many browsers ship without Kazakh locale data (Intl silently falls back to English or garbles months),
// so Kazakh dates are formatted from our own tables.
const KK_MONTHS = ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.'];
const KK_WEEKDAYS = ['Жс', 'Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб'];
const isKazakh = () => getLocale().startsWith('kk');

const shortDate = (d: Date) =>
  isKazakh() ? `${d.getDate()} ${KK_MONTHS[d.getMonth()]}` : d.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase(getLocale()) + s.slice(1);

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'done';

export function dueInfo(due: string | null, done: boolean): { label: string; tone: DueTone } | null {
  if (!due) return null;
  const date = parseISODate(due);
  const diff = Math.round((date.getTime() - parseISODate(todayISO()).getTime()) / DAY);

  let label: string;
  if (diff === 0) label = translate('time.today');
  else if (diff === 1) label = translate('time.tomorrow');
  else if (diff === -1) label = translate('time.yesterday');
  else if (diff > 1 && diff < 7) {
    label = isKazakh()
      ? KK_WEEKDAYS[date.getDay()]
      : capitalize(date.toLocaleDateString(getLocale(), { weekday: 'short' }));
  } else label = shortDate(date);

  const tone: DueTone = done ? 'done' : diff < 0 ? 'overdue' : diff === 0 ? 'today' : diff <= 3 ? 'soon' : 'later';
  return { label, tone };
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  if (isKazakh()) return `${d.getFullYear()} ж. ${d.getDate()} ${KK_MONTHS[d.getMonth()]}`;
  return d.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
}

export function timeAgo(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return translate('time.justNow');
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  if (days >= 30) return shortDate(new Date(iso));
  if (minutes < 60) return translate('time.minutesAgo', { n: minutes });
  if (hours < 24) return translate('time.hoursAgo', { n: hours });
  return translate('time.daysAgo', { n: days });
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'ru' | 'kk';
type Plural = { one: string; few?: string; many?: string; other: string };
type Message = string | Plural;

export const LANGS: { id: Lang; label: string; locale: string }[] = [
  { id: 'en', label: 'English', locale: 'en-US' },
  { id: 'ru', label: 'Русский', locale: 'ru-RU' },
  { id: 'kk', label: 'Қазақша', locale: 'kk-KZ' },
];

const en = {
  'app.tagline': 'Plan the week, ship the work, see what is stuck.',

  'auth.welcomeBack': 'Welcome back',
  'auth.createTitle': 'Create your account',
  'auth.demo': 'Explore the demo workspace',
  'auth.orEmail': 'or with email',
  'auth.name': 'Name',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.signIn': 'Sign in',
  'auth.createAccount': 'Create account',
  'auth.newHere': 'New here?',
  'auth.haveAccount': 'Already have an account?',
  'auth.toRegister': 'Create an account',
  'auth.toLogin': 'Sign in',

  'nav.allTasks': 'All tasks',
  'nav.members': 'Members',
  'nav.projects': 'Projects',
  'nav.newProject': 'New project',
  'nav.projectName': 'Project name',
  'nav.projectColor': 'Project color',
  'nav.addProject': 'Add project',
  'nav.noProjects': 'No projects yet.',
  'nav.signOut': 'Sign out',
  'nav.openMenu': 'Open menu',

  'ws.workspaces': 'Workspaces',
  'ws.new': 'New workspace',
  'ws.name': 'Workspace name',
  'ws.create': 'Create',
  'ws.memberCount': { one: '{n} member', other: '{n} members' },
  'ws.emptyTitle': 'Create a workspace to get started',
  'ws.emptyBody': 'Workspaces keep a team’s projects and tasks together.',

  'role.owner': 'Owner',
  'role.admin': 'Admin',
  'role.member': 'Member',

  'head.workspace': 'Workspace',
  'head.project': 'Project',
  'head.board': 'Board',
  'head.list': 'List',
  'head.view': 'View',
  'head.newTask': 'New task',
  'head.live': 'Live',
  'head.liveHint': 'Changes from your team appear instantly',
  'head.reconnecting': 'Reconnecting…',
  'head.online': 'Online now',

  'stats.open': 'Open',
  'stats.dueWeek': 'Due this week',
  'stats.overdue': 'Overdue',
  'stats.done7': 'Done in 7 days',

  'filter.mine': 'Assigned to me',
  'filter.anyPriority': 'Any priority',
  'filter.search': 'Search tasks, projects, people',
  'filter.clear': 'Clear',
  'filter.loadError': 'Couldn’t load tasks.',
  'filter.retry': 'Try again',

  'status.todo': 'To do',
  'status.in_progress': 'In progress',
  'status.review': 'In review',
  'status.done': 'Done',
  'priority.low': 'Low',
  'priority.medium': 'Medium',
  'priority.high': 'High',
  'priority.urgent': 'Urgent',

  'board.dropHere': 'Drop a task here',
  'board.showMore': 'Show {n} more',
  'board.showLess': 'Show less',
  'board.addTo': 'Add task to {column}',
  'board.cardHint': '{title}. Press Enter to open, Space to move.',
  'board.subtasksDone': '{done} of {total} subtasks done',
  'board.comments': { one: '{n} comment', other: '{n} comments' },
  'board.empty': 'No tasks match these filters.',
  'board.complete': 'Complete {title}',
  'board.reopen': 'Reopen {title}',
  'board.unassigned': 'Unassigned',

  'task.status': 'Status',
  'task.project': 'Project',
  'task.priority': 'Priority',
  'task.assignee': 'Assignee',
  'task.dueDate': 'Due date',
  'task.title': 'Title',
  'task.description': 'Description',
  'task.descPlaceholder': 'Add context, links, acceptance criteria…',
  'task.subtasks': 'Subtasks',
  'task.addSubtask': 'Add a subtask and press Enter',
  'task.deleteSubtask': 'Delete {title}',
  'task.comments': 'Comments',
  'task.commentPlaceholder': 'Write a comment… (Ctrl+Enter to send)',
  'task.send': 'Send',
  'task.delete': 'Delete',
  'task.deleteTask': 'Delete task',
  'task.confirmDelete': 'Delete “{title}”?',
  'task.close': 'Close',
  'task.loading': 'Loading…',
  'task.gone': 'This task no longer exists.',
  'task.deletedUser': 'Deleted user',
  'task.you': '(you)',
  'task.deleted': 'Task deleted',
  'task.details': 'Task details',

  'new.title': 'New task',
  'new.placeholder': 'What needs to be done?',
  'new.cancel': 'Cancel',
  'new.create': 'Create task',
  'new.needProject': 'Create a project in the sidebar first, then add tasks to it.',
  'new.created': 'Created “{title}”',

  'members.title': 'Members',
  'members.subtitle': 'People who can see and edit this workspace.',
  'members.joined': 'Joined {date}',
  'members.remove': 'Remove',
  'members.confirmRemove': 'Remove {name} from {workspace}?',
  'members.leave': 'Leave workspace',
  'members.confirmLeave': 'Leave {workspace}?',
  'members.changeRole': 'Change role for {name}',
  'members.inviteTitle': 'Invite people',
  'members.inviteHint': 'Anyone with the link can join until it expires. The link is shown only once.',
  'members.inviteRole': 'Role',
  'members.inviteExpires': 'Expires in',
  'members.days': { one: '{n} day', other: '{n} days' },
  'members.createLink': 'Create invite link',
  'members.copy': 'Copy',
  'members.copied': 'Link copied',
  'members.activeLinks': 'Active links',
  'members.noLinks': 'No active links.',
  'members.by': 'by {name}',
  'members.until': 'until {date}',
  'members.used': { one: 'used {n} time', other: 'used {n} times' },
  'members.revoke': 'Revoke',
  'members.settings': 'Workspace settings',
  'members.rename': 'Name',
  'members.save': 'Save',
  'members.saved': 'Saved',
  'members.deleteWs': 'Delete workspace',
  'members.deleteWsHint': 'Deletes every project and task for everyone. This can’t be undone.',
  'members.confirmDeleteWs': 'Delete “{workspace}” and everything in it?',

  'join.title': 'You’re invited to {workspace}',
  'join.by': '{name} invited you as {role}.',
  'join.signIn': 'Sign in or create an account to join.',
  'join.accept': 'Join workspace',
  'join.decline': 'Not now',
  'join.invalid': 'This invite link is no longer valid',
  'join.askNew': 'Ask whoever sent it for a new one.',
  'join.goToApp': 'Go to Tasklane',
  'join.joined': 'You joined {workspace}',

  'live.created': '{actor} added “{title}”',
  'live.moved': '{actor} moved “{title}” to {status}',
  'live.deleted': '{actor} deleted “{title}”',
  'live.commented': '{actor} commented on “{title}”',
  'live.joined': '{actor} joined the workspace',
  'live.removedYou': 'You no longer have access to {workspace}',
  'live.wsDeleted': '{workspace} was deleted',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.dark': 'Dark',
  'settings.light': 'Light',
  'settings.color': 'Color',
  'palette.lime': 'Lime',
  'palette.indigo': 'Indigo',
  'palette.ocean': 'Ocean',
  'palette.sunset': 'Sunset',
  'palette.rose': 'Rose',
  'palette.cobalt': 'Cobalt',

  'time.justNow': 'just now',
  'time.today': 'Today',
  'time.tomorrow': 'Tomorrow',
  'time.yesterday': 'Yesterday',
  'time.minutesAgo': '{n} min ago',
  'time.hoursAgo': '{n} h ago',
  'time.daysAgo': { one: '{n} day ago', other: '{n} days ago' },

  'error.generic': 'Something went wrong. Try again.',
  'error.invalidLogin': 'Wrong email or password',
  'error.emailTaken': 'An account with this email already exists',
  'error.tooMany': 'Too many attempts. Try again in a few minutes.',
  'error.forbidden': 'You don’t have permission to do that',
  'error.notFound': 'Not found. It may have been deleted.',
  'error.validation': 'Check the fields and try again',
  'error.lastOwner': 'Make someone else an owner before you leave',
  'error.network': 'No connection to the server',
} satisfies Record<string, Message>;

export type MessageKey = keyof typeof en;
type Dictionary = Record<MessageKey, Message>;

const ru: Dictionary = {
  'app.tagline': 'Планируйте неделю, доводите задачи до конца и сразу видите, что застряло.',

  'auth.welcomeBack': 'С возвращением',
  'auth.createTitle': 'Создайте аккаунт',
  'auth.demo': 'Открыть демо-пространство',
  'auth.orEmail': 'или по email',
  'auth.name': 'Имя',
  'auth.email': 'Email',
  'auth.password': 'Пароль',
  'auth.signIn': 'Войти',
  'auth.createAccount': 'Создать аккаунт',
  'auth.newHere': 'Впервые здесь?',
  'auth.haveAccount': 'Уже есть аккаунт?',
  'auth.toRegister': 'Зарегистрироваться',
  'auth.toLogin': 'Войти',

  'nav.allTasks': 'Все задачи',
  'nav.members': 'Участники',
  'nav.projects': 'Проекты',
  'nav.newProject': 'Новый проект',
  'nav.projectName': 'Название проекта',
  'nav.projectColor': 'Цвет проекта',
  'nav.addProject': 'Добавить проект',
  'nav.noProjects': 'Проектов пока нет.',
  'nav.signOut': 'Выйти',
  'nav.openMenu': 'Открыть меню',

  'ws.workspaces': 'Пространства',
  'ws.new': 'Новое пространство',
  'ws.name': 'Название пространства',
  'ws.create': 'Создать',
  'ws.memberCount': { one: '{n} участник', few: '{n} участника', many: '{n} участников', other: '{n} участника' },
  'ws.emptyTitle': 'Создайте пространство, чтобы начать',
  'ws.emptyBody': 'В пространстве хранятся проекты и задачи одной команды.',

  'role.owner': 'Владелец',
  'role.admin': 'Администратор',
  'role.member': 'Участник',

  'head.workspace': 'Пространство',
  'head.project': 'Проект',
  'head.board': 'Доска',
  'head.list': 'Список',
  'head.view': 'Вид',
  'head.newTask': 'Новая задача',
  'head.live': 'Онлайн',
  'head.liveHint': 'Изменения команды появляются сразу',
  'head.reconnecting': 'Переподключение…',
  'head.online': 'Сейчас онлайн',

  'stats.open': 'Открыто',
  'stats.dueWeek': 'Срок на этой неделе',
  'stats.overdue': 'Просрочено',
  'stats.done7': 'Сделано за 7 дней',

  'filter.mine': 'Мои задачи',
  'filter.anyPriority': 'Любой приоритет',
  'filter.search': 'Поиск задач, проектов, людей',
  'filter.clear': 'Сбросить',
  'filter.loadError': 'Не удалось загрузить задачи.',
  'filter.retry': 'Повторить',

  'status.todo': 'К выполнению',
  'status.in_progress': 'В работе',
  'status.review': 'На проверке',
  'status.done': 'Готово',
  'priority.low': 'Низкий',
  'priority.medium': 'Средний',
  'priority.high': 'Высокий',
  'priority.urgent': 'Срочно',

  'board.dropHere': 'Перетащите задачу сюда',
  'board.showMore': 'Показать ещё {n}',
  'board.showLess': 'Свернуть',
  'board.addTo': 'Добавить задачу в «{column}»',
  'board.cardHint': '{title}. Enter — открыть, пробел — переместить.',
  'board.subtasksDone': 'Выполнено подзадач: {done} из {total}',
  'board.comments': { one: '{n} комментарий', few: '{n} комментария', many: '{n} комментариев', other: '{n} комментария' },
  'board.empty': 'По этим фильтрам задач нет.',
  'board.complete': 'Завершить «{title}»',
  'board.reopen': 'Вернуть в работу «{title}»',
  'board.unassigned': 'Не назначена',

  'task.status': 'Статус',
  'task.project': 'Проект',
  'task.priority': 'Приоритет',
  'task.assignee': 'Исполнитель',
  'task.dueDate': 'Срок',
  'task.title': 'Название',
  'task.description': 'Описание',
  'task.descPlaceholder': 'Добавьте контекст, ссылки, критерии готовности…',
  'task.subtasks': 'Подзадачи',
  'task.addSubtask': 'Добавьте подзадачу и нажмите Enter',
  'task.deleteSubtask': 'Удалить «{title}»',
  'task.comments': 'Комментарии',
  'task.commentPlaceholder': 'Напишите комментарий… (Ctrl+Enter — отправить)',
  'task.send': 'Отправить',
  'task.delete': 'Удалить',
  'task.deleteTask': 'Удалить задачу',
  'task.confirmDelete': 'Удалить «{title}»?',
  'task.close': 'Закрыть',
  'task.loading': 'Загрузка…',
  'task.gone': 'Этой задачи больше нет.',
  'task.deletedUser': 'Удалённый пользователь',
  'task.you': '(вы)',
  'task.deleted': 'Задача удалена',
  'task.details': 'Детали задачи',

  'new.title': 'Новая задача',
  'new.placeholder': 'Что нужно сделать?',
  'new.cancel': 'Отмена',
  'new.create': 'Создать задачу',
  'new.needProject': 'Сначала создайте проект в боковой панели, а потом добавляйте в него задачи.',
  'new.created': 'Задача «{title}» создана',

  'members.title': 'Участники',
  'members.subtitle': 'Люди, которые видят и редактируют это пространство.',
  'members.joined': 'В команде с {date}',
  'members.remove': 'Удалить',
  'members.confirmRemove': 'Удалить {name} из «{workspace}»?',
  'members.leave': 'Покинуть пространство',
  'members.confirmLeave': 'Покинуть «{workspace}»?',
  'members.changeRole': 'Изменить роль: {name}',
  'members.inviteTitle': 'Пригласить людей',
  'members.inviteHint': 'Присоединиться по ссылке может любой, пока она действует. Ссылка показывается только один раз.',
  'members.inviteRole': 'Роль',
  'members.inviteExpires': 'Срок действия',
  'members.days': { one: '{n} день', few: '{n} дня', many: '{n} дней', other: '{n} дня' },
  'members.createLink': 'Создать ссылку',
  'members.copy': 'Копировать',
  'members.copied': 'Ссылка скопирована',
  'members.activeLinks': 'Активные ссылки',
  'members.noLinks': 'Активных ссылок нет.',
  'members.by': 'автор: {name}',
  'members.until': 'до {date}',
  'members.used': { one: 'использована {n} раз', few: 'использована {n} раза', many: 'использована {n} раз', other: 'использована {n} раза' },
  'members.revoke': 'Отозвать',
  'members.settings': 'Настройки пространства',
  'members.rename': 'Название',
  'members.save': 'Сохранить',
  'members.saved': 'Сохранено',
  'members.deleteWs': 'Удалить пространство',
  'members.deleteWsHint': 'Удалит все проекты и задачи у всех участников. Отменить нельзя.',
  'members.confirmDeleteWs': 'Удалить «{workspace}» со всем содержимым?',

  'join.title': 'Вас пригласили в «{workspace}»',
  'join.by': '{name} приглашает вас с ролью «{role}».',
  'join.signIn': 'Войдите или зарегистрируйтесь, чтобы присоединиться.',
  'join.accept': 'Присоединиться',
  'join.decline': 'Не сейчас',
  'join.invalid': 'Эта ссылка-приглашение больше не действует',
  'join.askNew': 'Попросите отправителя прислать новую.',
  'join.goToApp': 'Перейти в Tasklane',
  'join.joined': 'Вы присоединились к «{workspace}»',

  // Russian past tense is gendered, so live messages avoid "добавил/добавила".
  'live.created': '{actor} · новая задача «{title}»',
  'live.moved': '{actor} · «{title}» → {status}',
  'live.deleted': '{actor} · задача «{title}» удалена',
  'live.commented': '{actor} · новый комментарий к «{title}»',
  'live.joined': '{actor} теперь в пространстве',
  'live.removedYou': 'У вас больше нет доступа к «{workspace}»',
  'live.wsDeleted': 'Пространство «{workspace}» удалено',

  'settings.title': 'Настройки',
  'settings.language': 'Язык',
  'settings.theme': 'Тема',
  'settings.dark': 'Тёмная',
  'settings.light': 'Светлая',
  'settings.color': 'Цвет',
  'palette.lime': 'Лайм',
  'palette.indigo': 'Индиго',
  'palette.ocean': 'Океан',
  'palette.sunset': 'Закат',
  'palette.rose': 'Роза',
  'palette.cobalt': 'Кобальт',

  'time.justNow': 'только что',
  'time.today': 'Сегодня',
  'time.tomorrow': 'Завтра',
  'time.yesterday': 'Вчера',
  'time.minutesAgo': '{n} мин назад',
  'time.hoursAgo': '{n} ч назад',
  'time.daysAgo': { one: '{n} день назад', few: '{n} дня назад', many: '{n} дней назад', other: '{n} дня назад' },

  'error.generic': 'Что-то пошло не так. Попробуйте ещё раз.',
  'error.invalidLogin': 'Неверный email или пароль',
  'error.emailTaken': 'Аккаунт с таким email уже существует',
  'error.tooMany': 'Слишком много попыток. Попробуйте через несколько минут.',
  'error.forbidden': 'У вас нет прав на это действие',
  'error.notFound': 'Не найдено. Возможно, это уже удалили.',
  'error.validation': 'Проверьте поля и попробуйте снова',
  'error.lastOwner': 'Перед уходом назначьте другого владельца',
  'error.network': 'Нет соединения с сервером',
};

const kk: Dictionary = {
  'app.tagline': 'Аптаны жоспарлаңыз, тапсырмаларды аяғына жеткізіңіз және не тоқтап қалғанын бірден көріңіз.',

  'auth.welcomeBack': 'Қайта қош келдіңіз',
  'auth.createTitle': 'Аккаунт жасаңыз',
  'auth.demo': 'Демо кеңістікті ашу',
  'auth.orEmail': 'немесе email арқылы',
  'auth.name': 'Аты',
  'auth.email': 'Email',
  'auth.password': 'Құпиясөз',
  'auth.signIn': 'Кіру',
  'auth.createAccount': 'Аккаунт жасау',
  'auth.newHere': 'Мұнда алғаш рет пе?',
  'auth.haveAccount': 'Аккаунтыңыз бар ма?',
  'auth.toRegister': 'Тіркелу',
  'auth.toLogin': 'Кіру',

  'nav.allTasks': 'Барлық тапсырмалар',
  'nav.members': 'Қатысушылар',
  'nav.projects': 'Жобалар',
  'nav.newProject': 'Жаңа жоба',
  'nav.projectName': 'Жоба атауы',
  'nav.projectColor': 'Жоба түсі',
  'nav.addProject': 'Жоба қосу',
  'nav.noProjects': 'Әзірге жобалар жоқ.',
  'nav.signOut': 'Шығу',
  'nav.openMenu': 'Мәзірді ашу',

  'ws.workspaces': 'Кеңістіктер',
  'ws.new': 'Жаңа кеңістік',
  'ws.name': 'Кеңістік атауы',
  'ws.create': 'Жасау',
  'ws.memberCount': { one: '{n} қатысушы', other: '{n} қатысушы' },
  'ws.emptyTitle': 'Бастау үшін кеңістік жасаңыз',
  'ws.emptyBody': 'Кеңістікте бір команданың жобалары мен тапсырмалары сақталады.',

  'role.owner': 'Иесі',
  'role.admin': 'Әкімші',
  'role.member': 'Қатысушы',

  'head.workspace': 'Кеңістік',
  'head.project': 'Жоба',
  'head.board': 'Тақта',
  'head.list': 'Тізім',
  'head.view': 'Көрініс',
  'head.newTask': 'Жаңа тапсырма',
  'head.live': 'Онлайн',
  'head.liveHint': 'Команданың өзгерістері бірден көрінеді',
  'head.reconnecting': 'Қайта қосылуда…',
  'head.online': 'Қазір желіде',

  'stats.open': 'Ашық',
  'stats.dueWeek': 'Осы аптада мерзімі',
  'stats.overdue': 'Мерзімі өткен',
  'stats.done7': '7 күнде орындалды',

  'filter.mine': 'Маған тағайындалған',
  'filter.anyPriority': 'Кез келген басымдық',
  'filter.search': 'Тапсырмаларды, жобаларды, адамдарды іздеу',
  'filter.clear': 'Тазарту',
  'filter.loadError': 'Тапсырмаларды жүктеу мүмкін болмады.',
  'filter.retry': 'Қайталау',

  'status.todo': 'Орындау керек',
  'status.in_progress': 'Орындалуда',
  'status.review': 'Тексеруде',
  'status.done': 'Дайын',
  'priority.low': 'Төмен',
  'priority.medium': 'Орташа',
  'priority.high': 'Жоғары',
  'priority.urgent': 'Шұғыл',

  'board.dropHere': 'Тапсырманы осында сүйреңіз',
  'board.showMore': 'Тағы {n} көрсету',
  'board.showLess': 'Жасыру',
  'board.addTo': '«{column}» бағанына тапсырма қосу',
  'board.cardHint': '{title}. Ашу үшін Enter, жылжыту үшін бос орын пернесін басыңыз.',
  'board.subtasksDone': '{total} ішкі тапсырманың {done} орындалды',
  'board.comments': { one: '{n} пікір', other: '{n} пікір' },
  'board.empty': 'Бұл сүзгілерге сай тапсырма жоқ.',
  'board.complete': '«{title}» тапсырмасын аяқтау',
  'board.reopen': '«{title}» тапсырмасын қайта ашу',
  'board.unassigned': 'Тағайындалмаған',

  'task.status': 'Күйі',
  'task.project': 'Жоба',
  'task.priority': 'Басымдық',
  'task.assignee': 'Орындаушы',
  'task.dueDate': 'Мерзімі',
  'task.title': 'Атауы',
  'task.description': 'Сипаттама',
  'task.descPlaceholder': 'Мәтінмән, сілтемелер, қабылдау шарттарын қосыңыз…',
  'task.subtasks': 'Ішкі тапсырмалар',
  'task.addSubtask': 'Ішкі тапсырма жазып, Enter басыңыз',
  'task.deleteSubtask': '«{title}» жою',
  'task.comments': 'Пікірлер',
  'task.commentPlaceholder': 'Пікір жазыңыз… (жіберу үшін Ctrl+Enter)',
  'task.send': 'Жіберу',
  'task.delete': 'Жою',
  'task.deleteTask': 'Тапсырманы жою',
  'task.confirmDelete': '«{title}» жойылсын ба?',
  'task.close': 'Жабу',
  'task.loading': 'Жүктелуде…',
  'task.gone': 'Бұл тапсырма енді жоқ.',
  'task.deletedUser': 'Жойылған пайдаланушы',
  'task.you': '(сіз)',
  'task.deleted': 'Тапсырма жойылды',
  'task.details': 'Тапсырма мәліметтері',

  'new.title': 'Жаңа тапсырма',
  'new.placeholder': 'Не істеу керек?',
  'new.cancel': 'Болдырмау',
  'new.create': 'Тапсырма жасау',
  'new.needProject': 'Алдымен бүйір панельде жоба жасаңыз, содан кейін оған тапсырмалар қосыңыз.',
  'new.created': '«{title}» тапсырмасы жасалды',

  'members.title': 'Қатысушылар',
  'members.subtitle': 'Бұл кеңістікті көріп, өңдей алатын адамдар.',
  'members.joined': '{date} бастап командада',
  'members.remove': 'Шығару',
  'members.confirmRemove': '{name} «{workspace}» кеңістігінен шығарылсын ба?',
  'members.leave': 'Кеңістіктен шығу',
  'members.confirmLeave': '«{workspace}» кеңістігінен шығасыз ба?',
  'members.changeRole': '{name}: рөлін өзгерту',
  'members.inviteTitle': 'Адамдарды шақыру',
  'members.inviteHint': 'Сілтемесі бар кез келген адам оның мерзімі біткенше қосыла алады. Сілтеме тек бір рет көрсетіледі.',
  'members.inviteRole': 'Рөлі',
  'members.inviteExpires': 'Жарамдылық мерзімі',
  'members.days': { one: '{n} күн', other: '{n} күн' },
  'members.createLink': 'Шақыру сілтемесін жасау',
  'members.copy': 'Көшіру',
  'members.copied': 'Сілтеме көшірілді',
  'members.activeLinks': 'Белсенді сілтемелер',
  'members.noLinks': 'Белсенді сілтемелер жоқ.',
  'members.by': 'авторы: {name}',
  'members.until': '{date} дейін',
  'members.used': { one: '{n} рет қолданылды', other: '{n} рет қолданылды' },
  'members.revoke': 'Кері қайтару',
  'members.settings': 'Кеңістік баптаулары',
  'members.rename': 'Атауы',
  'members.save': 'Сақтау',
  'members.saved': 'Сақталды',
  'members.deleteWs': 'Кеңістікті жою',
  'members.deleteWsHint': 'Барлық қатысушылар үшін жобалар мен тапсырмалардың бәрі жойылады. Мұны қайтару мүмкін емес.',
  'members.confirmDeleteWs': '«{workspace}» және ондағы барлық деректер жойылсын ба?',

  'join.title': 'Сізді «{workspace}» кеңістігіне шақырды',
  'join.by': '{name} сізді «{role}» рөлімен шақырады.',
  'join.signIn': 'Қосылу үшін кіріңіз немесе тіркеліңіз.',
  'join.accept': 'Қосылу',
  'join.decline': 'Қазір емес',
  'join.invalid': 'Бұл шақыру сілтемесі енді жарамсыз',
  'join.askNew': 'Жіберген адамнан жаңасын сұраңыз.',
  'join.goToApp': 'Tasklane-ге өту',
  'join.joined': 'Сіз «{workspace}» кеңістігіне қосылдыңыз',

  'live.created': '{actor} «{title}» тапсырмасын қосты',
  'live.moved': '{actor} «{title}» тапсырмасын «{status}» бағанына жылжытты',
  'live.deleted': '{actor} «{title}» тапсырмасын жойды',
  'live.commented': '{actor} «{title}» тапсырмасына пікір қалдырды',
  'live.joined': '{actor} кеңістікке қосылды',
  'live.removedYou': 'Сізде енді «{workspace}» кеңістігіне қолжетімділік жоқ',
  'live.wsDeleted': '«{workspace}» кеңістігі жойылды',

  'settings.title': 'Баптаулар',
  'settings.language': 'Тіл',
  'settings.theme': 'Тақырып',
  'settings.dark': 'Қараңғы',
  'settings.light': 'Ашық',
  'settings.color': 'Түс',
  'palette.lime': 'Лайм',
  'palette.indigo': 'Индиго',
  'palette.ocean': 'Мұхит',
  'palette.sunset': 'Күн батуы',
  'palette.rose': 'Раушан',
  'palette.cobalt': 'Кобальт',

  'time.justNow': 'жаңа ғана',
  'time.today': 'Бүгін',
  'time.tomorrow': 'Ертең',
  'time.yesterday': 'Кеше',
  'time.minutesAgo': '{n} мин бұрын',
  'time.hoursAgo': '{n} сағ бұрын',
  'time.daysAgo': { one: '{n} күн бұрын', other: '{n} күн бұрын' },

  'error.generic': 'Бірдеңе дұрыс болмады. Қайталап көріңіз.',
  'error.invalidLogin': 'Email немесе құпиясөз қате',
  'error.emailTaken': 'Бұл email-мен аккаунт бұрыннан бар',
  'error.tooMany': 'Әрекеттер тым көп. Бірнеше минуттан кейін қайталаңыз.',
  'error.forbidden': 'Бұл әрекетке рұқсатыңыз жоқ',
  'error.notFound': 'Табылмады. Мүмкін, ол жойылған.',
  'error.validation': 'Өрістерді тексеріп, қайталап көріңіз',
  'error.lastOwner': 'Шықпас бұрын басқа біреуді иесі етіп тағайындаңыз',
  'error.network': 'Сервермен байланыс жоқ',
};

const DICTIONARIES: Record<Lang, Dictionary> = { en, ru, kk };

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('tl-lang');
    if (saved === 'en' || saved === 'ru' || saved === 'kk') return saved;
  } catch {
    // Storage unavailable: fall back to the browser language.
  }
  const nav = navigator.language.slice(0, 2);
  return nav === 'ru' || nav === 'kk' ? nav : 'en';
}

// Module-level copy so code outside React (toasts from mutation callbacks, date helpers) translates too.
let currentLang: Lang = detectLang();
export const getLocale = () => LANGS.find((l) => l.id === currentLang)!.locale;

export type Vars = Record<string, string | number>;

export function translate(key: MessageKey, vars: Vars = {}): string {
  const message: Message | undefined = DICTIONARIES[currentLang][key] ?? en[key];
  let text: string;
  if (message === undefined) {
    // Never crash the UI over a missing string; the key is at least debuggable.
    text = key;
  } else if (typeof message === 'string') {
    text = message;
  } else {
    const form = new Intl.PluralRules(getLocale()).select(Number(vars.n ?? 0)) as keyof Plural;
    text = message[form] ?? message.other;
  }
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: typeof translate;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);

  const setLang = useCallback((next: Lang) => {
    currentLang = next;
    setLangState(next);
    try {
      localStorage.setItem('tl-lang', next);
    } catch {
      // Not critical.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // A new function identity per language makes components that depend on `t` re-render.
  const value = useMemo(() => ({ lang, setLang, t: (key: MessageKey, vars?: Vars) => translate(key, vars) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

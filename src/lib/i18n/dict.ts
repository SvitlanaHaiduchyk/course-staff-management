/**
 * Мова інтерфейсу: українська або англійська.
 *
 * **Чого тут НЕМАЄ і не може бути — текстів із AC.** «Tell the employee what to fix»,
 * «No records awaiting decision», «Awaiting decision», «My requests», «Sick leave»,
 * «Approved» — це дослівні тексти вимог PM. Вони однакові в обох мовах: переклад
 * будь-якого з них ламає AC і приймання (…spec#14). Такі рядки живуть у
 * `lib/leave/decision.ts`, `lib/leave/balance.ts` і `lib/leave/validate.ts`, і
 * сюди не потрапляють — це стереже `tests/i18n.test.ts`.
 *
 * Тут лише обрамлення: заголовки стовпців, кнопки, підписи полів, порожні стани.
 *
 * Вибір мови не записано у вимогах PM — питання до нього відкрите
 * (`docs/spec-reading.md`). Поки вмикаємо перемикач і типово показуємо українську.
 */

export const LANGS = ["uk", "en"] as const;
export type Lang = (typeof LANGS)[number];

/** Мова, якою показуємо інтерфейс, поки людина не вибрала іншу. */
export const DEFAULT_LANG: Lang = "uk";

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

const UK = {
  "lang.switch": "Мова інтерфейсу",
  "lang.uk": "UKR",
  "lang.en": "ENG",

  "login.title": "Вхід",
  "login.password": "Пароль",
  "login.submit": "Увійти",
  "login.error.missing": "Вкажіть email і пароль.",
  "login.error.invalid": "Невірний email або пароль.",

  "home.title": "Особиста інформація",
  "home.name": "Ім'я",
  "home.positions": "Посади",
  "home.access": "Доступ",
  "home.position.main": "основна",
  "home.position.additional": "додаткова",
  "role.employee": "Працівник",
  "role.manager": "Менеджер",
  "role.admin": "Адміністратор",
  "role.unknown": "профіль не знайдено",

  "schedule.title": "Мій розклад",
  "schedule.week": "Тиждень",
  "schedule.prev": "Попередній тиждень",
  "schedule.next": "Наступний тиждень",
  "schedule.thisWeek": "Цей тиждень",
  "schedule.dayOff": "Вихідний",
  "day.1": "Пн",
  "day.2": "Вт",
  "day.3": "Ср",
  "day.4": "Чт",
  "day.5": "Пт",
  "day.6": "Сб",
  "day.7": "Нд",
  "schedule.none": "розкладу немає",
  "schedule.legend.work": "Робочі години",
  "schedule.legend.leave": "Відпустка — тип і статус написано в самій смузі",

  "nav.requests": "Мої заявки на відпустку",
  "nav.balances": "Мої залишки",
  "nav.main": "Основна навігація",
  "nav.home": "На головну",
  "nav.decisions": "До списку на розгляді",
  "nav.signOut": "Вийти",

  "requests.new": "Нова заявка",
  "requests.date1": "Дата (цілий день)",
  "requests.date2": "Ще дата (не обов'язково)",
  "requests.calendar": "Обрати в календарі",
  "requests.prevMonth": "Попередній місяць",
  "requests.nextMonth": "Наступний місяць",
  "requests.dateHint":
    "Обирайте день, що є в розкладі вище. Дата без робочих годин відпаде з повідомленням, а решта дат заявки лишаться.",
  "requests.type": "Тип відпустки",
  "requests.relation": "Ступінь спорідненості (лише для Family celebration)",
  "requests.comment": "Коментар (до 500 символів)",
  "requests.submit": "Подати заявку",
  "requests.noPositions": "У вас ще немає посад з розкладом. Їх створює адміністратор (зріз WS10).",
  "requests.mine": "Мої записи",
  "requests.empty": "Записів ще немає.",
  "requests.resubmit": "Подати знову",
  "requests.saveHours": "Зберегти години",

  "table.date": "Дата",
  "table.hours": "Години",
  "table.position": "Посада",
  "table.type": "Тип",
  "table.status": "Статус",
  "table.chargedAndComment": "Списано й коментар",
  "table.actions": "Дії",
  "table.employee": "Працівник",
  "table.dateAndHours": "Дата й години",
  "table.typeAndComment": "Тип і коментар",
  "table.decision": "Рішення",
  "table.when": "Коли",
  "table.employeeAndRecord": "Працівник і запис",
  "table.comment": "Коментар",

  "decisions.awaiting": "На розгляді",
  "decisions.history": "Ухвалені рішення",
  "decisions.historyEmpty": "Рішень ще немає.",
  "decisions.comment": "Коментар",
  "decisions.commentOptional": "Коментар (необов'язковий)",
  "decisions.commentHintOptional": "Видно працівнику в «My requests»",
  "decisions.cancel": "Скасувати",
  "decisions.forbidden":
    "Рішення по записах ухвалює відповідальний менеджер посади або адміністратор.",
  "decisions.balancesLink": "Залишки",

  "balances.schoolYear": "Навчальний рік",
  "balances.employee": "Залишки працівника",
  "balances.forbidden":
    "Залишки працівника бачить він сам, відповідальний менеджер будь-якої його посади й адміністратор.",
  "balances.type": "Тип відпустки",
  "balances.granted": "Надано",
  "balances.carried": "Перенесено",
  "balances.used": "Використано",
  "balances.remaining": "Залишилось",
} as const;

export type MessageKey = keyof typeof UK;

/** `Record<MessageKey, string>` не дасть забути ключ: без нього не збереться типізація. */
const EN: Record<MessageKey, string> = {
  "lang.switch": "Interface language",
  "lang.uk": "UKR",
  "lang.en": "ENG",

  "login.title": "Sign in",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.error.missing": "Enter the email and the password.",
  "login.error.invalid": "Wrong email or password.",

  "home.title": "Personal information",
  "home.name": "Name",
  "home.positions": "Positions",
  "home.access": "Access",
  "home.position.main": "main",
  "home.position.additional": "additional",
  "role.employee": "Employee",
  "role.manager": "Manager",
  "role.admin": "Administrator",
  "role.unknown": "profile not found",

  "schedule.title": "My schedule",
  "schedule.week": "Week",
  "schedule.prev": "Previous week",
  "schedule.next": "Next week",
  "schedule.thisWeek": "This week",
  "schedule.dayOff": "Day off",
  "day.1": "Mon",
  "day.2": "Tue",
  "day.3": "Wed",
  "day.4": "Thu",
  "day.5": "Fri",
  "day.6": "Sat",
  "day.7": "Sun",
  "schedule.none": "no schedule",
  "schedule.legend.work": "Working hours",
  "schedule.legend.leave": "Leave — the type and the status are written on the bar",

  "nav.requests": "My requests",
  "nav.balances": "My balances",
  "nav.main": "Main navigation",
  "nav.home": "Home",
  "nav.decisions": "To the Awaiting decision list",
  "nav.signOut": "Sign out",

  "requests.new": "New request",
  "requests.date1": "Date (whole day)",
  "requests.date2": "Another date (optional)",
  "requests.calendar": "Pick in calendar",
  "requests.prevMonth": "Previous month",
  "requests.nextMonth": "Next month",
  "requests.dateHint":
    "Pick a day that is in the schedule above. A date with no working hours is dropped with a message, and the other dates of the request stay.",
  "requests.type": "Leave type",
  "requests.relation": "Relation (only for Family celebration)",
  "requests.comment": "Comment (up to 500 characters)",
  "requests.submit": "Submit the request",
  "requests.noPositions":
    "You have no positions with a schedule yet. The administrator creates them (slice WS10).",
  "requests.mine": "My records",
  "requests.empty": "No records yet.",
  "requests.resubmit": "Submit again",
  "requests.saveHours": "Save the hours",

  "table.date": "Date",
  "table.hours": "Hours",
  "table.position": "Position",
  "table.type": "Type",
  "table.status": "Status",
  "table.chargedAndComment": "Charged and comment",
  "table.actions": "Actions",
  "table.employee": "Employee",
  "table.dateAndHours": "Date and hours",
  "table.typeAndComment": "Type and comment",
  "table.decision": "Decision",
  "table.when": "When",
  "table.employeeAndRecord": "Employee and record",
  "table.comment": "Comment",

  "decisions.awaiting": "Awaiting decision",
  "decisions.history": "Decision history",
  "decisions.historyEmpty": "No decisions yet.",
  "decisions.comment": "Comment",
  "decisions.commentOptional": "Comment (optional)",
  "decisions.commentHintOptional": 'Visible to the employee in "My requests"',
  "decisions.cancel": "Cancel",
  "decisions.forbidden":
    "Records are decided by a responsible manager of the position or by the administrator.",
  "decisions.balancesLink": "Balances",

  "balances.schoolYear": "School year",
  "balances.employee": "Employee balances",
  "balances.forbidden":
    "Balances are seen by the employee, a responsible manager of any of their positions and the administrator.",
  "balances.type": "Leave type",
  "balances.granted": "Granted",
  "balances.carried": "Carried over",
  "balances.used": "Used",
  "balances.remaining": "Remaining",
};

export const DICT: Record<Lang, Record<MessageKey, string>> = { uk: UK, en: EN };

/** Перекладач для однієї мови: `const m = messages(lang); m("nav.signOut")`. */
export function messages(lang: Lang): (key: MessageKey) => string {
  const table = DICT[lang] ?? DICT[DEFAULT_LANG];
  return (key) => table[key];
}

/** Тип посади → ключ підпису. Значення `main`/`additional` задає `positions.kind`. */
export function positionKindKey(kind: string): MessageKey {
  return kind === "main" ? "home.position.main" : "home.position.additional";
}

/** Короткі назви днів 1–7 цією мовою: індекс 0 порожній, як `schedule_blocks.weekday`. */
export function weekdayNames(lang: Lang): readonly string[] {
  const m = messages(lang);
  return ["", m("day.1"), m("day.2"), m("day.3"), m("day.4"), m("day.5"), m("day.6"), m("day.7")];
}

/** Локаль для Intl: нею форматуємо дати в підписі тижня. */
export const INTL_LOCALE: Record<Lang, string> = { uk: "uk-UA", en: "en-GB" };

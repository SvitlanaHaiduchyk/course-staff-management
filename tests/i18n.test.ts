/**
 * Мова інтерфейсу. Назви тестів без AC ID: вибір мови у вимогах PM не описаний,
 * і жоден AC її не задає (`ac:coverage` ці тести як покриття й не рахує).
 *
 * Головний тут — останній блок. Він стереже те, що легко зламати мовчки:
 * тексти з AC мають лишатися англійськими в обох мовах, бо PM звіряє їх
 * дослівно (…spec#14). Якщо колись хтось «перекладе» «Approved» або
 * «No records awaiting decision», цей тест має впасти раніше за приймання.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_LANG, DICT, LANGS, isLang, messages, weekdayNames } from "@/lib/i18n/dict";
import {
  LEAVE_TYPE_LABELS,
  managerSplitWarning,
  overBalanceWarning,
  splitLabel,
} from "@/lib/leave/balance";
import {
  NO_RECORDS_AWAITING,
  OWN_RECORD_NEEDS_ADMIN,
  RETURN_NEEDS_COMMENT,
  decisionLabel,
  statusLabel,
} from "@/lib/leave/decision";

describe("словник", () => {
  it("обидві мови мають однаковий набір ключів", () => {
    expect(Object.keys(DICT.en).sort()).toEqual(Object.keys(DICT.uk).sort());
  });

  it("жоден підпис не порожній", () => {
    const empty = LANGS.flatMap((lang) =>
      Object.entries(DICT[lang])
        .filter(([, value]) => value.trim() === "")
        .map(([key]) => `${lang}:${key}`),
    );
    expect(empty).toEqual([]);
  });

  it("українська й англійська справді різні, а не копія", () => {
    expect(messages("uk")("nav.signOut")).toBe("Вийти");
    expect(messages("en")("nav.signOut")).toBe("Sign out");
  });

  it("невідому мову з cookie не приймаємо", () => {
    expect(isLang("uk")).toBe(true);
    expect(isLang("en")).toBe(true);
    expect(isLang("de")).toBe(false);
    expect(isLang(undefined)).toBe(false);
  });

  it("перекладач невідомої мови падає назад на типову, а не ламає сторінку", () => {
    const broken = messages("de" as never);
    expect(broken("nav.signOut")).toBe(DICT[DEFAULT_LANG]["nav.signOut"]);
  });

  it("назви днів ідуть з індексу 1, як weekday у базі", () => {
    expect(weekdayNames("uk")[1]).toBe("Пн");
    expect(weekdayNames("en")[7]).toBe("Sun");
    expect(weekdayNames("en")[0]).toBe("");
  });
});

describe("тексти AC не потрапляють у словник", () => {
  /** Усе, що PM задає дослівно: статуси, рішення, типи відпустки, повідомлення. */
  const AC_TEXTS = [
    NO_RECORDS_AWAITING,
    RETURN_NEEDS_COMMENT,
    OWN_RECORD_NEEDS_ADMIN,
    ...["awaiting", "approved", "rejected", "returned", "cancelled"].map(statusLabel),
    ...(["approved", "rejected", "returned"] as const).map(decisionLabel),
    ...Object.values(LEAVE_TYPE_LABELS),
    splitLabel("personal", { onType: 50, unpaid: 50 }),
    overBalanceWarning("personal", 50, 100),
    managerSplitWarning("personal", 50, { onType: 50, unpaid: 50 }),
  ].filter((text): text is string => typeof text === "string" && text.length > 0);

  /**
   * Єдиний дозволений збіг. «Awaiting decision» — НАЗВА списку, і AC вживає її
   * як обставину («When the manager opens the "Awaiting decision" list»), а не
   * як текст, який перевіряють. Англійський заголовок має збігатися з
   * формулюванням PM саме тому. Твердження AC-DECIDE-14 — це повідомлення
   * `NO_RECORDS_AWAITING`, і воно англійське в обох мовах.
   */
  const ALLOWED = new Set(["en:decisions.awaiting"]);

  it("жоден підпис словника не дорівнює тексту з AC", () => {
    const clashes = LANGS.flatMap((lang) =>
      Object.entries(DICT[lang])
        .filter(([, value]) => AC_TEXTS.includes(value))
        .map(([key]) => `${lang}:${key}`),
    ).filter((clash) => !ALLOWED.has(clash));
    expect(clashes).toEqual([]);
  });

  it("статуси й типи відпустки лишаються англійськими — мова на них не впливає", () => {
    expect(statusLabel("approved")).toBe("Approved");
    expect(statusLabel("awaiting")).toBe("Awaiting decision");
    expect(LEAVE_TYPE_LABELS.sick).toBe("Sick leave");
    expect(NO_RECORDS_AWAITING).toBe("No records awaiting decision");
    expect(RETURN_NEEDS_COMMENT).toBe("Tell the employee what to fix");
  });
});

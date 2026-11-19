import { describe, expect, it } from "vitest";

import {
  decodeSuggestions,
  decodeText,
  encodeSuggestions,
  encodeText,
  suggestionsFromForm,
  withoutIndex,
} from "@/lib/leave/suggestions";
import { MAX_TEXT_LENGTH } from "@/lib/ai/prompts/closures";
import { todayInKyiv } from "@/lib/leave/today";
import type { SuggestedClosure } from "@/lib/ai/schema";

/**
 * Пропозиції між двома діями адміністратора: cookie й поля форми.
 *
 * Вимоги: `requirements/05-calendar-assistant.md` (знімок 2026-11-18).
 */

const WINTER: SuggestedClosure = {
  name: "Winter break",
  startsOn: "2026-12-28",
  endsOn: "2027-01-08",
  closesAt: null,
};

const MEETING: SuggestedClosure = {
  name: "Teachers' meeting",
  startsOn: "2026-11-20",
  endsOn: "2026-11-20",
  closesAt: "12:00",
};

function form(rows: readonly { name: string; startsOn: string; endsOn: string; closesAt: string }[], extra?: Record<string, string>) {
  const data = new FormData();
  for (const row of rows) {
    data.append("name", row.name);
    data.append("startsOn", row.startsOn);
    data.append("endsOn", row.endsOn);
    data.append("closesAt", row.closesAt);
  }
  for (const [key, value] of Object.entries(extra ?? {})) data.append(key, value);
  return data;
}

describe("пропозиції помічника: перенесення між діями", () => {
  it("AC-ASSIST-01: закодовані пропозиції повертаються без втрат", () => {
    const encoded = encodeSuggestions([WINTER, MEETING]);

    expect(encoded).not.toBeNull();
    expect(decodeSuggestions(encoded ?? undefined)).toEqual([WINTER, MEETING]);
  });

  it("AC-ASSIST-01: зіпсована cookie дає порожній список, а не падіння", () => {
    // Cookie приходить із браузера — це недовірені дані.
    expect(decodeSuggestions("не-base64")).toEqual([]);
    expect(decodeSuggestions(Buffer.from('{"status":"ok"}', "utf8").toString("base64url"))).toEqual([]);
    expect(decodeSuggestions(undefined)).toEqual([]);
  });

  it("AC-ASSIST-01: відповідь, яка не вміщається в cookie, не кодується", () => {
    // 4096 байтів — межа cookie разом з атрибутами; відповідь, якої не донести
    // до сторінки, для адміністратора нічим не краща за відсутню.
    const many = Array.from({ length: 200 }, () => WINTER);

    expect(encodeSuggestions(many)).toBeNull();
  });
});

describe("пропозиції помічника: виправлення у формі", () => {
  it("AC-ASSIST-03: беремо те, що адміністратор набрав, а не те, що запропонувала модель", () => {
    const data = form([{ name: "Winter holidays", startsOn: "2026-12-28", endsOn: "2027-01-08", closesAt: "" }]);

    expect(suggestionsFromForm(data)).toEqual([
      { name: "Winter holidays", startsOn: "2026-12-28", endsOn: "2027-01-08", closesAt: null },
    ]);
  });

  it("AC-ASSIST-03: час закриття у формі робить закриття одноденним", () => {
    // Адміністратор дописав час до багатоденного закриття — кінець підтягується
    // до початку, бо скорочений день завжди одна дата.
    const data = form([{ name: "Last day", startsOn: "2027-06-18", endsOn: "2027-06-25", closesAt: "13:00" }]);

    expect(suggestionsFromForm(data)).toEqual([
      { name: "Last day", startsOn: "2027-06-18", endsOn: "2027-06-18", closesAt: "13:00" },
    ]);
  });

  it("AC-ASSIST-03: прибирання не зачіпає сусідніх пропозицій", () => {
    expect(withoutIndex([WINTER, MEETING], 1)).toEqual([WINTER]);
    expect(withoutIndex([WINTER, MEETING], 0)).toEqual([MEETING]);
  });

  it("AC-ASSIST-03: чужий індекс нічого не прибирає", () => {
    expect(withoutIndex([WINTER, MEETING], 7)).toEqual([WINTER, MEETING]);
    expect(withoutIndex([WINTER, MEETING], Number.NaN)).toEqual([WINTER, MEETING]);
  });
});

describe("сьогодні для помічника", () => {
  it("AC-ASSIST-01: дата береться в київському часі, а не за UTC", () => {
    // 2026-11-13 о 00:30 за Києвом — це ще 2026-11-12 за UTC.
    // Без пояса помічник рахував би «yesterday» від учорашнього дня.
    expect(todayInKyiv(new Date("2026-11-12T22:30:00Z"))).toBe("2026-11-13");
    expect(todayInKyiv(new Date("2026-11-13T12:00:00Z"))).toBe("2026-11-13");
  });
});

describe("вставлений текст між проханнями", () => {
  it("AC-ASSIST-05: текст повертається без втрат, разом із переносами рядків", () => {
    // Знахідка рецензента UAT: після «бракує подробиць» поле було порожнім, і
    // дві тисячі символів доводилося вставляти наново.
    const text = "Winter break 28.12–08.01;\nTeachers' meeting 20.11 from 12:00";

    const encoded = encodeText(text);

    expect(encoded).not.toBeNull();
    expect(decodeText(encoded ?? undefined)).toBe(text);
  });

  it("AC-ASSIST-05: зіпсована cookie дає порожнє поле, а не падіння", () => {
    expect(decodeText(undefined)).toBe("");
    expect(decodeText("")).toBe("");
  });

  it("AC-ASSIST-10: текст із cookie обрізається тією самою межею, що й при поданні", () => {
    // Cookie приходить із браузера: її могли підмінити довшим текстом.
    const forged = Buffer.from("x".repeat(MAX_TEXT_LENGTH + 500), "utf8").toString("base64url");

    expect(decodeText(forged)).toHaveLength(MAX_TEXT_LENGTH);
  });

  it("AC-ASSIST-10: текст, що не вміщається в cookie, не кодується", () => {
    expect(encodeText("x".repeat(9000))).toBeNull();
  });
});

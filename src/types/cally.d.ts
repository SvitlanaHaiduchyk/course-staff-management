/**
 * Типи для кастомних елементів `cally` (MIT, https://github.com/WickyNilliams/cally).
 *
 * Бібліотека постачає веб-компоненти, а не React-компоненти, тож TypeScript
 * про теги `<calendar-date>` і `<calendar-month>` сам не знає. Тут — лише ті
 * властивості, які ми справді ставимо.
 */
import type { DetailedHTMLProps, HTMLAttributes } from "react";

type CallyElement<Extra> = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Extra;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "calendar-date": CallyElement<{
        value?: string;
        min?: string;
        max?: string;
        locale?: string;
        "first-day-of-week"?: number;
      }>;
      "calendar-month": CallyElement<Record<string, never>>;
    }
  }
}

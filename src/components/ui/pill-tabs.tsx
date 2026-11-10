import { cn } from "cn";

/** Один варіант вибору: що подасться у формі і що написано на пігулці. */
export type PillOption = {
  readonly value: string;
  readonly label: string;
};

/**
 * Вкладки-пігулки: вибір одного з кількох варіантів.
 *
 * Вигляд — елемент Uiverse: Astronaut (uiverse-astronaut),
 * https://uiverse.io/uiverse-astronaut/odd-bobcat-3, MIT License. CSS — у
 * `src/app/globals.css`, блок «Вкладки-пігулки»; кольори там зведено до
 * наших токенів.
 *
 * Усередині — звичайні `input[type=radio]` з одним `name`, тож компонент
 * працює в серверній формі без JavaScript і подається як звичайне поле.
 * Радіокнопки сховані прозорістю, а не `display: none`: вони лишаються в
 * порядку табуляції, стрілки перемикають вибір, а `:focus-visible` малює
 * кільце на пігулці (DESIGN.md, розділ 7).
 *
 * Підписи приходять готовими: тексти з критеріїв приймання (типи відпустки)
 * залишаються англійською в обох мовах інтерфейсу.
 */
export function PillTabs({
  name,
  options,
  defaultValue,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"fieldset">, "defaultValue"> & {
  name: string;
  options: readonly PillOption[];
  defaultValue?: string;
  label?: string;
}) {
  return (
    <fieldset className={cn("cir-tabs", className)} {...props}>
      {label ? <legend className="sr-only">{label}</legend> : null}
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        return (
          <span key={option.value} className="contents">
            <input
              className="cir-tabs__r"
              type="radio"
              id={id}
              name={name}
              value={option.value}
              defaultChecked={option.value === defaultValue}
            />
            <label className="cir-tabs__t" htmlFor={id}>
              {option.label}
            </label>
          </span>
        );
      })}
    </fieldset>
  );
}

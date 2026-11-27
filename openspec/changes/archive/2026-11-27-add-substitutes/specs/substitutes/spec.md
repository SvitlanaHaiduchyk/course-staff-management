# substitutes

## Purpose

Менеджер веде список можливих замін кожного працівника, працівник обирає заміну на кожен запис відпустки, портал не приймає заміну, зайняту в цей час, а запис, де асистент підміняє вчителя, несе позначку «With upgrade» з хвилинами.

## ADDED Requirements

### Requirement: Менеджер веде список замін працівника

WHEN відповідальний менеджер однієї з посад працівника або адміністратор додає людей до списку замін цього працівника, the system SHALL показувати в списку замін цього працівника саме їх.

#### Scenario: AC-SUBST-01 Менеджер додає двох людей до порожнього списку

- **GIVEN** manager1@example.test — менеджер основної посади teacher1@example.test, а список замін teacher1@example.test порожній
- **WHEN** manager1@example.test додає assistant1@example.test і teacher2@example.test до списку замін teacher1@example.test
- **THEN** список замін teacher1@example.test показує рівно assistant1@example.test і teacher2@example.test

### Requirement: Працівник обирає заміну на запис зі свого списку

WHEN працівник обирає заміну для запису заявки, the system SHALL пропонувати рівно тих людей, які є в списку замін цього працівника, і зберігати обрану заміну в записі, видиму й менеджерові, що вирішує.

#### Scenario: AC-SUBST-02 Запис створено із заміною, менеджер її бачить

- **GIVEN** список замін teacher1@example.test зі сценарію AC-SUBST-01 і основна посада з розкладом Пн–Пт 08:30–15:30
- **WHEN** teacher1@example.test подає «Personal leave» на цілий день середу 2026-12-02, обирає заміну assistant1@example.test і підтверджує підсумок
- **THEN** створено 1 запис 2026-12-02 08:30–15:30 зі статусом «Awaiting decision» і заміною assistant1@example.test
- **AND** manager1@example.test бачить цю заміну на тому записі в «Awaiting decision»

#### Scenario: AC-SUBST-04 Вибір пропонує лише людей зі списку

- **GIVEN** список замін teacher1@example.test зі сценарію AC-SUBST-01 і працівник teacher3@example.test, якого в ньому немає
- **WHEN** teacher1@example.test обирає заміну для запису
- **THEN** вибір пропонує рівно assistant1@example.test і teacher2@example.test
- **AND** teacher3@example.test не пропонується

### Requirement: Заміна необов'язкова

WHERE працівник не обрав заміни, the system SHALL створити запис і показувати на ньому «No substitute» і працівникові, і менеджерові.

#### Scenario: AC-SUBST-03 Запис без заміни

- **GIVEN** список замін teacher1@example.test зі сценарію AC-SUBST-01
- **WHEN** teacher1@example.test подає заявку на цілий день 2026-12-02, не обравши заміни, і підтверджує підсумок
- **THEN** запис створено
- **AND** teacher1@example.test і manager1@example.test бачать на ньому «No substitute»

### Requirement: Зайнята заміна не приймається

IF обрана заміна в будь-яку хвилину запису має власний запис або є заміною в іншому записі зі статусом «Awaiting decision», «Returned for revision» чи «Approved», THEN the system SHALL не створити заявки й показати повідомлення «<адреса заміни> is not available at this time: <дата> <початок>–<кінець>» для першого за часом такого запису.

#### Scenario: AC-SUBST-05 Заміна має власний запис у цей час

- **GIVEN** assistant1@example.test має власний запис 2026-12-02 09:00–11:00 зі статусом «Awaiting decision»
- **WHEN** teacher1@example.test обирає assistant1@example.test заміною для запису 2026-12-02 08:30–15:30 і підтверджує
- **THEN** заявки не створено
- **AND** teacher1@example.test бачить повідомлення «assistant1@example.test is not available at this time: 2026-12-02 09:00–11:00»

#### Scenario: AC-SUBST-06 Заміна вже підміняє іншого працівника в цей час

- **GIVEN** assistant1@example.test є заміною в записі teacher2@example.test 2026-12-02 10:00–12:00 зі статусом «Approved»
- **WHEN** teacher1@example.test обирає assistant1@example.test заміною для запису 2026-12-02 08:30–15:30 і підтверджує
- **THEN** заявки не створено
- **AND** teacher1@example.test бачить повідомлення «assistant1@example.test is not available at this time: 2026-12-02 10:00–12:00»

### Requirement: Відхилений запис зайнятості не створює

WHERE єдиний запис обраної заміни на цю дату має статус «Rejected», the system SHALL створити запис із цією заміною.

#### Scenario: AC-SUBST-07 Відхилений запис заміни не заважає

- **GIVEN** єдиний запис assistant1@example.test на 2026-12-02 має статус «Rejected»
- **WHEN** teacher1@example.test обирає assistant1@example.test заміною для запису 2026-12-02 08:30–15:30 і підтверджує
- **THEN** запис створено із заміною assistant1@example.test

### Requirement: Асистент замість вчителя — позначка підвищення

WHERE назва посади відсутнього працівника в цьому записі містить «Teacher», а назва основної посади заміни — «Assistant», the system SHALL показувати на записі позначку «With upgrade» з хвилинами цього запису.

#### Scenario: AC-SUBST-08 Асистент підміняє вчителя

- **GIVEN** посада teacher1@example.test — «Elementary school / Teacher», а основна посада assistant1@example.test — «Elementary school / Assistant»
- **WHEN** teacher1@example.test подає заявку на 2026-12-02 з 08:30 до 12:00 із заміною assistant1@example.test і підтверджує
- **THEN** запис показує заміну assistant1@example.test і позначку «With upgrade: 210 min»

#### Scenario: AC-SUBST-09 Вчитель підміняє вчителя — позначки немає

- **GIVEN** основна посада teacher2@example.test — «High school / Math teacher»
- **WHEN** teacher1@example.test подає заявку на 2026-12-02 з 08:30 до 12:00 із заміною teacher2@example.test і підтверджує
- **THEN** запис показує заміну teacher2@example.test
- **AND** запис не має позначки «With upgrade»

### Requirement: Людина бачить свої заміни

WHEN людина відкриває «Мої заміни», the system SHALL показувати записи, де вона є заміною, — дату, час, працівника і статус запису.

#### Scenario: AC-SUBST-10 Один рядок у «Моїх замінах»

- **GIVEN** запис зі сценарію AC-SUBST-02
- **WHEN** assistant1@example.test відкриває «Мої заміни»
- **THEN** assistant1@example.test бачить 1 рядок: 2026-12-02 08:30–15:30, teacher1@example.test, статус «Awaiting decision»

### Requirement: Нікого не підміняє — порожній стан

WHERE людина не є заміною в жодному записі зі статусом «Awaiting decision», «Returned for revision» чи «Approved», the system SHALL показати в «Моїх замінах» повідомлення «You are not covering for anyone».

#### Scenario: AC-SUBST-15 Порожні «Мої заміни»

- **GIVEN** assistant1@example.test не є заміною в жодному записі зі статусом «Awaiting decision», «Returned for revision» чи «Approved»
- **WHEN** assistant1@example.test відкриває «Мої заміни»
- **THEN** assistant1@example.test бачить повідомлення «You are not covering for anyone»

### Requirement: Порожній список замін не заважає заявці

WHERE список замін працівника порожній, the system SHALL замість вибору заміни показати повідомлення «Your manager has not added substitutes for you yet» і дозволити підтвердити заявку з «No substitute».

#### Scenario: AC-SUBST-11 Заявка з порожнім списком замін

- **GIVEN** список замін teacher1@example.test порожній
- **WHEN** teacher1@example.test подає заявку на цілий день 2026-12-02
- **THEN** замість вибору замін teacher1@example.test бачить повідомлення «Your manager has not added substitutes for you yet»
- **AND** заявку все одно можна підтвердити з «No substitute»

### Requirement: Список замін змінює лише менеджер позиції або адміністратор

IF список замін працівника намагається змінити той, хто не є ні відповідальним менеджером жодної з його посад, ні адміністратором, THEN the system SHALL не змінити списку.

#### Scenario: AC-SUBST-12 Працівник за прямим посиланням

- **GIVEN** teacher1@example.test у порталі й має лише роль працівника
- **WHEN** teacher1@example.test відкриває за прямим посиланням список замін teacher2@example.test для зміни
- **THEN** teacher1@example.test бачить повідомлення «Only the manager of this employee's position can change the substitute list»
- **AND** список замін teacher2@example.test не змінився

#### Scenario: AC-SUBST-13 Менеджер чужих позицій повз сторінки порталу

- **GIVEN** manager2@example.test не є менеджером жодної з посад teacher1@example.test
- **WHEN** manager2@example.test намагається додати teacher3@example.test до списку замін teacher1@example.test, минаючи сторінки порталу
- **THEN** список замін teacher1@example.test не змінився і далі показує рівно assistant1@example.test і teacher2@example.test

### Requirement: «Мої заміни» лише для авторизованих

IF «Мої заміни» відкриває неавторизований відвідувач, THEN the system SHALL показати сторінку входу й не показати жодного запису чи імені.

#### Scenario: AC-SUBST-14 Неавторизований за прямим посиланням

- **GIVEN** ніхто не увійшов
- **WHEN** відвідувач відкриває «Мої заміни» за прямим посиланням
- **THEN** відвідувач бачить сторінку входу
- **AND** жодних записів і імен не показано

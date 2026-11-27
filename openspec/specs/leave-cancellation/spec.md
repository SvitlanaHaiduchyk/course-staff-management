# leave-cancellation Specification

## Purpose
Погоджений запис із датою сьогодні або пізніше можна скасувати: працівник просить про це з причиною, менеджер підтверджує або відхиляє з коментарем, а може скасувати запис і сам із приміткою. Підтверджене скасування повертає дні в залишок і звільняє дату.

## Requirements

### Requirement: Працівник просить скасувати погоджений запис

WHEN працівник просить скасувати власний погоджений запис із датою сьогодні або пізніше й вказує причину, the system SHALL лишити записові статус «Approved» з позначкою «Cancellation requested» і показати його менеджерові в «Awaiting decision» разом із причиною.

#### Scenario: AC-CANCEL-01 Запит на скасування майбутнього запису

- **GIVEN** сьогодні 2026-12-01, а teacher1@example.test має запис 2026-12-10 «Personal leave» 08:30–15:30 зі статусом «Approved»
- **WHEN** teacher1@example.test просить скасувати його з причиною «Plans changed»
- **THEN** teacher1@example.test бачить запис зі статусом «Approved» і позначкою «Cancellation requested»
- **AND** manager1@example.test бачить його в «Awaiting decision» із «Cancellation requested: Plans changed»

### Requirement: Підтверджене скасування повертає дні в залишок

WHEN менеджер підтверджує запит на скасування, the system SHALL змінити статус запису на «Cancelled» і повернути його дні в залишок того навчального року, до якого належить дата запису.

#### Scenario: AC-CANCEL-02 Дні повертаються в залишок

- **GIVEN** запит зі сценарію AC-CANCEL-01, а «Personal leave» teacher1@example.test показує використано 3.00, залишок 15.00
- **WHEN** manager1@example.test підтверджує скасування
- **THEN** запис має статус «Cancelled»
- **AND** «Personal leave» teacher1@example.test показує використано 2.00, залишок 16.00

#### Scenario: AC-CANCEL-07 Розділений запис повертає обидві частини

- **GIVEN** цілоденний запис «Personal leave» погоджено з розподілом «0.50 Personal leave + 0.50 Unpaid leave» (як в AC-BALANCE-10) і датою в майбутньому
- **WHEN** менеджер підтверджує його скасування
- **THEN** використано «Personal leave» меншає на 0.50
- **AND** використано «Unpaid leave» меншає на 0.50

### Requirement: Відхилений запит лишає запис погодженим

WHEN менеджер відхиляє запит на скасування з коментарем, the system SHALL лишити записові статус «Approved», прибрати позначку «Cancellation requested» і показати працівникові цей коментар.

#### Scenario: AC-CANCEL-03 Відхилення з коментарем

- **GIVEN** запит зі сценарію AC-CANCEL-01
- **WHEN** manager1@example.test відхиляє його з коментарем «Exam week»
- **THEN** запис зберігає статус «Approved» без позначки «Cancellation requested»
- **AND** teacher1@example.test бачить на ньому «Cancellation declined: Exam week»

### Requirement: Відхилення без коментаря не приймається

IF менеджер відхиляє запит на скасування без коментаря, THEN the system SHALL не змінити запиту й показати менеджерові повідомлення «Tell the employee why the cancellation is declined».

#### Scenario: AC-CANCEL-04 Відхилення без коментаря

- **GIVEN** запит зі сценарію AC-CANCEL-01
- **WHEN** manager1@example.test відхиляє його без коментаря
- **THEN** запис і далі показує «Cancellation requested»
- **AND** manager1@example.test бачить повідомлення «Tell the employee why the cancellation is declined»

### Requirement: Запис у минулому не скасовується

IF працівник просить скасувати погоджений запис із датою, ранішою за сьогодні, THEN the system SHALL не створити запиту, лишити записові статус «Approved» і показати повідомлення «Records in the past cannot be cancelled».

#### Scenario: AC-CANCEL-05 Запис учорашнього тижня

- **GIVEN** сьогодні 2026-12-01, а teacher1@example.test має запис 2026-11-27 зі статусом «Approved»
- **WHEN** teacher1@example.test намагається попросити його скасування
- **THEN** запиту на скасування не створено, запис зберігає статус «Approved»
- **AND** teacher1@example.test бачить повідомлення «Records in the past cannot be cancelled»

### Requirement: Другий запит на скасування не створюється

IF працівник просить скасувати запис, який уже має позначку «Cancellation requested», THEN the system SHALL не створити другого запиту й показати повідомлення «Cancellation has already been requested».

#### Scenario: AC-CANCEL-06 Повторний запит

- **GIVEN** запис зі сценарію AC-CANCEL-01 уже має позначку «Cancellation requested»
- **WHEN** teacher1@example.test просить скасувати його ще раз
- **THEN** teacher1@example.test бачить повідомлення «Cancellation has already been requested»
- **AND** запит і далі один

### Requirement: Менеджер скасовує погоджений запис із приміткою

WHEN менеджер скасовує погоджений запис своєї посади з приміткою до працівника, the system SHALL змінити статус запису на «Cancelled» і показати працівникові цю примітку в «Моїх заявках».

#### Scenario: AC-CANCEL-08 Скасування менеджером

- **GIVEN** сьогодні 2026-12-01, а teacher1@example.test має запис 2026-12-10 зі статусом «Approved»
- **WHEN** manager1@example.test скасовує його з приміткою «Event moved to January»
- **THEN** запис має статус «Cancelled»
- **AND** teacher1@example.test бачить на ньому примітку «Event moved to January» у «Моїх заявках»

### Requirement: Скасування менеджером без примітки не приймається

IF менеджер скасовує погоджений запис без примітки, THEN the system SHALL лишити записові статус «Approved» і показати менеджерові повідомлення «Tell the employee why the record is cancelled».

#### Scenario: AC-CANCEL-09 Скасування без примітки

- **GIVEN** запис зі сценарію AC-CANCEL-08 зі статусом «Approved»
- **WHEN** manager1@example.test намагається скасувати його без примітки
- **THEN** запис зберігає статус «Approved»
- **AND** manager1@example.test бачить повідомлення «Tell the employee why the record is cancelled»

### Requirement: Скасувати можна лише власний запис

IF працівник відкриває скасування чужого запису, THEN the system SHALL не створити запиту, лишити записові статус «Approved» без позначки скасування й показати повідомлення «You can cancel only your own records».

#### Scenario: AC-CANCEL-10 Чужий запис за прямим посиланням

- **GIVEN** teacher1@example.test має запис 2026-12-10 зі статусом «Approved»
- **WHEN** teacher2@example.test відкриває скасування цього запису за прямим посиланням
- **THEN** teacher2@example.test бачить повідомлення «You can cancel only your own records»
- **AND** запис зберігає статус «Approved» без запиту на скасування

### Requirement: Запит вирішує лише менеджер посади запису або адміністратор

IF запит на скасування намагається вирішити той, хто не є ні відповідальним менеджером посади цього запису, ні заступником на цей день, ні адміністратором, THEN the system SHALL не змінити ні запису, ні залишків працівника.

#### Scenario: AC-CANCEL-11 Менеджер чужої позиції повз сторінки порталу

- **GIVEN** запит зі сценарію AC-CANCEL-01, а manager2@example.test не є менеджером посади цього запису
- **WHEN** manager2@example.test намагається підтвердити скасування, минаючи сторінки порталу
- **THEN** запис зберігає статус «Approved» із позначкою «Cancellation requested»
- **AND** залишки teacher1@example.test не змінилися

### Requirement: Скасування лише для авторизованих

IF скасування запису відкриває неавторизований відвідувач, THEN the system SHALL показати сторінку входу й не показати запису.

#### Scenario: AC-CANCEL-12 Неавторизований за прямим посиланням

- **GIVEN** ніхто не увійшов
- **WHEN** відвідувач відкриває скасування запису за прямим посиланням
- **THEN** відвідувач бачить сторінку входу
- **AND** жодного запису не показано

### Requirement: Скасований запис звільняє дату для шкільного календаря

WHERE на дату не лишилося жодного запису, крім скасованих, the system SHALL дозволити адміністраторові додати закриття на цю дату.

#### Scenario: AC-CANCEL-13 Закриття на звільнену дату

- **GIVEN** запис 2026-12-10 скасовано у сценарії AC-CANCEL-02, а інших записів на 2026-12-10 немає
- **WHEN** адміністратор додає закриття «Staff day» на 2026-12-10
- **THEN** закриття збережено
- **AND** шкільний календар показує «Staff day» на 2026-12-10

# leave-request

## ADDED Requirements

### Requirement: Нагадування про довгу Personal leave

WHERE «Personal leave» цієї заявки разом дає 2.00 дня або більше, the system SHALL показати у зведенні нагадування «Personal leave of 2 days or more: please talk to the administrator before you go» і не завадити підтвердженню заявки.

#### Scenario: AC-LEAVE-23 Два цілі дні дають нагадування

- **GIVEN** працівник має розклад пн–пт 08:30–15:30
- **WHEN** працівник подає заявку «Personal leave» на цілі дні понеділок 2026-12-07 і вівторок 2026-12-08 (2.00 дня) і відкриває зведення
- **THEN** працівник бачить нагадування «Personal leave of 2 days or more: please talk to the administrator before you go»
- **AND** після підтвердження заявку створено з 2 записами

#### Scenario: AC-LEAVE-24 Півтора дня нагадування не дають

- **GIVEN** працівник має розклад пн–пт 08:30–15:30
- **WHEN** працівник подає заявку «Personal leave» на цілий день 2026-12-07 і на 2026-12-08 з 08:30 до 12:00 (разом 1.50 дня) і відкриває зведення
- **THEN** працівник не бачить нагадування про «Personal leave» від двох днів

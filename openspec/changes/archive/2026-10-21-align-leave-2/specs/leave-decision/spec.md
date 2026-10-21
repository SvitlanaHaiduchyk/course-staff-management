# leave-decision

## ADDED Requirements

### Requirement: Необов'язковий коментар менеджера до рішення

WHERE менеджер додав коментар, погоджуючи або відхиляючи запис, the system SHALL зберегти його на записі й показати працівникові в «My requests»; для цих двох рішень коментар необов'язковий, на відміну від повернення на доопрацювання.

#### Scenario: AC-DECIDE-23 Відхилення з коментарем

- **GIVEN** запис зі статусом «Awaiting decision»
- **WHEN** менеджер відхиляє його з коментарем «Not enough staff that day»
- **THEN** запис має статус «Rejected»
- **AND** працівник бачить коментар «Not enough staff that day» у «My requests»

#### Scenario: AC-DECIDE-24 Погодження з коментарем

- **GIVEN** запис зі статусом «Awaiting decision»
- **WHEN** менеджер погоджує його з коментарем «Get well soon»
- **THEN** запис має статус «Approved»
- **AND** працівник бачить коментар «Get well soon» у «My requests»

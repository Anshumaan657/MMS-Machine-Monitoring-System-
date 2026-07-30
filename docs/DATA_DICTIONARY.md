# Data dictionary

The canonical model keeps record-level evidence. Every record contains a
stable ID, source sheet and source row so a displayed result can be traced back
to the workbook.

## Production identity

| Field | Internal form | Meaning |
|---|---|---|
| `id` | string | Stable record identifier |
| `sourceSheet` | fixed string | `Product Log Book` |
| `sourceRow` | integer | Original worksheet row |
| `date` | ISO date or null | Production date |
| `startAt`, `endAt` | ISO date-time or null | Product interval boundaries |
| `machine` | string | Machine identifier/name |
| `machineType` | string or null | Optional machine classification |
| `shift` | string | Shift name/number |
| `product` | object | Part and product references |
| `operator` | object | Raw operator value, normalized names and missing flag |

## Product fields

| Field | Meaning |
|---|---|
| `partNumber` | Part number/code |
| `partName` | Part description |
| `partErpCode` | Part-level ERP code |
| `productName` | Product name; `NULL` and `NULL TURN` are preserved |
| `erpCode` | Product-level ERP code |

## Production time fields

All internal values are seconds or `null`.

| Workbook field | Internal field | Meaning |
|---|---|---|
| Shift Time | `shift` | Complete shift duration |
| Allowed Time | `allowed` | Planned allowance for meals/other approved activity |
| Opr. Time | `operative` | Machine-running duration |
| Non Opr. Time | `nonOperative` | Short non-operative duration |
| Down Time | `downtime` | Longer stopped duration |
| System Off | `systemOff` | Period during which machine data was unavailable |
| Setup Time | `setup` | Standard product-change/setup duration |
| Additional Over Time | `additionalOvertime` | Threshold separating short and long stops |
| Prod Gap Between | `productionGap` | Allowed time between produced parts |

## Cycle-time fields

All values are seconds or `null`.

| Workbook field | Internal field | Meaning |
|---|---|---|
| Std. Cycle Time | `standard` | Management-approved standard |
| Approved Cycle Time | `approved` | Client-approved cycle time |
| Achieve Cycle Time | `achieved` | Cycle time reported by MMS |

## Quantity and quality fields

| Workbook field | Internal field | Meaning |
|---|---|---|
| Stroke | `stroke` | Machine stroke/counter value |
| M. Factor | `multiplier` | Validation multiplier |
| Qty | `reported` | Authoritative production quantity |
| Stroke × M. Factor | `calculatedFromStroke` | Validation-only comparison quantity |
| Shift Target | `shiftTarget` | Reported or policy-calculated target context |
| Opr. Time Target | `operativeTimeTarget` | Expected quantity during operative time |
| Product Loss | `productionLoss` | Difference between target and produced quantity |
| Reject Qty | `rejected` | Rejected production |
| Rework Qty | `reworked` | Production requiring rework |
| Error Stroke | `errorStroke` | Reported counter error |
| Scrap part | `scrapPerPart` | Scrap quantity/weight per produced part |

Blank rejection/rework is unknown. It must not be treated as confirmed zero.

## Cost fields

| Workbook field | Internal field | Meaning |
|---|---|---|
| Part Cost | `part` | Cost per part |
| Component Cost | `component` | Component/material cost |
| Running Hrs Cost | `machinePerHour` | Machine operating cost per hour |
| Operator Per Hrs Cost | `operatorPerHour` | Operator cost per hour |

## Downtime event

| Field | Meaning |
|---|---|
| `id` | Stable event identifier |
| `sourceRow` | Original `Down Time Details` row |
| `date` | Event date |
| `startAt`, `endAt` | Event boundaries |
| `durationSeconds` | Continuous event duration in seconds |
| `machine`, `shift` | Event context |
| `productName` | Product active during event, when available |
| `operator` | Operator reference and missing status |
| `reasonType` | Downtime classification/category |
| `reason` | Reported root cause |
| `isUnreported` | True when no usable reason was entered |
| `reportedMachineHourLoss` | Workbook `Revenue`/loss value |

## Data-quality evidence

Every structured finding contains:

- severity and trust status;
- machine, shift, date/time and product;
- source sheet and row;
- field name;
- reported and expected values;
- recommended action;
- stable record and finding IDs.

The system reports questionable data but does not silently replace it.

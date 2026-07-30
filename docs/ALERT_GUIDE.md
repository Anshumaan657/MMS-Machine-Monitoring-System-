# Operational alert guide

Alerts are evidence-backed rule results. The alert count represents alert
instances under the active filters, not necessarily separate incidents. One
downtime event can trigger excessive downtime, financial loss and missing
reason alerts simultaneously.

## Default alerts

| Alert | Default severity | Trigger |
|---|---|---|
| Excessive downtime | Critical | Continuous event exceeds 3,600 seconds |
| System Off | Critical | Data-unavailable period exceeds 300 seconds |
| Production below target | Warning | Attainment is below 80% |
| Abnormal cycle time | Warning | Achieved cycle exceeds 120% of standard |
| High production loss | Critical | Production loss exceeds 50 units |
| High machine-hour loss | Critical | Calculated loss exceeds ₹1,000 |
| Missing machine data | Critical | Machine identifier is blank |
| Missing operator | Warning | Operator is blank or missing |
| Missing downtime reason | Warning | Reason is blank or `UNREPORTED` |
| Quantity mismatch | Warning | Reported Qty differs from Stroke × M. Factor |
| Inconsistent machine cost | Warning | A machine has conflicting hourly costs |
| Invalid duration | Critical | Event duration is missing or invalid |
| Stale synchronization | Warning | No fresh source data within the configured window |
| Database synchronization failure | Critical | Read-only database refresh fails or remains stale |

Thresholds, enabled states and severities are configurable in the alert
settings. Changes affect subsequent alert generation.

## Alert evidence

Every alert contains:

- stable alert ID and type;
- machine and shift;
- date/time;
- triggering value and unit;
- configured threshold;
- source sheet, row and record ID;
- active/resolved status;
- acknowledgement state.

## Lifecycle

### Active

The triggering condition exists in the current filtered/synchronized data.

### Acknowledged

A user has reviewed the alert. Acknowledgement does not change the calculation
or source record.

### Resolved

The alert condition no longer exists after a later import or synchronization.
The stable alert identity prevents duplicate lifecycle entries.

## Recommended response

### Critical

1. Confirm machine, shift and event time.
2. Open the supporting source record.
3. Check whether the issue is operational or invalid/missing data.
4. Assign an owner.
5. Correct the operational cause or source entry.
6. Refresh and confirm resolution.

### Warning

1. Validate the input field and threshold context.
2. Complete missing operator/reason/quality information.
3. Compare repeated occurrences by machine, product and shift.
4. Escalate recurring warnings even if no single occurrence is critical.

## Avoiding misleading alert counts

- Apply a specific date range before reviewing historical workbooks.
- Group by type and machine.
- Do not treat several alerts from one supporting record as several independent
  stoppages.
- Do not interpret missing-data warnings as confirmed machine failure.
- Export the Alerts and Data-Quality Findings worksheets for investigation.

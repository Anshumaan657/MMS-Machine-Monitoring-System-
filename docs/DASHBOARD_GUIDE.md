# Dashboard guide

## Starting a session

1. Open the application.
2. Choose **Connect workbook**.
3. Select a compatible MMS workbook.
4. Review the data source, date range and synchronization time.
5. Open **Data Quality** before making operational decisions.

## Navigation

The sidebar expands when the pointer or keyboard focus enters it. It collapses
to icons when the pointer leaves, preserving chart space.

### Overview

Shows production health and priority action areas:

- Availability, Performance, Quality and Final OEE readiness
- latest data and synchronization state
- production versus target trend
- operational action shortcuts
- machine-state summary
- current findings and management summary

Select **Customize layout** to reorder and resize Overview sections. Layout
preferences are stored in the browser. **Reset layout** restores defaults.

### Operational Alerts

Shows active and resolved alerts with:

- severity;
- machine, shift and time;
- triggering value and threshold;
- supporting record;
- acknowledgement state.

Filters can narrow the view by alert type or severity. Acknowledgement means
the alert has been reviewed; it does not correct the source condition.

### Downtime

Shows:

- event timeline;
- Non-Operative Time, Downtime and System Off separately;
- reason Pareto;
- machine ranking;
- financial loss;
- unreported reasons.

### Data Quality

Shows findings by severity and trust status, including quantity conflicts,
missing fields, overlaps, duplicates, inconsistent costs and stale data. Use
the source sheet and row to correct the MMS record.

### Machines

Shows calculated machine state, output, target, downtime, alerts and freshness.
Select a machine card to open its detailed side panel. Unsupported simulated
temperature, vibration, RPM, pressure and load values are intentionally absent.

### Daily Report

Shows daily and shift-level throughput, production loss, OEE readiness,
quality, downtime and financial loss. It provides **Export Excel (.xlsx)** and
**Print / Save PDF** actions.

## Filters

Primary filters remain visible:

- date range;
- machine;
- shift.

Advanced filters contain:

- products;
- operators;
- downtime reasons;
- data-trust status;
- alert severity where applicable.

Filters recalculate every metric, alert, summary and export from the same
record selection. **Clear filters** resets the scope. Filter state is preserved
in browser storage and URL-safe state where supported.

## Themes and accessibility

Use the top theme control to switch between dark and light modes. Both themes
use high-contrast semantic colors:

- green: normal/ready;
- amber: warning/review;
- red: critical/blocked;
- indigo: informational/selected.

All controls have keyboard focus states and accessible labels.

## Interpreting unavailable values

`N/A` or **Blocked** is preferable to a misleading number. Typical causes:

- missing rejection or rework input;
- zero produced quantity;
- invalid duration;
- unreliable source data;
- a provisional calculation policy.

Open the relevant Data Quality finding to see the reason and source record.

## Operational routine

1. Confirm last successful synchronization/import time.
2. Review critical alerts.
3. Review warning and data-quality findings.
4. Apply the required date, machine and shift filters.
5. Compare output, target, Availability and Performance.
6. Review Quality/OEE readiness.
7. Acknowledge reviewed alerts.
8. Export the filtered report.

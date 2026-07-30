# Project overview

## Purpose

The module converts MMS shop-floor exports into traceable operational
intelligence without modifying 3D's existing twelve-year MMS codebase. It is a
separate, read-only analytics layer.

## Business workflow

1. Machines and shop-floor devices create production and stoppage records.
2. MMS exports the records through Excel; a read-only MySQL source can be
   connected later after the schema is supplied.
3. The import contract validates sheets, columns, size and structure.
4. Records are converted into canonical production intervals and downtime
   events. Durations are represented internally in seconds.
5. The confirmed calculation policy produces production and OEE metrics.
6. The data-quality engine reports questionable source records without
   silently correcting them.
7. One analytics query applies the active filters to dashboards, alerts,
   summaries and exports.
8. Managers review results, acknowledge alerts and export an Excel or PDF
   report.

## Primary users

- Production managers monitoring output, loss and machine performance
- Supervisors reviewing downtime, missing reasons and operator entries
- Quality personnel reviewing rejection, rework and OEE readiness
- Management reading evidence-backed daily summaries
- Developers and administrators installing, verifying and maintaining the
  module

## Supported operating modes

- Local laptop with manual Excel upload
- Company PC or local company server
- Vercel deployment for approved non-confidential use
- Cloudflare/Vinext-compatible build
- Future read-only MySQL integration after 3D supplies schema and credentials

## Source of truth and trust model

- Reported Qty is authoritative for production calculations.
- `Stroke × M. Factor` is validation-only.
- Every structured finding retains machine, shift, time, source sheet and row.
- No source record is silently changed.
- AI is never allowed to calculate business metrics.
- Provisional policies are blocked in production.

## Current acceptance state

- Calculation policy `2.0.0` is confirmed.
- 120 automated tests pass.
- Cloudflare/Vinext and Vercel builds pass.
- The Phase 27 report, print and responsive checks pass.
- Final formal acceptance remains pending for private, representative
  side-by-side values checked against 3D's MMS interface.

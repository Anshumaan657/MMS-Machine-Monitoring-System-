# Phase 12 Verification and 3D Acceptance

Phase 12 verifies the MMS Intelligence Module at three levels.

## 1. Automated formula and integration tests

The normal test suite covers:

- Excel parsing and canonical data normalization
- legacy hours/minutes and cycle-time conversion to seconds
- production quantity, achieved cycle time, operative-time target and production-loss formulas
- Availability and Performance formulas and aggregation
- downtime threshold classification, System Off separation and event merging
- machine-hour financial loss
- date, shift, machine, product, operator and downtime-reason filters
- all seven Excel export worksheets and filtered export values
- read-only database schema mapping and Excel/database equivalence
- synchronization reconciliation and duplicate prevention
- operational-alert enable switches and configurable thresholds
- AI evidence references, strict response validation and deterministic fallback

Run:

```bash
npm test
```

## 2. Supplied-workbook agreement

The sample verification command parses the original `.xls` file and compares
calculated values against fields reported by the 3D MMS workbook export:

- Qty against Stroke × M. Factor
- Achieved Cycle Time
- Opr. Time Target
- Product Loss
- downtime Duration against event timestamps
- Revenue against calculated machine-hour loss where the cost context exists

Only records containing both a reported and calculated value enter the agreement
percentage. Missing references are marked `not_comparable`; they are never
treated as successful checks.

Run:

```bash
npm run verify:sample
```

The detailed JSON and Markdown reports are written to `verification-output/`.
This directory is ignored by Git because mismatch rows contain client machine,
shift and date identifiers.

## 3. Selected-result confirmation by 3D

Workbook agreement is provisional. Final acceptance requires 3D to choose
representative combinations covering:

- at least two machines with different production patterns
- Shift 1 and Shift 2
- one normal-production date
- one high-downtime date
- one interval containing System Off or missing data

For every selected case, 3D should provide the MMS values for Production, Shift
Target, Availability, Performance, Downtime Hours and Machine-Hour Loss.

Copy `verification/3d-selected-results.template.json` to:

```text
verification-input/3d-selected-results.json
```

Replace the placeholders with exact MMS filter names and values, then run:

```bash
npm run verify:sample
```

The selected-result agreement must be at least 95%. Any mismatch must retain:

1. the filter scope used in both systems;
2. expected and calculated values;
3. the confirmed cause;
4. the correction made;
5. the repeat-test result.

Strict acceptance can be checked with:

```bash
npm run verify:sample:strict
```

Strict verification fails until both workbook agreement and selected 3D
agreement meet the 95% target.

## Acceptance boundary

Quality and Final OEE are not part of Phase 12 acceptance and remain explicitly
pending. They must not be reported as official metrics until their calculation
phase is implemented and separately verified.

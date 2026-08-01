# Handover checklist

Use this checklist for Phase 28 delivery and repeat it for the final Phase 30
release.

## Source and release

- [ ] Accepted commit is identified.
- [ ] `main` contains all approved pull requests.
- [ ] Historical tag `phase12-baseline-93.88` is preserved.
- [ ] Final tag is created only after acceptance.
- [ ] Client workbooks and secrets are absent from Git.
- [ ] Repository owner and maintainer are recorded.

## Installation

- [ ] Target Node.js and npm versions are available.
- [ ] `npm ci` succeeds from a clean checkout.
- [ ] Local development starts.
- [ ] Production build starts.
- [ ] `/api/health` reports policy `2.0.0 · confirmed`.
- [ ] Environment values are stored outside source control.

## Data input

- [ ] A known `.xls` file imports.
- [ ] A known `.xlsx` file imports.
- [ ] Incompatible workbook rejection is demonstrated.
- [ ] Compatibility warnings are understood.
- [ ] Original workbook remains unchanged.
- [ ] Data-retention location is approved.

## Calculations and policy

- [ ] Reported Qty is authoritative.
- [ ] M. Factor is validation-only.
- [ ] Availability and Performance match selected cases.
- [ ] Quality deducts rejection and rework.
- [ ] Scrap does not affect OEE Quality.
- [ ] Provisional policies are blocked in production.
- [ ] Final selected-case agreement is at least 95%.

## Dashboard operation

- [ ] Every navigation tab is demonstrated.
- [ ] Primary and advanced filters are demonstrated.
- [ ] Dark and light modes are readable.
- [ ] Sidebar hover/focus behavior is understood.
- [ ] Overview layout customization/reset is demonstrated.
- [ ] Machine detail panel is demonstrated.
- [ ] Empty and blocked metric states are understood.
- [ ] Previous live workbook reconnection is demonstrated in Chrome or Edge.
- [ ] Snapshot-mode fallback is understood in other browsers.
- [ ] Latest-day and all-history date presets are demonstrated.

## Alerts and data quality

- [ ] Critical and warning meanings are explained.
- [ ] Alert groups are distinguished from supporting record counts.
- [ ] Default thresholds are reviewed.
- [ ] Acknowledgement versus resolution is understood.
- [ ] Supporting source record is traceable.
- [ ] Duplicate and overlapping records are demonstrated.
- [ ] Missing operator/reason/quality handling is understood.

## Reports

- [ ] Eleven Excel worksheets are present.
- [ ] Excel totals match the filtered dashboard.
- [ ] A4 print preview is readable.
- [ ] PDF saving is demonstrated.
- [ ] Report policy/source/filter metadata is present.
- [ ] Confidential report storage is approved.

## Reliability and deployment

- [ ] Pause, resume and manual synchronization are demonstrated.
- [ ] Stale/error state is visible.
- [ ] Deterministic AI fallback is demonstrated.
- [ ] Target deployment smoke test passes.
- [ ] Backup and rollback procedure is recorded.
- [ ] Protected commit-specific Shareable Link is tested and revocation is scheduled.
- [ ] MySQL remains disabled until schema and read-only credentials are approved.

## Documentation and ownership

- [ ] Manager/operator guides are reviewed.
- [ ] Developer/administrator guides are reviewed.
- [ ] Known limitations are accepted.
- [ ] Verification evidence is delivered privately.
- [ ] Support/escalation contact is recorded.
- [ ] Source-code ownership and permitted portfolio usage are recorded.
- [ ] Data-deletion obligation after handover is confirmed.

## Sign-off

| Role | Name | Date | Signature/approval reference |
|---|---|---|---|
| 3D technical verifier |  |  |  |
| 3D operational reviewer |  |  |  |
| Project developer |  |  |  |
| Deployment owner |  |  |  |

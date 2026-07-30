# Test results and verification evidence

## Current automated status

| Check | Result |
|---|---|
| Automated tests | 124 passed, 0 failed |
| Lint | Passed |
| Cloudflare/Vinext build | Passed |
| Next.js/Vercel build | Passed |
| Deployment smoke script | Passed |
| Laptop layout contract | Passed |
| Widescreen layout contract | Passed |
| Excel/dashboard parity fixture | Passed |
| Printable A4 report fixture | Passed with page-number limitation |

Run:

```sh
npm run lint
npm test
npm run build:vercel
npm run smoke:deployment
```

## Covered areas

- `.xls` and `.xlsx` parsing
- workbook aliases, optional fields and rejection conditions
- time normalization
- production formulas and quantity mismatch
- Availability and Performance
- Quality/OEE readiness
- downtime classification, merging and overlap handling
- financial loss
- filters and empty results
- data-quality evidence
- policy switching and production blocking
- alert thresholds, acknowledgement, deduplication and resolution
- synchronization reconciliation, retries and bounded logs
- deterministic and AI-summary factual validation
- Excel report contents and parity
- security redaction and formula-injection sanitation
- deployment readiness

## Verification evidence

Tracked evidence:

- `verification/PHASE_12_ACCEPTANCE.md`
- `verification/PHASE_27_UAT.md`
- `verification/phase27-acceptance-summary.json`
- `verification/phase27-3d-verification-cases.template.json`
- `verification/PHASE_29_CONFIRMATION.md`
- `verification/phase29-acceptance.template.json`

Private/generated evidence:

- `verification-input/3d-selected-results.json`
- `verification-output/phase12-verification.json`
- `verification-output/phase12-verification.md`
- `verification-input/phase29-3d-results.json`
- `verification-output/phase29-acceptance.json`
- `verification-output/phase29-acceptance.md`
- rendered print/PDF artifacts

Private evidence must not be committed.

## Accuracy interpretation

### Historical baseline

`phase12-baseline-93.88` preserves the original historical workbook agreement.
It used a superseded formula policy and remains available for audit.

### Provisional 99.37% comparison

The disabled inferred policy projected approximately 99.37% agreement. It is
not an official accuracy result because 3D did not approve its M. Factor usage.

### Confirmed-policy acceptance

Final acceptance must compare selected machine/shift/date cases under policy
`mms-direct-quantity-v2` version `2.0.0`. The required agreement is at least
95%, with every mismatch documented.

## Representative cases

The final comparison should cover:

1. complete single-product shift;
2. completed product-change interval;
3. active unfinished interval;
4. Reported Qty/Stroke × M. Factor mismatch;
5. production above target;
6. missing quality input;
7. priced downtime event;
8. System Off or `UNREPORTED` event.

For each case record:

- identical filters used in both systems;
- 3D value;
- module value;
- tolerance;
- pass/fail;
- mismatch cause;
- correction and repeat result.

## Verification commands

```sh
npm run verify:sample
npm run verify:sample:strict
npm run verify:phase29
npm run verify:phase29:strict
```

`verify:phase29` recalculates the complete workbook and produces the Phase 29
JSON and Markdown reports. Its strict variant remains blocked until private 3D
selected-result values meet the 95% gate and written sign-off is recorded.

## Final sign-off

Acceptance requires:

- at least 95% selected-case agreement;
- explained/corrected mismatches;
- reviewed Excel and PDF output;
- approved deployment environment;
- written 3D sign-off;
- final release tag pointing to the accepted commit.

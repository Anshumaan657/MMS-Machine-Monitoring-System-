# Phase 27 Regression and UAT Preparation

Generated: 2026-07-30

## Acceptance status

Phase 27 regression preparation is complete. Internal automated, build,
responsive, print-layout and export checks pass. Formal acceptance remains
pending only for the representative side-by-side cases that require values
from 3D's own MMS interface.

## Regression coverage

| Area | Evidence | Status |
|---|---|---|
| Complete automated suite | `npm test` | Pass |
| Supported filters | Phase 27 filter matrix plus analytics-query tests | Pass |
| Workbook conditions | `.xls`, `.xlsx`, aliases, optional fields, invalid, empty, unrelated, oversized and row-limit cases | Pass |
| Excel export | Eleven-sheet export and dashboard-total parity | Pass |
| Operational alerts | Trigger, severity, evidence, acknowledgement, deduplication and resolution | Pass |
| AI fallback | No-key and unavailable-network deterministic summary | Pass |
| Offline operation | Excel parsing and deterministic summary require no network service | Pass |
| Synchronization failures | Retry, visible error, stale state, bounded history and logs | Pass |
| Provisional policy | Warning in comparison mode and hard block in production | Pass |
| Accessibility contract | Labels, navigation semantics, focus-visible styling and reduced-motion support | Pass |
| Laptop layout | 1024 x 768, no horizontal overflow | Pass |
| Widescreen layout | 1920 x 1080, no horizontal overflow | Pass |
| Printable report | Actual component rendered to a six-page A4 PDF with portrait and landscape sections | Pass with page-number limitation below |
| Cloudflare/Vinext build | `npm run build` | Pass |
| Vercel build | `npm run build:vercel` | Pass |
| Runtime health | Dashboard and `/api/health` | Pass |

## Print and PDF verification

The real `PrintableMmsReport` component was rendered from a deterministic
verified fixture. The PDF contains six A4 pages:

1. Cover - portrait
2. Scope and verified performance - portrait
3. Machine and shift comparison - landscape
4. Downtime, quality and financial exposure - portrait
5. Alerts and data-quality evidence - landscape
6. Evidence-backed management summary - portrait

Visual inspection confirmed readable typography, intact tables, clear section
hierarchy, print-safe colours, page breaks and no clipped content.

The generated verification artifacts are intentionally stored under
`verification-output/`, which is ignored by Git.

## Representative 3D verification cases

Use `phase27-3d-verification-cases.template.json` to select private production
records for:

- a complete single-product shift;
- a completed product-change interval;
- an active unfinished interval;
- a Reported Qty versus Stroke x M. Factor mismatch;
- output above target;
- missing quality input;
- a priced downtime event;
- a System Off or UNREPORTED event.

The source references and results must be populated privately and must not be
committed to the public repository.

## Calculation-policy note

The production policy remains `mms-direct-quantity-v2`, version `2.0.0`,
status `confirmed`. Reported Qty is authoritative and M. Factor is
validation-only.

The historical 99.37% reconciliation policy remains disabled and is available
only for isolated comparison. Its projected workbook agreement is not an
official production result.

The legacy Phase 12 verifier still reports 93.88% against historical workbook
formula columns. That score is retained as audit evidence and is not the
acceptance criterion for the 3D-confirmed policy. Formal acceptance should use
the representative side-by-side cases.

## Known limitations

1. Final 3D sign-off cannot be completed until 3D supplies or checks values for
   the representative cases.
2. Live MySQL connectivity cannot be acceptance-tested without 3D's schema and
   read-only credentials. The interface, mapping validation, retries and safe
   failure behaviour are covered by automated tests.
3. Automatic live-file monitoring depends on browser File System Access
   support. Manual `.xls` or `.xlsx` upload remains the supported fallback.
4. Physical page numbering is controlled differently by PDF renderers.
   Browser print headers/footers should be enabled when guaranteed physical
   page numbers are required. Report section numbers remain embedded.
5. The automated in-app browser could validate the upload screen, responsive
   layout, accessible names and focus styling, but its native file chooser did
   not expose the local workbook. Full workbook behaviour was therefore
   covered through the canonical parser, full sample audit, component tests and
   export/report fixtures.
6. The sample workbook does not contain authoritative external Quality or
   Final OEE columns. These require 3D side-by-side confirmation despite the
   internally verified formula.

## Final acceptance gate

Formal acceptance is ready when:

- every representative case contains a 3D value and an MMS Intelligence value;
- calculations agree within the approved tolerance;
- any mismatch has an owner, explanation and correction;
- the final workbook/PDF report is reviewed by 3D;
- the deployment environment and read-only data-source configuration are
  approved.

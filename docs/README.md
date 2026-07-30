# Handover documentation

This directory is the operating and technical handover package for the 3D
Intelligence MMS Analytics Module.

## Recommended reading order

### For managers and operators

1. [Project overview](PROJECT_OVERVIEW.md)
2. [Dashboard guide](DASHBOARD_GUIDE.md)
3. [Alert guide](ALERT_GUIDE.md)
4. [Excel input guide](EXCEL_INPUT_GUIDE.md)
5. [Excel and PDF reporting](REPORTING_GUIDE.md)
6. [Troubleshooting](TROUBLESHOOTING.md)

### For developers and administrators

1. [Architecture](ARCHITECTURE.md)
2. [Installation](INSTALLATION.md)
3. [Data dictionary](DATA_DICTIONARY.md)
4. [Formulas and policy versions](FORMULAS_AND_POLICIES.md)
5. [Deployment](DEPLOYMENT_GUIDE.md)
6. [Security and privacy](SECURITY_AND_PRIVACY.md)
7. [Testing and verification](TESTING_AND_VERIFICATION.md)
8. [Known limitations](KNOWN_LIMITATIONS.md)
9. [Handover checklist](HANDOVER_CHECKLIST.md)

## Document authority

The TypeScript calculation-policy registry in
`app/calculation-policy.ts` is the executable source of truth. This
documentation explains that behavior but does not override it.

When a formula or operating decision changes:

1. create a new versioned policy;
2. keep historical policies for audit comparison;
3. update the formula documentation;
4. rerun tests and verification;
5. record approval before production activation.

Private client workbooks, credentials and populated verification cases do not
belong in this directory or the public repository.

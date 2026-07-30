# Formula and policy documentation

## Active production policy

| Property | Value |
|---|---|
| Policy ID | `mms-direct-quantity-v2` |
| Version | `2.0.0` |
| Status | `confirmed` |
| Enabled by default | Yes |
| Production allowed | Yes |

This policy records 3D's confirmation that Reported Qty should be used directly
and M. Factor should not be applied across production formulas.

## Confirmed formulas

Let:

- `Q` = Reported Qty
- `S` = Stroke
- `M` = M. Factor
- `OT` = Operative Time in seconds
- `ST` = Shift Time in seconds
- `AT` = Allowed Time in seconds
- `CT` = Standard Cycle Time in seconds
- `T` = policy-calculated Shift Target
- `R` = Rejected Qty
- `W` = Rework Qty

### Production quantity

```text
Produced Quantity = Q
Validation Quantity = S × M
```

A difference creates a quantity-mismatch finding. It does not replace `Q`.

### Planned production time

```text
Planned Production Time = ST − AT
```

Confirmed exclusions are planned breaks, holidays, no production plan and no
load.

### Achieved cycle time

```text
Achieved Cycle Time = OT ÷ Q
```

The result is unavailable when `Q` is zero or missing.

### Operative-time target

```text
Opr. Time Target = OT ÷ CT
```

### Shift target

```text
Shift Target = Allocated Planned Time ÷ CT
```

Completed product-change intervals receive their allocated part of planned
time. An active unfinished interval retains the full planned target.

### Production loss

```text
Production Loss = MAX(0, T − Q)
```

Output above target does not produce a negative loss.

### Availability

```text
Availability = OT ÷ (ST − AT)
```

### Performance

```text
Performance = Q ÷ Opr. Time Target
```

Values above 100% are preserved and flagged instead of being hidden.

### Good quantity and Quality

```text
Good Quantity = Q − R − W
Quality = Good Quantity ÷ Q
```

Scrap is excluded from OEE Quality. Quality is unavailable when the required
quality inputs are missing, produced quantity is zero, Good Quantity is
negative, or the source record is unreliable.

### Final OEE

```text
Final OEE = Availability × Performance × Quality
```

Final OEE is displayed only when every component is ready under the confirmed
policy.

### Estimated scrap

```text
Estimated Scrap = Scrap per Part × Q
```

This is a reporting estimate and does not reduce OEE Quality.

### Machine-hour financial loss

```text
Machine-Hour Loss = Event Duration Hours × Stable Machine Hourly Cost
```

Non-Operative Time, Downtime and System Off remain separate analytics
categories.

## Rounding and missing values

- Calculations use normalized seconds and finite, non-negative values.
- Division by zero returns unavailable—not `Infinity`, `NaN` or a fabricated
  zero.
- Internal policy results are rounded to six decimal places where applicable.
- Display formatting does not change the underlying result.

## Historical policies

### `mms-confirmed-v1`

Phase 12 baseline retained for audit comparison. It used
`Stroke × M. Factor` as the primary quantity and left Quality/OEE pending.
It is now provisional, disabled by default and blocked in production.

### `mms-reconciled-99-37-v1`

An inferred formula set that projected approximately 99.37% agreement against
the sample workbook. It multiplies several targets by M. Factor. 3D did not
approve that behavior. The policy is comparison-only and blocked in production.

### `mms-3d-confirmation-pending-v1`

A non-executable historical placeholder. It cannot be selected.

## Changing a policy safely

Never edit a historical policy in place.

1. Record the written business decision.
2. Add a new policy ID and version.
3. Keep it provisional and production-blocked.
4. Add formula and filter-selection tests.
5. Compare representative records.
6. Obtain written approval.
7. Mark only the approved policy confirmed and production-allowed.
8. Update this document and regenerate acceptance evidence.

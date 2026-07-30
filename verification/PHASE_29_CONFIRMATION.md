# Phase 29 — 3D formula confirmation and acceptance

## Recorded confirmation

3D was sent one consolidated formula-policy message covering Reported Qty,
M. Factor, achieved cycle time, operative-time target, shift target,
production loss, machine-hour loss and Quality.

3D replied:

> All the formulas are good but I feel M.factor should not be used in all
> calculations and instead production quantity mentioned in the sheet should
> be directly used.

A follow-up interpretation was sent confirming that Reported Qty would be used
directly and M. Factor would remain validation-only. 3D replied **Yes**.

The individual approver name, message timestamps and private conversation
evidence must be added to the private acceptance record before final sign-off.
They are not invented or published in this repository.

## Official executable policy

| Property | Value |
|---|---|
| ID | `mms-direct-quantity-v2` |
| Version | `2.0.0` |
| Status | `confirmed` |
| Default | Yes |
| Production allowed | Yes |

Confirmed rules:

- Reported Qty is authoritative.
- `Stroke × M. Factor` is validation-only.
- Achieved Cycle Time = Operative Time ÷ Reported Qty.
- Opr. Time Target = Operative Time ÷ Standard Cycle Time.
- Shift Target = Allocated Planned Time ÷ Standard Cycle Time.
- Production Loss = `MAX(0, Shift Target − Reported Qty)`.
- Availability = Operative Time ÷ (Shift Time − Allowed Time).
- Performance = Reported Qty ÷ Opr. Time Target.
- Good Quantity = Reported Qty − Rejected Qty − Rework Qty.
- Quality = Good Quantity ÷ Reported Qty.
- Scrap does not affect OEE Quality.
- Final OEE = Availability × Performance × Quality when all inputs are ready.
- Machine-Hour Loss = Event Duration Hours × stable Machine-Hour Cost.

## Historical-policy treatment

The projected 99.37% formula set remains provisional, disabled by default and
blocked in production. The `phase12-baseline-93.88` tag remains unchanged as
historical audit evidence.

## Final acceptance gate

Phase 29 is accepted only when:

1. all eight representative scenarios are covered;
2. at least 20 comparable 3D values are provided;
3. selected-case agreement is at least 95%;
4. every remaining mismatch is explained;
5. dashboard, Excel and PDF values use identical filters;
6. 3D provides the final written approval statement.

Use `verification/phase29-acceptance.template.json` as the public schema. Copy
it into the ignored `verification-input/` directory before entering private
values.

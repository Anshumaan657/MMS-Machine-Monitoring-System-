import { canonicalizeMmsRows } from "../app/mms.ts";

export function exactCanonicalFixture() {
  return canonicalizeMmsRows({
    company: "Verification Company",
    sourceName: "verification-fixture.xlsx",
    parsedAt: "2026-07-26T00:00:00.000Z",
    productionRows: [
      {
        rowNumber: 7,
        values: {
          Date: new Date("2024-01-01T00:00:00"),
          Machine: "MACHINE A",
          Shift: "Shift 1",
          "From Time": new Date("2024-01-01T07:00:00"),
          "Till Time": new Date("2024-01-01T19:00:00"),
          "Part No.": "PART-A",
          "Product Name": "PRODUCT A",
          Operator: "OPERATOR A",
          "Machine Type": "PRESS",
          "Shift Time": "12:00:00",
          "Allowed Time": "02:00:00",
          "Opr. Time": "01:00:00",
          "Non Opr. Time": "00:05:00",
          "Down Time": "00:30:00",
          "System Off": "00:00:00",
          "Additional Over Time": 120,
          "Std. Cycle Time": 18,
          "Approved Cycle Time": 18,
          "Achieve Cycle Time": 18,
          Stroke: 100,
          "M. Factor": 2,
          Qty: 200,
          "Shift Target": 250,
          "Opr. Time Target": 200,
          "Product Loss": 50,
          "Reject Qty": 2,
          "Rework Qty": 1,
          "Scrap part": 0.1,
          "Running Hrs Cost": 600,
        },
      },
    ],
    downtimeRows: [
      {
        rowNumber: 7,
        values: {
          Date: new Date("2024-01-01T00:00:00"),
          Machine: "MACHINE A",
          Shift: "Shift 1",
          "From Time": new Date("2024-01-01T10:00:00"),
          "Till Time": new Date("2024-01-01T10:30:00"),
          Duration: "00:30:00",
          "Product Name": "PRODUCT A",
          "Operator Name": "OPERATOR A",
          Reason_Type: "Mechanical",
          Reason: "Tool adjustment",
          Revenue: 300,
        },
      },
    ],
  });
}

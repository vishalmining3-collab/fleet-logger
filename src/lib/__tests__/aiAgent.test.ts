// Test the natural-language readback builders in the AI agent.
import { buildReadback, buildFollowUpQuestion, buildBatchReadback } from "../aiAgent";

interface Case {
  name: string;
  entry: any;
  expectContains?: string[];
  expectNotContains?: string[];
}

const cases: Case[] = [
  {
    name: "Hospital run with car and times",
    entry: {
      carNumber: "WB 02 AB 1234",
      duty: "Hospital Run",
      inTime: "09:00",
      outTime: "18:00",
    },
    expectContains: ["Hospital Run", "W B", "9 AM", "6 PM", "Is that right?"],
    expectNotContains: ["unknown"],
  },
  {
    name: "Airport drop with 12h time and kms",
    entry: {
      carNumber: "DL01",
      duty: "Airport Drop",
      inTime: "12:00",
      outTime: "16:00",
      inKm: 1000,
      outKm: 1120,
    },
    expectContains: ["Airport Drop", "D L", "12 PM", "4 PM", "1000", "1120"],
  },
  {
    name: "Missing car — triggers follow-up",
    entry: { duty: "Local trip" },
    expectContains: ["Local trip"],
  },
  {
    name: "Empty entry",
    entry: {},
    expectContains: ["couldn't extract"],
  },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const text = buildReadback(c.entry);
  let ok = true;
  if (c.expectContains) {
    for (const want of c.expectContains) {
      if (!text.toLowerCase().includes(want.toLowerCase())) {
        console.log(`  [${c.name}] missing: "${want}"`);
        console.log(`    got: ${text}`);
        ok = false;
      }
    }
  }
  if (c.expectNotContains) {
    for (const notWant of c.expectNotContains) {
      if (text.toLowerCase().includes(notWant.toLowerCase())) {
        console.log(`  [${c.name}] unexpected: "${notWant}"`);
        ok = false;
      }
    }
  }
  if (ok) {
    pass++;
    console.log(`PASS ${c.name}`);
    console.log(`     → "${text}"`);
  } else {
    fail++;
    console.log(`FAIL ${c.name}`);
  }
}

// Follow-up question tests
const fuCases: { name: string; entry: any; expect: string | null }[] = [
  { name: "missing car", entry: { duty: "X" }, expect: "car number" },
  { name: "missing duty", entry: { carNumber: "X" }, expect: "duty" },
  { name: "missing inTime", entry: { carNumber: "X", duty: "Y" }, expect: "start" },
  { name: "missing outTime", entry: { carNumber: "X", duty: "Y", inTime: "09:00" }, expect: "end" },
  { name: "all fields", entry: { carNumber: "X", duty: "Y", inTime: "09:00", outTime: "18:00" }, expect: null },
];
for (const c of fuCases) {
  const got = buildFollowUpQuestion(c.entry);
  if ((got === null) === (c.expect === null) && (got === null || got.toLowerCase().includes(c.expect!.toLowerCase()))) {
    pass++;
    console.log(`PASS follow-up: ${c.name} → "${got}"`);
  } else {
    fail++;
    console.log(`FAIL follow-up: ${c.name}: expected "${c.expect}", got "${got}"`);
  }
}

// Batch readback
const batchText = buildBatchReadback([
  { carNumber: "0201", duty: "Hospital", inTime: "09:00", outTime: "18:00" },
  { carNumber: "WB02AB1234", duty: "Wedding", inTime: "18:00", outTime: "23:00" },
]);
if (batchText.includes("2 duties") && batchText.includes("Hospital") && batchText.includes("Wedding")) {
  pass++;
  console.log(`PASS batch readback`);
  console.log(`     → "${batchText}"`);
} else {
  fail++;
  console.log(`FAIL batch readback: ${batchText}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

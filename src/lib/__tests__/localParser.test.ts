// Simple smoke test for the local parser. Run with `npx tsx src/lib/__tests__/localParser.test.ts`
import { parseLocal, isLocalParseReliable } from "../localParser";

interface Expect {
  carNumber?: string;
  duty?: string;
  inTime?: string;
  outTime?: string;
  inKm?: number;
  outKm?: number;
}

interface Case {
  name: string;
  text: string;
  expectReliable: boolean;
  expect?: Expect;
}

const cases: Case[] = [
  {
    name: "PRD example 1 (no duty)",
    text: "Mr Biswas took Maruti Suzuki 0201 in the morning 9am to evening 9pm",
    expectReliable: false,
    expect: { carNumber: "0201", inTime: "09:00", outTime: "21:00" },
  },
  {
    name: "PRD example 2",
    text: "Bhai, Mr Sharma Sumo WB 02 AB 1234 10 se 6 local trip",
    expectReliable: true,
    expect: { carNumber: "WB 02 Ab 1234", duty: "Local Trip", inTime: "10:00", outTime: "06:00" },
  },
  {
    name: "Hospital with times",
    text: "Suresh in WB 02 AB 1234 on Hospital Run, out at 09:00, in at 18:00",
    expectReliable: true,
    expect: { carNumber: "WB 02 Ab 1234", duty: "Hospital Run", inTime: "09:00", outTime: "18:00" },
  },
  {
    name: "Airport with km",
    text: "Amit driving DL01 for Airport Drop from 12:00 PM to 4:00 PM with KM 1000 to 1120",
    expectReliable: true,
    expect: { carNumber: "DL01", duty: "Airport Drop", inTime: "12:00", outTime: "04:00", inKm: 1000, outKm: 1120 },
  },
  {
    name: "Wedding with brand+number",
    text: "Rajesh in TATA02 on Wedding Party at 10:00, return at 20:00",
    expectReliable: true,
    expect: { carNumber: "TATA02", duty: "Wedding Party", inTime: "10:00", outTime: "20:00" },
  },
  {
    name: "Single plate (no spaces)",
    text: "Ramesh in WB02AB1234 hospital 9 to 18 kms 1000 to 1150",
    expectReliable: true,
    expect: { carNumber: "WB02AB1234", duty: "Hospital", inTime: "09:00", outTime: "18:00", inKm: 1000, outKm: 1150 },
  },
  {
    name: "Out-KM and in-KM verbal",
    text: "Suresh left for Wedding Party at 10:00 with TATA02, in at 20:00 with out-KM 250 and in-KM 450",
    expectReliable: true,
    expect: { carNumber: "TATA02", duty: "Wedding Party", inTime: "10:00", outTime: "20:00", inKm: 250, outKm: 450 },
  },
  {
    name: "Bengali-ish with baje",
    text: "Bhai Rajesh 0201 airport drop 12 baje se 4 baje",
    expectReliable: true,
    expect: { carNumber: "0201", duty: "Airport Drop", inTime: "12:00", outTime: "04:00" },
  },
  {
    name: "Date yesterday",
    text: "yesterday Suresh 0201 local trip 9 to 18",
    expectReliable: true,
    expect: { carNumber: "0201", duty: "Local Trip", inTime: "09:00", outTime: "18:00" },
  },
  { name: "Empty", text: "", expectReliable: false },
  { name: "Mic test", text: "test mic testing 1 2 3", expectReliable: false },
  { name: "Hello", text: "hello", expectReliable: false },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const result = parseLocal(c.text);
  const reliable = isLocalParseReliable(result, c.text);
  const first = result[0];
  let ok = reliable === c.expectReliable;
  if (ok && c.expect && first) {
    for (const k of Object.keys(c.expect) as (keyof Expect)[]) {
      if (c.expect[k] !== first[k]) {
        ok = false;
        console.log(`  [${c.name}] expected ${k}=${c.expect[k]}, got ${first[k]}`);
        break;
      }
    }
  }
  if (ok) {
    pass++;
    console.log(`PASS ${c.name}`);
  } else {
    fail++;
    console.log(`FAIL ${c.name}`);
    console.log(`  text:    ${c.text}`);
    console.log(`  expectReliable: ${c.expectReliable} | got: ${reliable}`);
    console.log(`  result:  ${JSON.stringify(first)}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

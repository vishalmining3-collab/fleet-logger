/**
 * Fast local rule-based parser for fleet-logger dictation.
 *
 * Goal: turn a transcript like
 *   "Suresh in WB 02 AB 1234 on Hospital Run, out at 09:00, in at 18:00"
 *   "Amit driving DL01 for Airport Drop from 12:00 PM to 4:00 PM with KM 1000 to 1120"
 *   "Bhai Mr Sharma Sumo WB 02 AB 1234 10 se 6 local trip"
 * into a structured DutyEntry array in <50ms, without any network call.
 */

export interface LocalDraft {
  carNumber: string | null;
  duty: string | null;
  inTime: string | null;
  outTime: string | null;
  inKm: number | null;
  outKm: number | null;
  date: string | null;
  confidence: number;
}

const HINDI_DIGITS: Record<string, string> = {
  "\u0966": "0", "\u0967": "1", "\u0968": "2", "\u0969": "3", "\u096A": "4",
  "\u096B": "5", "\u096C": "6", "\u096D": "7", "\u096E": "8", "\u096F": "9",
};
const BENGALI_DIGITS: Record<string, string> = {
  "\u09E6": "0", "\u09E7": "1", "\u09E8": "2", "\u09E9": "3", "\u09EA": "4",
  "\u09EB": "5", "\u09EC": "6", "\u09ED": "7", "\u09EE": "8", "\u09EF": "9",
};

const WORD_TO_DIGIT: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12,
};

const HOURS_MAP: Record<string, number> = {
  sokal: 9, bikol: 12, bikel: 12, dupur: 12, doopr: 12, sandhya: 18, raatri: 21,
  subah: 8, dopahar: 12, shaam: 18, sham: 18, raat: 21, midnight: 0, noon: 12,
};

const NUMBER_WORDS: Record<string, number> = { ...WORD_TO_DIGIT, ...HOURS_MAP };
const MULTIPLIERS: Record<string, number> = {
  hundred: 100, thousand: 1000, lakh: 100000, lac: 100000, cr: 1000000, crore: 1000000,
  sau: 100, hazaar: 1000, lakh2: 100000,
};

const CAR_BRANDS = new Set([
  "maruti", "suzuki", "tata", "mahindra", "toyota", "honda", "hyundai",
  "ford", "chevrolet", "nissan", "renault", "skoda", "kia", "datsun",
  "bmw", "mercedes", "audi", "jeep", "volkswagen", "vw", "mg",
  "swift", "dzire", "ertiga", "innova", "crysta", "fortuner",
  "sumo", "bolero", "scorpio", "xuv", "thar", "safari", "nexon",
  "punch", "tiago", "tigor", "altroz", "harrier", "hexa",
  "i10", "i20", "venue", "creta", "verna", "city", "amaze", "jazz",
  "baleno", "brezza", "vitara", "wagon", "r", "alto", "celerio",
  "wagonr", "ignis", "ciaz", "kwid", "triber", "kiger", "magnite",
  "omni", "eeco",
]);

// Stop words that look like 2-letter tokens but are NOT state codes.
// Indian state codes are: AN, AP, AR, AS, BR, CG, CH, DN, DD, DL, GA, GJ, HR, HP, JK, JH, KA, KL, LA, LD, MP, MH, MN, ML, MZ, NL, OD, PY, PB, RJ, SK, TN, TS, TR, UP, UK, WB, TN.
// 2-letter tokens NOT in this set should never be treated as state codes.
const KNOWN_STATE_CODES = new Set([
  "an", "ap", "ar", "as", "br", "cg", "ch", "dn", "dd", "dl",
  "ga", "gj", "hr", "hp", "jk", "jh", "ka", "kl", "la", "ld",
  "mp", "mh", "mn", "ml", "mz", "nl", "od", "py", "pb", "rj",
  "sk", "tn", "ts", "tr", "up", "uk", "wb",
]);

const DUTY_KEYWORDS: string[] = [
  "airport drop", "airport pickup", "airport",
  "hospital run", "hospital",
  "office drop", "office pickup", "office",
  "local trip", "local", "trip",
  "outstation trip", "outstation",
  "wedding party", "wedding",
  "station drop", "station pickup", "railway station",
  "school drop", "school pickup", "school run", "school",
  "pickup and drop", "pick and drop", "pickup", "drop", "delivery",
  "tour trip", "tour", "pilgrimage",
  "emergency", "personal", "off", "leave", "weekly off",
  "maintenance", "service", "repair", "garage", "wash",
];

const TIME_OF_DAY_HINTS: Array<{ pattern: RegExp; hour: number }> = [
  { pattern: /\b(morning|subah|sokal)\b/i, hour: 9 },
  { pattern: /\b(evening|sham|shaam|sandhya)\b/i, hour: 18 },
  { pattern: /\b(noon|dupur|dopahar|midday)\b/i, hour: 12 },
  { pattern: /\b(afternoon|after noon|after-noon)\b/i, hour: 15 },
  { pattern: /\b(night|raat|midnight)\b/i, hour: 21 },
];

const STOP_WORDS = new Set([
  "bhai", "yaar", "sir", "ji", "boss", "hey", "hi", "hello",
  "ok", "okay", "the", "a", "an", "and", "to", "from", "at", "in", "on", "with",
  "of", "for", "by", "is", "was", "now", "please",
  "driver", "drove", "driving", "drive", "drives",
  "took", "take", "taken",
  "car", "vehicle", "number", "plate", "reg", "registration",
  "sab", "thik", "achha", "haan", "ha", "nahi", "nahin", "nah",
  "left", "return", "returned", "back", "came", "going", "go", "goes", "went",
  "out", "inn", "into",
  "am", "pm",
]);

interface Token {
  raw: string;
  norm: string;
  isDigit: boolean;
  isTime: boolean;
  pos: number;
}

function normalizeText(text: string): string {
  let t = text || "";
  t = t.replace(/[\u0966-\u096F]/g, (c) => HINDI_DIGITS[c] || c);
  t = t.replace(/[\u09E6-\u09EF]/g, (c) => BENGALI_DIGITS[c] || c);
  t = t.replace(/\b(\d+)\s*ta\b/gi, "$1");
  t = t.replace(/\b(\d+)\s*baje\b/gi, "$1");
  t = t.replace(/\bse\b/gi, "to");
  t = t.replace(/\baaj\b/gi, "today");
  t = t.replace(/\bkal\b/gi, "yesterday");
  return t;
}

function tokenize(text: string): Token[] {
  const norm = normalizeText(text);
  const tokens: Token[] = [];
  const re = /[A-Za-z0-9:]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    const raw = m[0];
    const lower = raw.toLowerCase();
    const hasAM = /am\b/i.test(lower);
    const hasPM = /pm\b/i.test(lower);
    const isTime = hasAM || hasPM || /^\d{1,2}:\d{2}$/.test(lower);
    tokens.push({
      raw,
      norm: lower,
      isDigit: /^\d+(:\d+)?$/.test(lower) || (lower in NUMBER_WORDS) || (lower in MULTIPLIERS),
      isTime,
      pos: m.index,
    });
  }
  return tokens;
}

function parseNumberToken(t: Token): number | null {
  if (/^\d+$/.test(t.norm)) return parseInt(t.norm, 10);
  if (/^\d+:\d+$/.test(t.norm)) {
    const [h, m] = t.norm.split(":").map(Number);
    return h * 60 + m;
  }
  if (t.norm in NUMBER_WORDS) return NUMBER_WORDS[t.norm];
  if (t.norm in MULTIPLIERS) return MULTIPLIERS[t.norm];
  return null;
}

function formatHHMM(totalMinutes: number): string {
  const m = Math.round(totalMinutes);
  const h = Math.floor((m / 60) % 24);
  const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

function parseTimeAt(idx: number, tokens: Token[]): { minutes: number; consumed: number; raw: string } | null {
  if (idx < 0 || idx >= tokens.length) return null;
  const t = tokens[idx];

  const m24 = t.norm.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const mm = parseInt(m24[2], 10);
    if (h < 24 && mm < 60) return { minutes: h * 60 + mm, consumed: 1, raw: t.raw };
    return null;
  }

  const m12 = t.norm.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const mm = m12[2] ? parseInt(m12[2], 10) : 0;
    const ampm = m12[3];
    if (h < 1 || h > 12) return null;
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return { minutes: h * 60 + mm, consumed: 1, raw: t.raw };
  }

  const n = parseNumberToken(t);
  if (n === null) return null;

  if (idx + 1 < tokens.length) {
    const next = tokens[idx + 1].norm;
    if (next === "am" || next === "pm") {
      let h = n;
      const mm = 0;
      if (h < 1 || h > 12) return null;
      if (next === "pm" && h < 12) h += 12;
      if (next === "am" && h === 12) h = 0;
      return { minutes: h * 60 + mm, consumed: 2, raw: `${t.raw} ${next}` };
    }
  }

  if (n >= 0 && n < 24) {
    return { minutes: n * 60, consumed: 1, raw: t.raw };
  }

  return null;
}

function isNoiseToken(t: Token): boolean {
  return STOP_WORDS.has(t.norm);
}

function looksLikeCarNumber(s: string): boolean {
  if (!s) return false;
  const t = s.replace(/\s+/g, "").toUpperCase();
  if (/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}$/.test(t)) return true;
  if (/^[A-Z]{2,3}\d{2,4}$/.test(t)) return true;
  if (/^\d{4}$/.test(t)) return true;
  return false;
}

function extractCarNumber(tokens: Token[]): { carNumber: string | null; consumedIndices: Set<number> } {
  const consumed = new Set<number>();

  // Strategy 0a: single token Indian plate "WB02AB1234", "DL01AB1234", "WB02A1234"
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].raw.toUpperCase();
    if (/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}$/.test(t)) {
      consumed.add(i);
      return { carNumber: t, consumedIndices: consumed };
    }
  }

  // Strategy 0b: brand+number single token like "TATA02", "Sumo0201"
  for (let i = 0; i < tokens.length; i++) {
    const m = tokens[i].raw.match(/^([A-Za-z]+)(\d{2,4})$/);
    if (m) {
      const brand = m[1].toLowerCase();
      if (CAR_BRANDS.has(brand)) {
        consumed.add(i);
        return { carNumber: tokens[i].raw.toUpperCase(), consumedIndices: consumed };
      }
    }
  }

  // Strategy 1: full state code + district + series pattern across 2-4 tokens
  // e.g. ["WB", "02", "AB", "1234"]
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i].norm;
    if (!/^[a-z]{2}$/.test(t)) continue;
    if (!KNOWN_STATE_CODES.has(t)) continue; // MUST be a real Indian state code
    const state = t.toUpperCase();
    const parts: string[] = [state];
    const usedIdx: number[] = [i];
    let j = i + 1;
    while (j < tokens.length && parts.length < 4) {
      const n = tokens[j].norm;
      if (/^\d{1,2}$/.test(n) || /^[a-z]{1,3}$/.test(n) || /^\d{1,4}$/.test(n)) {
        parts.push(n.replace(/[a-z]/, (c) => c.toUpperCase()));
        usedIdx.push(j);
        j++;
      } else break;
    }
    const candidate = parts.join(" ");
    if (looksLikeCarNumber(candidate)) {
      for (const k of usedIdx) consumed.add(k);
      return { carNumber: candidate, consumedIndices: consumed };
    }
  }

  // Strategy 2: brand-then-number — "TATA 02", "Sumo 0201"
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].norm;
    if (CAR_BRANDS.has(t)) {
      if (i + 1 < tokens.length) {
        const next = tokens[i + 1].norm;
        if (/^\d{2,4}$/.test(next)) {
          consumed.add(i);
          consumed.add(i + 1);
          return { carNumber: next.toUpperCase(), consumedIndices: consumed };
        }
      }
    }
  }

  // Strategy 3: short codes like "0201", "DL01" anywhere
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].norm;
    if (/^\d{4}$/.test(t) || /^[a-z]{2}\d{2,4}$/.test(t)) {
      // Skip if preceded by "km"/"kms" (it's a kilometer reading, not a car plate)
      if (i > 0 && /km|kms|kilometer|kilometers/i.test(tokens[i - 1].norm)) continue;
      // Skip if followed by "to"/"km"/"kms" (it's the start of a range)
      if (i + 1 < tokens.length) {
        const next = tokens[i + 1].norm;
        if (next === "to" || next === "km" || next === "kms") continue;
      }
      consumed.add(i);
      return { carNumber: t.toUpperCase(), consumedIndices: consumed };
    }
  }

  return { carNumber: null, consumedIndices: consumed };
}

function extractTimes(tokens: Token[]): {
  inTime: string | null;
  outTime: string | null;
  consumedIndices: Set<number>;
} {
  const consumed = new Set<number>();
  let inTime: string | null = null;
  let outTime: string | null = null;
  const hourMentions: number[] = [];

  // "X to Y" / "X se Y" — departure to return
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const t = tokens[i].norm;
    if (t === "to" || t === "till" || t === "until") {
      const left = parseTimeAt(i - 1, tokens);
      const right = parseTimeAt(i + 1, tokens);
      if (left && right) {
        inTime = formatHHMM(left.minutes);
        outTime = formatHHMM(right.minutes);
        for (let k = 0; k < left.consumed; k++) consumed.add(i - 1 + k);
        for (let k = 0; k < right.consumed; k++) consumed.add(i + 1 + k);
        consumed.add(i);
      }
    }
  }

  // "from X to Y"
  if (!inTime) {
    for (let i = 0; i < tokens.length; i++) {
      if (consumed.has(i)) continue;
      const t = tokens[i].norm;
      if (t === "from" && i + 1 < tokens.length) {
        const left = parseTimeAt(i + 1, tokens);
        if (left && i + 1 + left.consumed < tokens.length) {
          const right = parseTimeAt(i + 1 + left.consumed, tokens);
          if (right) {
            inTime = formatHHMM(left.minutes);
            outTime = formatHHMM(right.minutes);
            for (let k = 0; k < left.consumed; k++) consumed.add(i + 1 + k);
            for (let k = 0; k < right.consumed; k++) consumed.add(i + 1 + left.consumed + k);
            consumed.add(i);
          }
        }
      }
    }
  }

  // "out at HH" = depart at HH (inTime), "in at HH" = arrive/return at HH (outTime)
  if (!inTime || !outTime) {
    for (let i = 0; i < tokens.length; i++) {
      if (consumed.has(i)) continue;
      const t = tokens[i].norm;
      if ((t === "out" || t === "in") && i + 1 < tokens.length) {
        // Skip connector "at": "in at 18:00" → 18:00
        let target = i + 1;
        if (tokens[target].norm === "at" && target + 1 < tokens.length) {
          target = target + 1;
        }
        const next = parseTimeAt(target, tokens);
        if (next) {
          const value = formatHHMM(next.minutes);
          if (t === "in" && !outTime) {
            outTime = value;
            for (let k = 0; k < next.consumed; k++) consumed.add(target + k);
            consumed.add(i);
            if (target !== i + 1) consumed.add(i + 1);
          } else if (t === "out" && !inTime) {
            inTime = value;
            for (let k = 0; k < next.consumed; k++) consumed.add(target + k);
            consumed.add(i);
            if (target !== i + 1) consumed.add(i + 1);
          }
        }
      }
    }
  }

  // Any remaining times → fill inTime first then outTime
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const parsed = parseTimeAt(i, tokens);
    if (parsed) {
      hourMentions.push(parsed.minutes);
      for (let k = 0; k < parsed.consumed; k++) consumed.add(i + k);
    }
  }

  // Time-of-day hints: "morning 9" → 09:00
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    for (const hint of TIME_OF_DAY_HINTS) {
      if (hint.pattern.test(tokens[i].norm)) {
        for (let j = i + 1; j < Math.min(tokens.length, i + 3); j++) {
          if (consumed.has(j)) continue;
          const n = parseNumberToken(tokens[j]);
          if (n !== null && n < 24) {
            let actualHour = n < 12 ? hint.hour : n;
            if (hint.hour === 21 && n < 12) actualHour = n + 12;
            if (hint.hour === 18 && n <= 6) actualHour = n + 12;
            const value = `${actualHour.toString().padStart(2, "0")}:00`;
            if (!inTime) inTime = value;
            else if (!outTime) outTime = value;
            consumed.add(i);
            consumed.add(j);
            break;
          }
        }
      }
    }
  }

  if (!inTime && hourMentions.length > 0) inTime = formatHHMM(hourMentions[0]);
  if (!outTime && hourMentions.length > 1) outTime = formatHHMM(hourMentions[1]);

  return { inTime, outTime, consumedIndices: consumed };
}

function extractDuty(tokens: Token[], consumed: Set<number>): string | null {
  const words = tokens
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => !consumed.has(i) && !isNoiseToken(tokens[i]))
    .map(({ t }) => t.norm);
  const text = words.join(" ");
  if (!text.trim()) return null;

  const lower = text.toLowerCase();
  for (const phrase of [...DUTY_KEYWORDS].sort((a, b) => b.length - a.length)) {
    if (lower.includes(phrase)) {
      return phrase
        .split(" ")
        .map((w) => (w.length <= 2 ? w : w[0].toUpperCase() + w.slice(1)))
        .join(" ");
    }
  }
  return null;
}

function extractDriverName(tokens: Token[], consumed: Set<number>): string | null {
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const t = tokens[i];
    if (isNoiseToken(t)) continue;
    if (CAR_BRANDS.has(t.norm)) continue;
    if (/^\d/.test(t.norm)) continue;
    if (t.norm === "am" || t.norm === "pm") continue;
    if (["mr", "mrs", "ms", "shri", "smt", "bhai", "sahab", "sahib", "sir", "boss", "mr.", "shri."].includes(t.norm)) continue;
    if (!/^[A-Z]/.test(t.raw)) continue;
    consumed.add(i);
    return t.raw.replace(/[^A-Za-z]/g, "");
  }
  return null;
}

function extractKms(tokens: Token[], consumed: Set<number>): { inKm: number | null; outKm: number | null } {
  let inKm: number | null = null;
  let outKm: number | null = null;

  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const t = tokens[i].norm;
    if (["km", "kms", "kilometer", "kilometers", "kilometre", "kilometres"].includes(t)) {
      // Look back for number, but skip "to" if it sits in between
      const leftIdx = i - 1;
      let left = leftIdx >= 0 && !consumed.has(leftIdx) ? parseNumberToken(tokens[leftIdx]) : null;
      let leftConsumedIdx = leftIdx;
      // Look forward. Handle both "KM 1000" and "KM 1000 to 1120" patterns
      let rightIdx = i + 1;
      // If the next token is "to", skip it (we'll handle the "X to Y" range pattern next)
      let sawToForward = false;
      if (rightIdx < tokens.length && tokens[rightIdx].norm === "to") {
        rightIdx = rightIdx + 1;
        sawToForward = true;
      }
      let right = rightIdx < tokens.length && !consumed.has(rightIdx) ? parseNumberToken(tokens[rightIdx]) : null;
      let rightConsumedIdx = rightIdx;
      let firstNum = right; // the number immediately after KM
      let firstNumIdx = rightConsumedIdx;
      // If the first number is followed by "to <nextnum>", the next number is the actual outKm
      if (right !== null && rightIdx + 1 < tokens.length && !consumed.has(rightIdx + 1) && tokens[rightIdx + 1].norm === "to" && rightIdx + 2 < tokens.length && !consumed.has(rightIdx + 2)) {
        const peek = parseNumberToken(tokens[rightIdx + 2]);
        if (peek !== null) {
          // "KM 1000 to 1120" — first number = inKm (left), next number = outKm (right)
          left = right;
          leftConsumedIdx = rightConsumedIdx;
          right = peek;
          rightConsumedIdx = rightIdx + 2;
          consumed.add(rightIdx + 1); // the "to"
        }
      }

      // Pattern "X to Y KM" — number..to..number..KM
      if (left === null && right === null) {
        // Maybe both numbers are BEFORE the KM with "to" in between
        // e.g. "1000 to 1120 KM"
        if (leftIdx >= 1 && !consumed.has(leftIdx - 1) && tokens[leftIdx].norm === "to") {
          const l2 = parseNumberToken(tokens[leftIdx - 1]);
          const r2 = parseNumberToken(tokens[leftIdx + 1]);
          if (l2 !== null && r2 !== null) {
            left = l2; leftConsumedIdx = leftIdx - 1;
            right = r2; rightConsumedIdx = leftIdx + 1;
          }
        }
      }

      if (left !== null && right !== null) {
        if (left < right) { inKm = left; outKm = right; } else { outKm = left; inKm = right; }
        consumed.add(leftConsumedIdx); consumed.add(i); consumed.add(rightConsumedIdx);
        // Also consume the "to" if it's between
        const toIdx = leftConsumedIdx + 1;
        if (toIdx < i && tokens[toIdx] && tokens[toIdx].norm === "to") consumed.add(toIdx);
        const toIdx2 = rightConsumedIdx - 1;
        if (toIdx2 > i && tokens[toIdx2] && tokens[toIdx2].norm === "to") consumed.add(toIdx2);
      } else if (left !== null) {
        outKm = left;
        consumed.add(leftConsumedIdx); consumed.add(i);
      } else if (right !== null) {
        inKm = right;
        consumed.add(rightConsumedIdx); consumed.add(i);
      }
    }
  }
  return { inKm, outKm };
}

function extractKmsFromVerbalPhrases(tokens: Token[], consumed: Set<number>): { inKm: number | null; outKm: number | null } {
  let inKm: number | null = null;
  let outKm: number | null = null;

  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const t = tokens[i].norm;
    if (["outward", "outgoing", "start", "starting", "begin", "beginning", "from", "lower", "out"].includes(t)) {
      // "out km 250", "outward km 250"
      if (i + 1 < tokens.length && /km|kms|kilometer/i.test(tokens[i + 1].norm)) {
        const num = i + 2 < tokens.length ? parseNumberToken(tokens[i + 2]) : null;
        if (num !== null) {
          inKm = num;
          consumed.add(i); consumed.add(i + 1); consumed.add(i + 2);
        }
      }
    }
    if (["inward", "incoming", "end", "ending", "finish", "finishing", "return", "returned", "upper", "higher", "in"].includes(t)) {
      if (i + 1 < tokens.length && /km|kms|kilometer/i.test(tokens[i + 1].norm)) {
        const num = i + 2 < tokens.length ? parseNumberToken(tokens[i + 2]) : null;
        if (num !== null) {
          outKm = num;
          consumed.add(i); consumed.add(i + 1); consumed.add(i + 2);
        }
      }
    }
  }
  return { inKm, outKm };
}

function extractDate(tokens: Token[], consumed: Set<number>, today: Date): string | null {
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const t = tokens[i].norm;
    if (t === "today" || t === "aaj" || t === "aj") {
      consumed.add(i);
      return toISODate(today);
    }
    if (t === "yesterday" || t === "kal" || t === "kaal") {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      consumed.add(i);
      return toISODate(d);
    }
  }
  return null;
}

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Split a single transcript into multiple duty segments.
 * Heuristic: only split on strong segment boundaries (and-then, period, or comma before a new driver/vehicle).
 * Most dictation is ONE segment with multiple duties joined by commas; the LLM splits when needed.
 */
function splitSegments(text: string): string[] {
  // We split a dictation into multiple duty segments using two strategies:
  //
  //   1. Explicit verbal connectors ("and then", "phir", "next", etc.) — always split.
  //   2. Smart comma split: only split if the comma is followed by a token that
  //      looks like a *new* duty (driver name + vehicle). We detect "new vehicle"
  //      by looking for either a second state-code pattern (WB/DL/etc) or a
  //      brand-then-number pattern after the comma.
  //
  // This avoids false positives on commas inside a single duty (e.g. duty types
  // like "pickup and drop" or the long "in [place], out at HH, in at HH" forms).
  const verbalRe = /\b(and then|after that|aur|phir|fir|next|okay now|ok now)\b/gi;
  const splits: Array<{ index: number; length: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = verbalRe.exec(text)) !== null) {
    splits.push({ index: m.index, length: m[0].length });
  }

  // Smart comma split: only when a comma precedes a new vehicle.
  // Pattern after the comma: optional prefix words, then either a state code (WB/DL)
  // followed by digits/letters, OR a brand-name + 2-4 digit number, OR a 4-digit plate.
  const commaRe = /,\s+/g;
  let cm: RegExpExecArray | null;
  while ((cm = commaRe.exec(text)) !== null) {
    const tail = text.slice(cm.index + cm[0].length);
    // Detect: "Amit in DL01..." or "Amit DL01..." or "DL01 ..." or "Amit in TATA02..."
    // Or a bare 4-digit plate.
    if (
      /^(?:\w+\s+(?:in|with|on|for|took|drove|driving|drive|leaves|left)\s+)?(?:[A-Z]{2}\d{1,2}|[A-Z]{2,3}\d{2,4}|\d{4})/i.test(tail) ||
      /^\d{4}\b/.test(tail) ||
      /^(?:in|with|on)\s+[A-Z]{2}[0-9]/i.test(tail)
    ) {
      splits.push({ index: cm.index, length: cm[0].length });
    }
  }

  if (splits.length === 0) return [text.trim()].filter(Boolean);

  // Sort by index and split the text.
  splits.sort((a, b) => a.index - b.index);
  const out: string[] = [];
  let cursor = 0;
  for (const sp of splits) {
    const before = text.slice(cursor, sp.index).trim();
    if (before) out.push(before);
    cursor = sp.index + sp.length;
  }
  const tail = text.slice(cursor).trim();
  if (tail) out.push(tail);

  // If we ended up with only one segment (e.g. a connector that was a no-op),
  // return the original.
  if (out.length <= 1) return [text.trim()].filter(Boolean);
  return out.filter((s) => s.length > 0);
}

export function parseLocal(text: string, options?: { today?: Date; defaultCar?: string }): LocalDraft[] {
  const today = options?.today || new Date();
  const cleaned = (text || "").trim();
  if (!cleaned) return [];

  const segments = splitSegments(cleaned);
  const results: LocalDraft[] = [];

  for (const seg of segments) {
    const tokens = tokenize(seg);
    if (tokens.length === 0) continue;

    const car = extractCarNumber(tokens);
    const times = extractTimes(tokens);
    const allConsumed = new Set<number>([...car.consumedIndices, ...times.consumedIndices]);
    const kms1 = extractKms(tokens, allConsumed);
    const kms2 = extractKmsFromVerbalPhrases(tokens, allConsumed);
    const date = extractDate(tokens, allConsumed, today);
    const duty = extractDuty(tokens, allConsumed);

    let confidence = 0;
    if (car.carNumber) confidence += 0.3;
    if (times.inTime) confidence += 0.2;
    if (times.outTime) confidence += 0.2;
    if (duty) confidence += 0.2; // Adjusted since driverName (0.05) is removed
    if (kms1.inKm !== null || kms1.outKm !== null || kms2.inKm !== null || kms2.outKm !== null) confidence += 0.1;

    results.push({
      carNumber: car.carNumber || options?.defaultCar || null,
      duty,
      inTime: times.inTime,
      outTime: times.outTime,
      inKm: kms2.inKm !== null ? kms2.inKm : kms1.inKm,
      outKm: kms2.outKm !== null ? kms2.outKm : kms1.outKm,
      date: date || toISODate(today),
      confidence,
    });
  }

  return results;
}

export function isLocalParseReliable(drafts: LocalDraft[], originalText: string): boolean {
  if (drafts.length === 0) return false;
  if (/\?/.test(originalText) && drafts.length === 1) return false;
  const avg = drafts.reduce((sum, d) => sum + d.confidence, 0) / drafts.length;
  return avg >= 0.5 && drafts.some((d) => d.carNumber && d.duty);
}

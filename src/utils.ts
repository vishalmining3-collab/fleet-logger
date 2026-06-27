import { DutyEntry } from "./types";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility for merging Tailwind classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Calculates total hours with midnight wrap-around support.
 * Returns number of hours.
 */
export function calculateTotalHours(inTime: string, outTime: string): number {
  if (!inTime || !outTime) return 0;
  const inParts = inTime.split(":").map(Number);
  const outParts = outTime.split(":").map(Number);
  
  if (inParts.length < 2 || outParts.length < 2 || isNaN(inParts[0]) || isNaN(outParts[0])) {
    return 0;
  }

  const inMins = inParts[0] * 60 + inParts[1];
  let outMins = outParts[0] * 60 + outParts[1];

  let diff = outMins - inMins;
  if (diff < 0) {
    diff += 24 * 60; // Support night shifts crossing midnight
  }

  return Number((diff / 60).toFixed(2));
}

/**
 * Calculates total KMs between out-KM and in-KM.
 */
export function calculateTotalKm(inKm: number | null, outKm: number | null): number {
  if (inKm === null || outKm === null) return 0;
  const diff = outKm - inKm;
  return diff > 0 ? diff : 0;
}

/**
 * Normalizes user-entered times or 12h times to clean 24h format HH:MM
 */
export function normalizeTimeTo24h(timeStr: string): string {
  if (!timeStr) return "09:00";
  let clean = timeStr.trim().toUpperCase();
  
  // Standard matches direct HH:MM or starts with HH:MM
  const match24 = clean.match(/^(\d{1,2}):(\d{2})/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    }
  }

  // Handle 12h like "9:00 AM" or "09 AM" or "9 PM"
  const match12 = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2] ? parseInt(match12[2], 10) : 0;
    const ampm = match12[3];

    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;

    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  // Handle straight integers like "9" -> "09:00", "13" -> "13:00"
  const matchDigits = clean.match(/^(\d{1,2})/);
  if (matchDigits) {
    let h = parseInt(matchDigits[1], 10);
    if (h < 24) {
      return `${h.toString().padStart(2, "0")}:00`;
    }
  }

  return "09:00"; // Fallback default
}

/**
 * Synthesizes speech to read back duty log details
 */
export function speakText(text: string, locale: string = "en-IN") {
  if (!window.speechSynthesis) return;
  // Cancel previous speech if active
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance);
}

/**
 * Generates a UTF-8 BOM CSV for proper rendering of foreign text in Excel
 */
export function exportToCSV(entries: DutyEntry[]): string {
  // Ordered headers
  const headers = ["Date", "Car Number", "Duty Purpose / With", "In-Time", "Out-Time", "Total Hours", "In-KM", "Out-KM", "Total KM"];
  
  const rows = entries.map(e => {
    const totalHours = calculateTotalHours(e.inTime, e.outTime);
    const totalKm = calculateTotalKm(e.inKm, e.outKm);
    
    return [
      e.date,
      `"${e.carNumber.replace(/"/g, '""')}"`,
      `"${e.duty.replace(/"/g, '""')}"`,
      e.inTime,
      e.outTime,
      totalHours.toString(),
      e.inKm !== null ? e.inKm.toString() : "",
      e.outKm !== null ? e.outKm.toString() : "",
      totalKm.toString(),
    ];
  });

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  
  // Return UTF-8 Byte Order Mark + content
  return "\uFEFF" + csvContent;
}

/**
 * Triggers a download of CSV content in browser
 */
export function downloadCSVFile(entries: DutyEntry[], filename: string = "fleet_logger_history.csv") {
  const content = exportToCSV(entries);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Copies CSV to clipboard and details link to generate a modern Google Sheet instant paste
 */
export async function copyToGoogleSheets(entries: DutyEntry[]): Promise<boolean> {
  const content = exportToCSV(entries);
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch (err) {
    console.error("Clipboard write failed:", err);
    return false;
  }
}

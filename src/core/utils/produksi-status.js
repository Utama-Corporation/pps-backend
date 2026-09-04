// Derivasi status baris riwayat produksi — dipakai modul produksi non-inject
// (hot-stamp, spanner, key-fitting, packing) supaya format riwayat-nya sama
// dengan inject: 'current' (sedang berjalan) | 'pending' (lewat, belum selesai)
// | 'complete' (IsComplete = 1).
//
// Logika dijaga identik dengan inject-production-service.js.

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateOnlyString(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }

  if (typeof value === "string") {
    const datePart = value.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return datePart;
    }
  }

  return null;
}

function normalizeTimeString(value) {
  if (!value) return null;

  const text = String(value).trim();
  if (!text) return null;

  const match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  return `${match[1]}:${match[2]}:${match[3] || "00"}`;
}

function addDays(dateString, dayOffset) {
  const baseDate = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) return null;

  baseDate.setDate(baseDate.getDate() + dayOffset);
  return `${baseDate.getFullYear()}-${pad2(baseDate.getMonth() + 1)}-${pad2(baseDate.getDate())}`;
}

function isCurrentProduksi({ tglProduksi, hourStart, hourEnd, now = new Date() }) {
  const currentDate = toDateOnlyString(now);
  const currentTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const produksiDate = toDateOnlyString(tglProduksi);
  const startTime = normalizeTimeString(hourStart);
  const endTime = normalizeTimeString(hourEnd);

  if (!currentDate || !produksiDate || !startTime || !endTime) {
    return false;
  }

  if (startTime <= endTime) {
    return (
      currentDate === produksiDate &&
      currentTime >= startTime &&
      currentTime < endTime
    );
  }

  const nextDate = addDays(produksiDate, 1);
  if (!nextDate) return false;

  return (
    (currentDate === produksiDate && currentTime >= startTime) ||
    (currentDate === nextDate && currentTime < endTime)
  );
}

/**
 * @param {object} row baris hasil query header produksi. Butuh salah satu dari
 *   TglProduksi / Tanggal, plus HourStart, HourEnd, IsComplete.
 * @returns {'current'|'pending'|'complete'}
 */
function deriveProduksiStatus(row, now = new Date()) {
  if (
    isCurrentProduksi({
      tglProduksi: row.TglProduksi ?? row.Tanggal,
      hourStart: row.HourStart,
      hourEnd: row.HourEnd,
      now,
    })
  ) {
    return "current";
  }

  return row.IsComplete ? "complete" : "pending";
}

module.exports = {
  pad2,
  toDateOnlyString,
  normalizeTimeString,
  addDays,
  isCurrentProduksi,
  deriveProduksiStatus,
};

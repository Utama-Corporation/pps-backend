// Guard: jenis output (OutputJenisId) di header produksi tidak boleh diubah
// kalau produksi tsb sudah punya data input ATAU output.
//
// Dipakai oleh update*Produksi service tiap modul produksi (kecuali inject
// yang sudah punya assertNoReferencedInjectInputs sendiri).

const { poolPromise, sql } = require("../config/db");
const { conflict } = require("./http-error");

function _countInputs(inputsObj) {
  if (!inputsObj || typeof inputsObj !== "object") return 0;
  const s = inputsObj.summary;
  if (s && typeof s === "object") {
    return Object.values(s).reduce((a, b) => a + (Number(b) || 0), 0);
  }
  // fallback: jumlahkan panjang semua properti bertipe array
  return Object.values(inputsObj).reduce(
    (a, v) => a + (Array.isArray(v) ? v.length : 0),
    0,
  );
}

/**
 * Lempar `conflict` kalau `newOutputJenisId` berbeda dengan OutputJenisId
 * header saat ini DAN produksi sudah memiliki input/output.
 *
 * @param {object}   o
 * @param {string}   o.noProduksi        kode produksi / no packing
 * @param {*}        o.newOutputJenisId  nilai dari payload (undefined/null = tidak diubah -> no-op)
 * @param {string}   o.headerTable       mis. "BrokerProduksi_h"
 * @param {string}   o.headerPk          kolom PK header, mis. "NoProduksi"
 * @param {string[]} o.outputTables      tabel-tabel output yang dicek
 * @param {string}   o.outputPk          kolom kode di tabel output
 * @param {(no: string) => Promise<any>} o.fetchInputs  fungsi fetchInputs modul ybs
 */
async function assertOutputJenisChangeAllowed({
  noProduksi,
  newOutputJenisId,
  headerTable,
  headerPk,
  outputTables,
  outputPk,
  fetchInputs,
}) {
  if (newOutputJenisId == null) return;

  const no = String(noProduksi || "").trim();
  if (!no) return;

  const pool = await poolPromise;

  const curRes = await pool
    .request()
    .input("no", sql.VarChar(50), no)
    .query(
      `SELECT TOP 1 OutputJenisId FROM dbo.${headerTable} WITH (NOLOCK) WHERE ${headerPk} = @no`,
    );
  const currentId = curRes.recordset?.[0]?.OutputJenisId ?? null;

  // Belum ada / tidak berubah -> boleh
  if (currentId == null) return;
  if (Number(currentId) === Number(newOutputJenisId)) return;

  // Cek output
  const unions = (outputTables || [])
    .map(
      (t) =>
        `SELECT 1 AS x FROM dbo.${t} WITH (NOLOCK) WHERE ${outputPk} = @no`,
    )
    .join(" UNION ALL ");
  let hasOutput = false;
  if (unions) {
    const outRes = await pool
      .request()
      .input("no", sql.VarChar(50), no)
      .query(`SELECT TOP 1 x FROM (${unions}) u`);
    hasOutput = (outRes.recordset?.length || 0) > 0;
  }

  // Cek input (pakai fetchInputs modul supaya konsisten dengan yang dilihat app)
  let hasInput = false;
  if (!hasOutput && typeof fetchInputs === "function") {
    try {
      hasInput = _countInputs(await fetchInputs(no)) > 0;
    } catch (_) {
      hasInput = false;
    }
  }

  if (hasOutput || hasInput) {
    throw conflict(
      "Jenis output tidak dapat diubah karena produksi ini sudah memiliki data input atau output. Hapus semua input dan output terlebih dahulu bila ingin mengganti jenis output.",
    );
  }
}

module.exports = { assertOutputJenisChangeAllowed };

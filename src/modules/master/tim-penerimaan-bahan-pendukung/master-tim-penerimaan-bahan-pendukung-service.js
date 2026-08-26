// master-tim-penerimaan-bahan-pendukung-service.js
//
// CRUD tim penerimaan bahan pendukung — beroperasi di atas dbo.MstTimPenerimaan
// (tabel gabungan, kolom flag TipeModul) dengan filter TipeModul='BAHAN_PENDUKUNG'
// tetap, mirroring master-tim-penerimaan-bb-service.js (modul Bahan Baku),
// supaya tim modul lain (Bahan Baku, Barang Dagang) tidak ikut muncul/tertimpa
// di sini. Tidak ada konsep operator/kepala tim di modul penerimaan ini.
const { poolPromise, sql } = require("../../../core/config/db");
const { badReq, notFound } = require("../../../core/utils/http-error");

const TIPE_MODUL = "BAHAN_PENDUKUNG";

async function listAll({
  q = "",
  includeInactive = false,
  orderBy = "NamaTim",
  orderDir = "ASC",
} = {}) {
  const pool = await poolPromise;
  const request = pool.request();

  const allowedOrderBy = new Set(["IdTim", "NamaTim", "Aktif"]);
  const orderCol = allowedOrderBy.has(orderBy) ? orderBy : "NamaTim";
  const dir = orderDir === "DESC" ? "DESC" : "ASC";

  const conditions = ["a.TipeModul = @TipeModul"];
  request.input("TipeModul", sql.VarChar(30), TIPE_MODUL);

  if (!includeInactive) {
    conditions.push("a.Aktif = 1");
  }

  if (q && q.trim().length > 0) {
    conditions.push("a.NamaTim LIKE @q");
    request.input("q", `%${q.trim()}%`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const query = `
    SELECT
      a.IdTim,
      a.NamaTim,
      a.Keterangan,
      a.Aktif
    FROM [dbo].[MstTimPenerimaan] a
    ${where}
    ORDER BY ${orderCol} ${dir};
  `;

  const result = await request.query(query);
  return result.recordset || [];
}

async function getById(idTim) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("IdTim", sql.Int, idTim)
    .input("TipeModul", sql.VarChar(30), TIPE_MODUL)
    .query(`
      SELECT
        a.IdTim,
        a.NamaTim,
        a.Keterangan,
        a.Aktif
      FROM [dbo].[MstTimPenerimaan] a
      WHERE a.IdTim = @IdTim AND a.TipeModul = @TipeModul;
    `);

  return result.recordset[0] || null;
}

function normalizePayload({ namaTim, keterangan }) {
  const normalizedNamaTim = String(namaTim || "").trim();
  if (!normalizedNamaTim) {
    throw badReq("NamaTim wajib diisi");
  }

  const normalizedKeterangan =
    keterangan === undefined || keterangan === null || String(keterangan).trim() === ""
      ? null
      : String(keterangan).trim();

  return {
    namaTim: normalizedNamaTim,
    keterangan: normalizedKeterangan,
  };
}

async function create({ namaTim, keterangan }) {
  const payload = normalizePayload({ namaTim, keterangan });

  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("NamaTim", sql.VarChar(100), payload.namaTim)
    .input("Keterangan", sql.VarChar(255), payload.keterangan)
    .input("TipeModul", sql.VarChar(30), TIPE_MODUL)
    .query(`
      INSERT INTO [dbo].[MstTimPenerimaan] (NamaTim, Keterangan, TipeModul)
      OUTPUT INSERTED.IdTim
      VALUES (@NamaTim, @Keterangan, @TipeModul);
    `);

  const idTim = result.recordset[0].IdTim;
  return getById(idTim);
}

async function update(idTim, { namaTim, keterangan, aktif }) {
  const existing = await getById(idTim);
  if (!existing) {
    throw notFound("Data tim penerimaan bahan pendukung tidak ditemukan");
  }

  const payload = normalizePayload({ namaTim, keterangan });
  const normalizedAktif =
    aktif === undefined || aktif === null ? existing.Aktif : aktif ? 1 : 0;

  const pool = await poolPromise;
  await pool
    .request()
    .input("IdTim", sql.Int, idTim)
    .input("NamaTim", sql.VarChar(100), payload.namaTim)
    .input("Keterangan", sql.VarChar(255), payload.keterangan)
    .input("Aktif", sql.Bit, normalizedAktif)
    .input("TipeModul", sql.VarChar(30), TIPE_MODUL)
    .query(`
      UPDATE [dbo].[MstTimPenerimaan]
      SET
        NamaTim = @NamaTim,
        Keterangan = @Keterangan,
        Aktif = @Aktif
      WHERE IdTim = @IdTim AND TipeModul = @TipeModul;
    `);

  return getById(idTim);
}

async function remove(idTim) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("IdTim", sql.Int, idTim)
    .input("TipeModul", sql.VarChar(30), TIPE_MODUL)
    .query(`DELETE FROM [dbo].[MstTimPenerimaan] WHERE IdTim = @IdTim AND TipeModul = @TipeModul;`);

  if ((result.rowsAffected && result.rowsAffected[0]) === 0) {
    throw notFound("Data tim penerimaan bahan pendukung tidak ditemukan");
  }

  return true;
}

module.exports = { listAll, getById, create, update, remove };

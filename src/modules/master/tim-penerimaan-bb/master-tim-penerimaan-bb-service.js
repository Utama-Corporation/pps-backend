// master-tim-penerimaan-bb-service.js
const { poolPromise, sql } = require("../../../core/config/db");
const { badReq, notFound } = require("../../../core/utils/http-error");

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

  const conditions = [];

  if (!includeInactive) {
    conditions.push("a.Aktif = 1");
  }

  if (q && q.trim().length > 0) {
    conditions.push("(a.NamaTim LIKE @q OR b.NamaOperator LIKE @q)");
    request.input("q", `%${q.trim()}%`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT
      a.IdTim,
      a.NamaTim,
      a.KepalaTim,
      b.NamaOperator AS NamaKepalaTim,
      a.Keterangan,
      a.Aktif
    FROM [dbo].[MstTimPenerimaanBB] a
    LEFT JOIN [dbo].[MstOperator] b ON a.KepalaTim = b.IdOperator
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
    .query(`
      SELECT
        a.IdTim,
        a.NamaTim,
        a.KepalaTim,
        b.NamaOperator AS NamaKepalaTim,
        a.Keterangan,
        a.Aktif
      FROM [dbo].[MstTimPenerimaanBB] a
      LEFT JOIN [dbo].[MstOperator] b ON a.KepalaTim = b.IdOperator
      WHERE a.IdTim = @IdTim;
    `);

  return result.recordset[0] || null;
}

function normalizePayload({ namaTim, kepalaTim, keterangan }) {
  const normalizedNamaTim = String(namaTim || "").trim();
  if (!normalizedNamaTim) {
    throw badReq("NamaTim wajib diisi");
  }

  const normalizedKepalaTim =
    kepalaTim === undefined || kepalaTim === null || kepalaTim === ""
      ? null
      : Number(kepalaTim);
  if (normalizedKepalaTim !== null && !Number.isInteger(normalizedKepalaTim)) {
    throw badReq("KepalaTim harus berupa id operator yang valid");
  }

  const normalizedKeterangan =
    keterangan === undefined || keterangan === null || String(keterangan).trim() === ""
      ? null
      : String(keterangan).trim();

  return {
    namaTim: normalizedNamaTim,
    kepalaTim: normalizedKepalaTim,
    keterangan: normalizedKeterangan,
  };
}

async function create({ namaTim, kepalaTim, keterangan }) {
  const payload = normalizePayload({ namaTim, kepalaTim, keterangan });

  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("NamaTim", sql.VarChar(100), payload.namaTim)
    .input("KepalaTim", sql.Int, payload.kepalaTim)
    .input("Keterangan", sql.VarChar(255), payload.keterangan)
    .query(`
      INSERT INTO [dbo].[MstTimPenerimaanBB] (NamaTim, KepalaTim, Keterangan)
      OUTPUT INSERTED.IdTim
      VALUES (@NamaTim, @KepalaTim, @Keterangan);
    `);

  const idTim = result.recordset[0].IdTim;
  return getById(idTim);
}

async function update(idTim, { namaTim, kepalaTim, keterangan, aktif }) {
  const existing = await getById(idTim);
  if (!existing) {
    throw notFound("Data MstTimPenerimaanBB tidak ditemukan");
  }

  const payload = normalizePayload({ namaTim, kepalaTim, keterangan });
  const normalizedAktif =
    aktif === undefined || aktif === null ? existing.Aktif : aktif ? 1 : 0;

  const pool = await poolPromise;
  await pool
    .request()
    .input("IdTim", sql.Int, idTim)
    .input("NamaTim", sql.VarChar(100), payload.namaTim)
    .input("KepalaTim", sql.Int, payload.kepalaTim)
    .input("Keterangan", sql.VarChar(255), payload.keterangan)
    .input("Aktif", sql.Bit, normalizedAktif)
    .query(`
      UPDATE [dbo].[MstTimPenerimaanBB]
      SET
        NamaTim = @NamaTim,
        KepalaTim = @KepalaTim,
        Keterangan = @Keterangan,
        Aktif = @Aktif
      WHERE IdTim = @IdTim;
    `);

  return getById(idTim);
}

async function remove(idTim) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("IdTim", sql.Int, idTim)
    .query(`DELETE FROM [dbo].[MstTimPenerimaanBB] WHERE IdTim = @IdTim;`);

  if ((result.rowsAffected && result.rowsAffected[0]) === 0) {
    throw notFound("Data MstTimPenerimaanBB tidak ditemukan");
  }

  return true;
}

module.exports = { listAll, getById, create, update, remove };

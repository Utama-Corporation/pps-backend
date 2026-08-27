// master-warehouse-group-service.js
//
// CRUD dbo.MstWarehouseGroup — "site" / grup lokasi fisik warehouse.
// Dipakai guard CROSS_WAREHOUSE_NOT_ALLOWED di label-service (updateLabelLocation):
// dua warehouse boleh pindah label tanpa Goods Transfer bila IdWarehouseGroup
// keduanya NON-NULL & SAMA.
const { poolPromise, sql } = require("../../../core/config/db");
const { badReq, notFound, conflict } = require("../../../core/utils/http-error");

async function listAll({
  q = "",
  includeInactive = false,
  orderBy = "NamaGroup",
  orderDir = "ASC",
} = {}) {
  const pool = await poolPromise;
  const request = pool.request();

  const allowedOrderBy = new Set(["IdWarehouseGroup", "NamaGroup", "Aktif"]);
  const orderCol = allowedOrderBy.has(orderBy) ? orderBy : "NamaGroup";
  const dir = orderDir === "DESC" ? "DESC" : "ASC";

  const conditions = ["1 = 1"];
  if (!includeInactive) conditions.push("g.Aktif = 1");
  if (q && q.trim().length > 0) {
    conditions.push("g.NamaGroup LIKE @q");
    request.input("q", `%${q.trim()}%`);
  }

  const result = await request.query(`
    SELECT
      g.IdWarehouseGroup,
      g.NamaGroup,
      g.Keterangan,
      g.Aktif,
      (SELECT COUNT(*) FROM dbo.MstWarehouse w
        WHERE w.IdWarehouseGroup = g.IdWarehouseGroup) AS WarehouseCount
    FROM dbo.MstWarehouseGroup g
    WHERE ${conditions.join(" AND ")}
    ORDER BY ${orderCol} ${dir};
  `);

  return result.recordset || [];
}

async function getById(idWarehouseGroup) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("Id", sql.Int, idWarehouseGroup)
    .query(`
      SELECT
        g.IdWarehouseGroup,
        g.NamaGroup,
        g.Keterangan,
        g.Aktif,
        (SELECT COUNT(*) FROM dbo.MstWarehouse w
          WHERE w.IdWarehouseGroup = g.IdWarehouseGroup) AS WarehouseCount
      FROM dbo.MstWarehouseGroup g
      WHERE g.IdWarehouseGroup = @Id;
    `);

  return result.recordset[0] || null;
}

function normalizePayload({ namaGroup, keterangan }) {
  const normalizedNama = String(namaGroup || "").trim();
  if (!normalizedNama) throw badReq("NamaGroup wajib diisi");
  if (normalizedNama.length > 100) throw badReq("NamaGroup maksimal 100 karakter");

  const normalizedKet =
    keterangan === undefined || keterangan === null || String(keterangan).trim() === ""
      ? null
      : String(keterangan).trim();
  if (normalizedKet && normalizedKet.length > 255)
    throw badReq("Keterangan maksimal 255 karakter");

  return { namaGroup: normalizedNama, keterangan: normalizedKet };
}

async function create({ namaGroup, keterangan }) {
  const payload = normalizePayload({ namaGroup, keterangan });

  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("NamaGroup", sql.VarChar(100), payload.namaGroup)
    .input("Keterangan", sql.VarChar(255), payload.keterangan)
    .query(`
      INSERT INTO dbo.MstWarehouseGroup (NamaGroup, Keterangan)
      OUTPUT INSERTED.IdWarehouseGroup
      VALUES (@NamaGroup, @Keterangan);
    `);

  return getById(result.recordset[0].IdWarehouseGroup);
}

async function update(idWarehouseGroup, { namaGroup, keterangan, aktif }) {
  const existing = await getById(idWarehouseGroup);
  if (!existing) throw notFound("Group warehouse tidak ditemukan");

  const payload = normalizePayload({ namaGroup, keterangan });
  const normalizedAktif =
    aktif === undefined || aktif === null ? existing.Aktif : aktif ? 1 : 0;

  const pool = await poolPromise;
  await pool
    .request()
    .input("Id", sql.Int, idWarehouseGroup)
    .input("NamaGroup", sql.VarChar(100), payload.namaGroup)
    .input("Keterangan", sql.VarChar(255), payload.keterangan)
    .input("Aktif", sql.Bit, normalizedAktif)
    .query(`
      UPDATE dbo.MstWarehouseGroup
      SET NamaGroup = @NamaGroup,
          Keterangan = @Keterangan,
          Aktif = @Aktif
      WHERE IdWarehouseGroup = @Id;
    `);

  return getById(idWarehouseGroup);
}

async function remove(idWarehouseGroup) {
  const existing = await getById(idWarehouseGroup);
  if (!existing) throw notFound("Group warehouse tidak ditemukan");

  if ((existing.WarehouseCount || 0) > 0) {
    throw conflict(
      `Group masih dipakai ${existing.WarehouseCount} warehouse. ` +
        `Lepas dulu semua warehouse dari group ini sebelum menghapus.`,
    );
  }

  const pool = await poolPromise;
  await pool
    .request()
    .input("Id", sql.Int, idWarehouseGroup)
    .query(`DELETE FROM dbo.MstWarehouseGroup WHERE IdWarehouseGroup = @Id;`);

  return true;
}

module.exports = { listAll, getById, create, update, remove };

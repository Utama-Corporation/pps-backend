// master-barang-dagang-service.js
//
// Read-only lookup dbo.MstBarangDagang (legacy, sudah ada di DB live
// sebelum Flyway) — dipakai sebagai master jenis barang dropdown saat
// tambah item penerimaan barang dagang. Mirror pola query dasar
// master-furniture-material-service.js#getMasterCabinetMaterials, TANPA
// bagian CTE stok/ledger (tidak relevan di sini).
const { poolPromise } = require("../../core/config/db");

async function getMasterBarangDagang() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT
      b.IdBarangDagang,
      b.NamaBarangDagang,
      b.BeratSTD,
      b.Enable,
      b.IdUOM,
      u.NamaUOM,
      b.ItemCode,
      b.PcsPerLabel
    FROM dbo.MstBarangDagang b WITH (NOLOCK)
    LEFT JOIN dbo.MstUOM u WITH (NOLOCK) ON u.IdUOM = b.IdUOM
    WHERE b.Enable = 1
    ORDER BY b.NamaBarangDagang ASC;
  `);

  const data = result.recordset || [];
  return { data, count: data.length };
}

module.exports = { getMasterBarangDagang };

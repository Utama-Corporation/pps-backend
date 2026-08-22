// master-supplier-service.js
const { poolPromise, sql } = require("../../../core/config/db");

async function listAll({ q = "", orderBy = "NmSupplier", orderDir = "ASC" } = {}) {
  const pool = await poolPromise;
  const request = pool.request();

  const allowedOrderBy = new Set(["IdSupplier", "NmSupplier"]);
  const orderCol = allowedOrderBy.has(orderBy) ? orderBy : "NmSupplier";
  const dir = orderDir === "DESC" ? "DESC" : "ASC";

  const conditions = [];

  if (q && q.trim().length > 0) {
    conditions.push("a.NmSupplier LIKE @q");
    request.input("q", `%${q.trim()}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT
      a.IdSupplier,
      a.NmSupplier AS NamaSupplier
    FROM [dbo].[MstSupplier] a
    ${where}
    ORDER BY ${orderCol} ${dir};
  `;

  const result = await request.query(query);
  return result.recordset || [];
}

module.exports = { listAll };

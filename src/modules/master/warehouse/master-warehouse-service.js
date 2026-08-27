// master-warehouse-service.js
const { poolPromise, sql } = require('../../../core/config/db');
const { badReq, notFound } = require('../../../core/utils/http-error');

async function listAll({
  includeDisabled = false,
  q = '',
  orderBy = 'NamaWarehouse',
  orderDir = 'ASC',
}) {
  const pool = await poolPromise;
  const request = pool.request();

  // whitelist biar aman dari SQL injection di ORDER BY
  const allowedOrderBy = new Set(['NamaWarehouse', 'IdWarehouse', 'Enable']);
  const orderCol = allowedOrderBy.has(orderBy) ? orderBy : 'NamaWarehouse';
  const dir = orderDir === 'DESC' ? 'DESC' : 'ASC';

  const whereEnable = includeDisabled ? '1=1' : 'ISNULL(Enable, 1) = 1';
  const hasSearch = q && q.trim().length > 0;

  let where = whereEnable;
  if (hasSearch) {
    where += ' AND (NamaWarehouse LIKE @q)';
    // typed param optional:
    // request.input('q', sql.VarChar(100), `%${q}%`);
    request.input('q', `%${q}%`);
  }

  const query = `
    SELECT
      w.IdWarehouse,
      w.NamaWarehouse,
      w.Enable,
      w.IdWarehouseGroup,
      g.NamaGroup
    FROM [dbo].[MstWarehouse] w
    LEFT JOIN [dbo].[MstWarehouseGroup] g
      ON g.IdWarehouseGroup = w.IdWarehouseGroup
    WHERE ${where}
    ORDER BY ${orderCol} ${dir};
  `;

  const result = await request.query(query);
  return result.recordset || [];
}

/**
 * Set / lepas group (site) sebuah warehouse. Hanya menyentuh kolom
 * IdWarehouseGroup di dbo.MstWarehouse (kolom yang ditambah migration
 * V20260827120001). idWarehouseGroup === null -> lepas dari group.
 */
async function setGroup(idWarehouse, idWarehouseGroup) {
  const idWh = Number(idWarehouse);
  if (!Number.isFinite(idWh) || idWh <= 0) throw badReq('idWarehouse tidak valid');

  const idGroup =
    idWarehouseGroup === undefined ||
    idWarehouseGroup === null ||
    idWarehouseGroup === ''
      ? null
      : Number(idWarehouseGroup);
  if (idGroup !== null && (!Number.isFinite(idGroup) || idGroup <= 0)) {
    throw badReq('idWarehouseGroup tidak valid');
  }

  const pool = await poolPromise;

  const whRes = await pool
    .request()
    .input('IdWarehouse', sql.Int, idWh)
    .query('SELECT TOP 1 IdWarehouse FROM dbo.MstWarehouse WHERE IdWarehouse = @IdWarehouse');
  if (whRes.recordset.length === 0) throw notFound('Warehouse tidak ditemukan');

  if (idGroup !== null) {
    const grpRes = await pool
      .request()
      .input('Id', sql.Int, idGroup)
      .query('SELECT TOP 1 IdWarehouseGroup FROM dbo.MstWarehouseGroup WHERE IdWarehouseGroup = @Id');
    if (grpRes.recordset.length === 0) throw notFound('Group warehouse tidak ditemukan');
  }

  await pool
    .request()
    .input('IdWarehouse', sql.Int, idWh)
    .input('IdWarehouseGroup', sql.Int, idGroup)
    .query('UPDATE dbo.MstWarehouse SET IdWarehouseGroup = @IdWarehouseGroup WHERE IdWarehouse = @IdWarehouse');

  const rows = await listAll({ includeDisabled: true });
  return rows.find((r) => Number(r.IdWarehouse) === idWh) || null;
}

module.exports = { listAll, setGroup };

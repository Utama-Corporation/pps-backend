// master-warehouse-controller.js
const service = require('./master-warehouse-service');

async function list(req, res) {
  const includeDisabled = String(req.query.includeDisabled || '0') === '1';
  const q = (req.query.q || '').toString().trim();
  const orderBy = (req.query.orderBy || 'NamaWarehouse').toString();
  const orderDir =
    (req.query.orderDir || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  try {
    const rows = await service.listAll({ includeDisabled, q, orderBy, orderDir });
    return res.status(200).json({
      success: true,
      message: 'Data MstWarehouse berhasil diambil',
      includeDisabled,
      totalData: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('Error listing MstWarehouse (no pagination):', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message,
    });
  }
}

async function setGroup(req, res) {
  const idWarehouse = parseInt(req.params.idWarehouse, 10);
  if (!Number.isFinite(idWarehouse) || idWarehouse <= 0) {
    return res
      .status(400)
      .json({ success: false, message: 'Parameter idWarehouse tidak valid' });
  }

  try {
    const data = await service.setGroup(idWarehouse, req.body?.idWarehouseGroup);
    return res.status(200).json({
      success: true,
      message: 'Group warehouse berhasil diperbarui',
      data,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error('Error setGroup MstWarehouse:', error);
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? 'Internal Server Error' : error.message,
      ...(statusCode === 500 ? { error: error.message } : {}),
    });
  }
}

module.exports = { list, setGroup };

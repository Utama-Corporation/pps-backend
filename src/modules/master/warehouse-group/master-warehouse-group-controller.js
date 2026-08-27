// master-warehouse-group-controller.js
const service = require("./master-warehouse-group-service");

function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function fail(res, error, ctx) {
  const statusCode = error.statusCode || 500;
  console.error(`Error ${ctx} MstWarehouseGroup:`, error);
  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? "Internal Server Error" : error.message,
    ...(statusCode === 500 ? { error: error.message } : {}),
  });
}

async function list(req, res) {
  const q = (req.query.q || "").toString().trim();
  const includeInactive = String(req.query.includeInactive || "0") === "1";
  const orderBy = (req.query.orderBy || "NamaGroup").toString();
  const orderDir =
    (req.query.orderDir || "ASC").toString().toUpperCase() === "DESC" ? "DESC" : "ASC";

  try {
    const rows = await service.listAll({ q, includeInactive, orderBy, orderDir });
    return res.status(200).json({
      success: true,
      message: "Data group warehouse berhasil diambil",
      totalData: rows.length,
      data: rows,
    });
  } catch (error) {
    return fail(res, error, "listing");
  }
}

async function getById(req, res) {
  const id = parseId(req.params.id);
  if (!id)
    return res.status(400).json({ success: false, message: "Parameter id tidak valid" });

  try {
    const row = await service.getById(id);
    if (!row)
      return res
        .status(404)
        .json({ success: false, message: "Group warehouse tidak ditemukan" });
    return res
      .status(200)
      .json({ success: true, message: "Data group warehouse berhasil diambil", data: row });
  } catch (error) {
    return fail(res, error, "get");
  }
}

async function create(req, res) {
  try {
    const data = await service.create({
      namaGroup: req.body?.namaGroup,
      keterangan: req.body?.keterangan,
    });
    return res
      .status(201)
      .json({ success: true, message: "Group warehouse berhasil dibuat", data });
  } catch (error) {
    return fail(res, error, "creating");
  }
}

async function update(req, res) {
  const id = parseId(req.params.id);
  if (!id)
    return res.status(400).json({ success: false, message: "Parameter id tidak valid" });

  try {
    const data = await service.update(id, {
      namaGroup: req.body?.namaGroup,
      keterangan: req.body?.keterangan,
      aktif: req.body?.aktif,
    });
    return res
      .status(200)
      .json({ success: true, message: "Group warehouse berhasil diperbarui", data });
  } catch (error) {
    return fail(res, error, "updating");
  }
}

async function remove(req, res) {
  const id = parseId(req.params.id);
  if (!id)
    return res.status(400).json({ success: false, message: "Parameter id tidak valid" });

  try {
    await service.remove(id);
    return res
      .status(200)
      .json({ success: true, message: "Group warehouse berhasil dihapus" });
  } catch (error) {
    return fail(res, error, "deleting");
  }
}

module.exports = { list, getById, create, update, remove };

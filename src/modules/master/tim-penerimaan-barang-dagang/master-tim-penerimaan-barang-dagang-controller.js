// master-tim-penerimaan-barang-dagang-controller.js
const service = require("./master-tim-penerimaan-barang-dagang-service");

function parseId(raw) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function list(req, res) {
  const q = (req.query.q || "").toString().trim();
  const includeInactive = String(req.query.includeInactive || "0") === "1";
  const orderBy = (req.query.orderBy || "NamaTim").toString();
  const orderDir =
    (req.query.orderDir || "ASC").toString().toUpperCase() === "DESC" ? "DESC" : "ASC";

  try {
    const rows = await service.listAll({ q, includeInactive, orderBy, orderDir });
    return res.status(200).json({
      success: true,
      message: "Data tim penerimaan barang dagang berhasil diambil",
      totalData: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Error listing tim penerimaan barang dagang:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

async function getById(req, res) {
  const idTim = parseId(req.params.idTim);
  if (!idTim) {
    return res.status(400).json({ success: false, message: "Parameter idTim tidak valid" });
  }

  try {
    const row = await service.getById(idTim);
    if (!row) {
      return res.status(404).json({ success: false, message: "Data tim penerimaan barang dagang tidak ditemukan" });
    }

    return res.status(200).json({ success: true, message: "Data tim penerimaan barang dagang berhasil diambil", data: row });
  } catch (error) {
    console.error("Error get tim penerimaan barang dagang:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
}

async function create(req, res) {
  try {
    const data = await service.create({
      namaTim: req.body?.namaTim,
      keterangan: req.body?.keterangan,
    });

    return res.status(201).json({ success: true, message: "Tim penerimaan barang dagang berhasil dibuat", data });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error("Error creating tim penerimaan barang dagang:", error);
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? "Internal Server Error" : error.message,
      ...(statusCode === 500 ? { error: error.message } : {}),
    });
  }
}

async function update(req, res) {
  const idTim = parseId(req.params.idTim);
  if (!idTim) {
    return res.status(400).json({ success: false, message: "Parameter idTim tidak valid" });
  }

  try {
    const data = await service.update(idTim, {
      namaTim: req.body?.namaTim,
      keterangan: req.body?.keterangan,
      aktif: req.body?.aktif,
    });

    return res.status(200).json({ success: true, message: "Tim penerimaan barang dagang berhasil diperbarui", data });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error("Error updating tim penerimaan barang dagang:", error);
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? "Internal Server Error" : error.message,
      ...(statusCode === 500 ? { error: error.message } : {}),
    });
  }
}

async function remove(req, res) {
  const idTim = parseId(req.params.idTim);
  if (!idTim) {
    return res.status(400).json({ success: false, message: "Parameter idTim tidak valid" });
  }

  try {
    await service.remove(idTim);
    return res.status(200).json({ success: true, message: "Tim penerimaan barang dagang berhasil dihapus" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error("Error deleting tim penerimaan barang dagang:", error);
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? "Internal Server Error" : error.message,
      ...(statusCode === 500 ? { error: error.message } : {}),
    });
  }
}

module.exports = { list, getById, create, update, remove };

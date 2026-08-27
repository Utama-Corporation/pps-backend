// penerimaan-barang-dagang-controller.js
const service = require("./penerimaan-barang-dagang-service");
const {
  getActorId,
  getActorUsername,
  makeRequestId,
} = require("../../../core/utils/http-context");

function buildCtx(req) {
  return {
    actorId: getActorId(req),
    actorUsername: getActorUsername(req) || "system",
    requestId: makeRequestId(req),
  };
}

async function timStatus(req, res) {
  try {
    const data = await service.getTimStatus();
    return res.status(200).json({
      success: true,
      message: "Status tim penerimaan barang dagang berhasil diambil",
      data,
    });
  } catch (error) {
    console.error("Error getting tim status PenerimaanBarangDagang:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
}

async function list(req, res) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSizeRaw = parseInt(req.query.pageSize, 10) || 20;
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 100);
  const filter = req.query.filter ? String(req.query.filter) : "";

  try {
    const { data, total } = await service.listPenerimaanBarangDagang({ page, pageSize, filter });
    return res.status(200).json({
      success: true,
      message: "Data PenerimaanBarangDagang berhasil diambil",
      totalData: total,
      data,
      meta: {
        page,
        pageSize,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
        hasNextPage: page * pageSize < total,
        hasPrevPage: page > 1,
        filter,
      },
    });
  } catch (error) {
    console.error("Error listing PenerimaanBarangDagang:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
}

async function getDetail(req, res) {
  try {
    const data = await service.getDetailPenerimaanBarangDagang(req.params.noPenerimaan);
    if (!data) {
      return res.status(404).json({ success: false, message: "Data PenerimaanBarangDagang tidak ditemukan" });
    }
    return res.status(200).json({ success: true, message: "Data PenerimaanBarangDagang berhasil diambil", data });
  } catch (error) {
    console.error("Error get detail PenerimaanBarangDagang:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
}

async function createHeader(req, res) {
  const ctx = buildCtx(req);
  try {
    const data = await service.createHeaderPenerimaanBarangDagang(req.body || {}, ctx);
    return res.status(201).json({
      success: true,
      message: "Header penerimaan barang dagang berhasil dibuat",
      data,
      meta: { audit: ctx },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error("Error creating PenerimaanBarangDagang header:", error);
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? "Internal Server Error" : error.message,
      ...(statusCode === 500 ? { error: error.message } : {}),
      meta: { audit: ctx },
    });
  }
}

async function addItems(req, res) {
  const ctx = buildCtx(req);
  try {
    const data = await service.addItemsPenerimaanBarangDagang(req.params.noPenerimaan, req.body || {}, ctx);
    return res.status(201).json({
      success: true,
      message: "Barang penerimaan barang dagang berhasil disimpan",
      data,
      meta: { audit: ctx },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error("Error adding items to PenerimaanBarangDagang:", error);
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? "Internal Server Error" : error.message,
      ...(statusCode === 500 ? { error: error.message } : {}),
      meta: { audit: ctx },
    });
  }
}

async function remove(req, res) {
  const ctx = buildCtx(req);
  try {
    await service.deletePenerimaanBarangDagang(req.params.noPenerimaan, ctx);
    return res.status(200).json({ success: true, message: "Penerimaan barang dagang berhasil dihapus" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error("Error deleting PenerimaanBarangDagang:", error);
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? "Internal Server Error" : error.message,
      ...(statusCode === 500 ? { error: error.message } : {}),
    });
  }
}

async function complete(req, res) {
  const ctx = buildCtx(req);
  try {
    await service.completePenerimaanBarangDagang(req.params.noPenerimaan, ctx);
    return res.status(200).json({ success: true, message: "Penerimaan barang dagang ditandai selesai" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error("Error completing PenerimaanBarangDagang:", error);
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? "Internal Server Error" : error.message,
      ...(statusCode === 500 ? { error: error.message } : {}),
    });
  }
}

module.exports = { list, getDetail, createHeader, addItems, remove, timStatus, complete };

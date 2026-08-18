// penerimaan-bahan-baku-controller.js
const service = require("./penerimaan-bahan-baku-service");
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
      message: "Status tim penerimaan bahan baku berhasil diambil",
      data,
    });
  } catch (error) {
    console.error("Error getting tim status PenerimaanBahanBaku:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
}

async function list(req, res) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSizeRaw = parseInt(req.query.pageSize, 10) || 20;
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 100);
  const filter = req.query.filter ? String(req.query.filter) : "";
  const kodeKategori = req.query.kodeKategori ? String(req.query.kodeKategori) : "";

  try {
    const { data, total } = await service.listPenerimaanBahanBaku({ page, pageSize, filter, kodeKategori });
    return res.status(200).json({
      success: true,
      message: "Data PenerimaanBahanBaku berhasil diambil",
      totalData: total,
      data,
      meta: {
        page,
        pageSize,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
        hasNextPage: page * pageSize < total,
        hasPrevPage: page > 1,
        filter,
        kodeKategori,
      },
    });
  } catch (error) {
    console.error("Error listing PenerimaanBahanBaku:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
}

async function getDetail(req, res) {
  try {
    const data = await service.getDetailPenerimaanBahanBaku(req.params.noPenerimaan);
    if (!data) {
      return res.status(404).json({ success: false, message: "Data PenerimaanBahanBaku tidak ditemukan" });
    }
    return res.status(200).json({ success: true, message: "Data PenerimaanBahanBaku berhasil diambil", data });
  } catch (error) {
    console.error("Error get detail PenerimaanBahanBaku:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
  }
}

async function create(req, res) {
  const ctx = buildCtx(req);
  try {
    const data = await service.createPenerimaanBahanBaku(req.body || {}, ctx);
    return res.status(201).json({
      success: true,
      message: "Penerimaan bahan baku berhasil dibuat",
      data,
      meta: { audit: ctx },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error("Error creating PenerimaanBahanBaku:", error);
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
    await service.deletePenerimaanBahanBaku(req.params.noPenerimaan, ctx);
    return res.status(200).json({ success: true, message: "Penerimaan bahan baku berhasil dihapus" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error("Error deleting PenerimaanBahanBaku:", error);
    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? "Internal Server Error" : error.message,
      ...(statusCode === 500 ? { error: error.message } : {}),
    });
  }
}

module.exports = { list, getDetail, create, remove, timStatus };

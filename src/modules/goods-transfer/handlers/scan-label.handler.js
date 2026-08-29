const { sql, poolPromise } = require("../../../core/config/db");
const { badReq, notFound, conflict } = require("../../../core/utils/http-error");
const { applyAuditContext } = require("../../../core/utils/db-audit-context");
const {
  detectCategory,
  normalizeLabelCode,
  CATEGORY_CONFIG,
} = require("../goods-transfer-category-registry");

// IdWarehouse pemilik sebuah Blok — sumber kebenaran adalah dbo.MstBlok,
// bukan kolom IdWarehouse pada tabel label yang bisa basi.
async function resolveWarehouseForBlok(tx, blok) {
  const b = String(blok ?? "").trim().toUpperCase();
  if (!b) return null;
  const res = await new sql.Request(tx)
    .input("Blok", sql.VarChar(100), b)
    .query(`SELECT TOP 1 IdWarehouse FROM dbo.MstBlok WHERE Blok = @Blok`);
  const v = res.recordset[0]?.IdWarehouse;
  return v === null || v === undefined || Number.isNaN(Number(v))
    ? null
    : Number(v);
}

/**
 * Scan 1 label fisik (BA./BB.) untuk memenuhi baris permintaan
 * dbo.GoodsTransferItem_d pada transfer [noTransfer].
 *
 * TIDAK memindahkan/mengonsumsi label — hanya mencatat baris IN_TRANSIT di
 * dbo.GoodsTransferItemScan_d. Perpindahan fisik terjadi saat langkah terima
 * (acceptScannedItem).
 *
 * options.confirmPartial: kalau pcs label melebihi sisa kebutuhan baris,
 * default akan mengembalikan { needsConfirmation: true }. Panggil ulang
 * dengan confirmPartial=true untuk mencatat scan sejumlah sisa kebutuhan saja.
 */
async function scanLabel(noTransfer, noLabelRaw, ctx, options = {}) {
  const no = String(noTransfer || "").trim();
  if (!no) throw badReq("noTransfer wajib");

  const noLabel = normalizeLabelCode(noLabelRaw);
  if (!noLabel) throw badReq("noLabel wajib");

  const confirmPartial = options.confirmPartial === true;

  const category = detectCategory(noLabel);
  if (!category) {
    throw badReq(
      `Label ${noLabel} bukan kategori yang valid untuk Goods Transfer (harus BA./BB.)`,
    );
  }
  const cfg = CATEGORY_CONFIG[category];

  const actorIdNum = Number(ctx?.actorId);
  if (!Number.isFinite(actorIdNum) || actorIdNum <= 0) {
    throw badReq("ctx.actorId wajib. Controller harus inject dari token.");
  }
  const auditCtx = {
    actorId: Math.trunc(actorIdNum),
    actorUsername: String(ctx?.actorUsername || "").trim() || "system",
    requestId: String(ctx?.requestId || "").trim(),
  };

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    await applyAuditContext(new sql.Request(tx), auditCtx);

    // 1) Lock header
    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(20), no).query(`
        SELECT NoTransfer, IdWarehouseAsal, IdWarehouseTujuan, Status
        FROM dbo.GoodsTransfer_h WITH (UPDLOCK, HOLDLOCK)
        WHERE NoTransfer = @No
      `);
    const header = headerRes.recordset?.[0];
    if (!header) throw notFound(`Goods Transfer ${no} tidak ditemukan`);

    // Setelah transfer ditandai "Kirim" (Status <> IN_TRANSIT) scan dikunci.
    if (header.Status !== "IN_TRANSIT") {
      throw conflict(
        `Transfer ${no} sudah berstatus ${header.Status} — scan label dikunci`,
      );
    }

    // 2) Lock parent label + baca pcs/jenis/blok
    const parentRes = await new sql.Request(tx)
      .input("NoLabel", sql.VarChar(50), noLabel).query(`
        SELECT ${cfg.parentColumn} AS NoLabel, ${cfg.jenisColumn} AS IdJenis,
               Pcs AS ParentPcs, Blok
        FROM dbo.${cfg.parentTable} WITH (UPDLOCK, HOLDLOCK)
        WHERE ${cfg.parentColumn} = @NoLabel AND DateUsage IS NULL
      `);
    const parent = parentRes.recordset?.[0];
    if (!parent) {
      throw badReq(`Label ${noLabel} tidak ditemukan atau sudah terpakai`);
    }

    // 3) Guard asal: blok label saat ini harus milik warehouse asal transfer
    const labelWarehouse = await resolveWarehouseForBlok(tx, parent.Blok);
    if (labelWarehouse === null || labelWarehouse !== header.IdWarehouseAsal) {
      const err = badReq(
        `Label ${noLabel} berada di blok ${parent.Blok ?? "-"} yang bukan milik warehouse asal transfer ${no}`,
      );
      err.code = "WAREHOUSE_MISMATCH";
      err.statusCode = 409;
      throw err;
    }

    // 4) availablePcs = Pcs - SUM(partial) - SUM(scan IN_TRANSIT label ini)
    const partialRes = await new sql.Request(tx)
      .input("NoLabel", sql.VarChar(50), noLabel).query(`
        SELECT ISNULL(SUM(Pcs), 0) AS PartialPcs
        FROM dbo.${cfg.partialTable} WITH (UPDLOCK, HOLDLOCK)
        WHERE ${cfg.partialParentColumn} = @NoLabel
      `);
    const reservedRes = await new sql.Request(tx)
      .input("NoLabel", sql.VarChar(50), noLabel).query(`
        SELECT ISNULL(SUM(Pcs), 0) AS ReservedPcs
        FROM dbo.GoodsTransferItemScan_d WITH (UPDLOCK, HOLDLOCK)
        WHERE LabelCode = @NoLabel AND IsReceived = 0
      `);
    const parentPcs = Number(parent.ParentPcs || 0);
    const partialPcs = Number(partialRes.recordset?.[0]?.PartialPcs || 0);
    const reservedPcs = Number(reservedRes.recordset?.[0]?.ReservedPcs || 0);
    const availablePcs = Math.max(
      Math.round(parentPcs - partialPcs - reservedPcs),
      0,
    );
    if (availablePcs <= 0) {
      throw badReq(
        `Label ${noLabel} sudah habis pcs-nya atau sudah dipesan transfer lain`,
      );
    }

    // 5) Cari baris permintaan yang cocok
    const lineRes = await new sql.Request(tx)
      .input("No", sql.VarChar(20), no)
      .input("KodeKategori", sql.VarChar(20), category)
      .input("IdJenis", sql.Int, parent.IdJenis).query(`
        SELECT KodeKategori, IdJenis, Pcs AS PcsRequired
        FROM dbo.GoodsTransferItem_d WITH (UPDLOCK, HOLDLOCK)
        WHERE NoTransfer = @No AND KodeKategori = @KodeKategori AND IdJenis = @IdJenis
      `);
    const line = lineRes.recordset?.[0];
    if (!line) {
      throw badReq(
        `Jenis label ${noLabel} tidak sesuai dengan permintaan transfer ${no}`,
      );
    }

    // 6) Sisa kuota baris ini
    const scannedRes = await new sql.Request(tx)
      .input("No", sql.VarChar(20), no)
      .input("KodeKategori", sql.VarChar(20), category)
      .input("IdJenis", sql.Int, parent.IdJenis).query(`
        SELECT ISNULL(SUM(Pcs), 0) AS PcsScanned
        FROM dbo.GoodsTransferItemScan_d WITH (UPDLOCK, HOLDLOCK)
        WHERE NoTransfer = @No AND KodeKategori = @KodeKategori
          AND IdJenis = @IdJenis
      `);
    const pcsScannedBefore = Number(scannedRes.recordset?.[0]?.PcsScanned || 0);
    const pcsRequired = Number(line.PcsRequired || 0);
    const sisaKuota = pcsRequired - pcsScannedBefore;
    if (sisaKuota <= 0) {
      throw badReq(`Permintaan jenis ini pada transfer ${no} sudah terpenuhi`);
    }

    // 7) Tentukan pcs yang dicatat — TANPA konsumsi label / tanpa partial.
    let consumedPcs;
    if (availablePcs <= sisaKuota) {
      consumedPcs = availablePcs;
    } else if (!confirmPartial) {
      await tx.rollback();
      return {
        needsConfirmation: true,
        noTransfer: no,
        kodeKategori: category,
        idJenis: parent.IdJenis,
        noLabel,
        availablePcs,
        pcsNeeded: sisaKuota,
        message:
          `Label ${noLabel} berisi ${availablePcs} pcs, sedangkan sisa kebutuhan ` +
          `jenis ini hanya ${sisaKuota} pcs. Catat ${sisaKuota} pcs saja untuk ` +
          `transfer ${no}? Sisa ${availablePcs - sisaKuota} pcs tetap tersedia ` +
          `di label asal.`,
      };
    } else {
      consumedPcs = sisaKuota;
    }

    // 8) Catat baris scan (IsReceived default 0). Pencocokan ke baris permintaan
    //    via NoTransfer + KodeKategori + IdJenis (GoodsTransferItem_d tidak
    //    punya surrogate key).
    await new sql.Request(tx)
      .input("No", sql.VarChar(20), no)
      .input("KodeKategori", sql.VarChar(20), category)
      .input("IdJenis", sql.Int, parent.IdJenis)
      .input("NoLabel", sql.VarChar(50), noLabel)
      .input("Pcs", sql.Int, consumedPcs)
      .input("IdUsernameScan", sql.Int, auditCtx.actorId).query(`
        INSERT INTO dbo.GoodsTransferItemScan_d
          (NoTransfer, KodeKategori, IdJenis, LabelCode, Pcs, IdUsernameScan)
        VALUES
          (@No, @KodeKategori, @IdJenis, @NoLabel, @Pcs, @IdUsernameScan)
      `);

    // 9) Apakah semua baris permintaan sudah terpenuhi?
    const remainingRes = await new sql.Request(tx)
      .input("No", sql.VarChar(20), no).query(`
        SELECT COUNT(1) AS Remaining
        FROM dbo.GoodsTransferItem_d d
        WHERE d.NoTransfer = @No
          AND ISNULL((
            SELECT SUM(s.Pcs) FROM dbo.GoodsTransferItemScan_d s
            WHERE s.NoTransfer = d.NoTransfer
              AND s.KodeKategori = d.KodeKategori
              AND s.IdJenis = d.IdJenis
          ), 0) < d.Pcs
      `);
    const shippedComplete =
      Number(remainingRes.recordset?.[0]?.Remaining || 0) === 0;

    await tx.commit();

    const pcsScannedAfter = pcsScannedBefore + consumedPcs;
    return {
      noTransfer: no,
      kodeKategori: category,
      idJenis: parent.IdJenis,
      labelCode: noLabel,
      pcs: consumedPcs,
      lineProgress: {
        pcsRequired,
        pcsScanned: pcsScannedAfter,
        isComplete: pcsScannedAfter >= pcsRequired,
      },
      shippedComplete,
      audit: auditCtx,
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
}

module.exports = { scanLabel };

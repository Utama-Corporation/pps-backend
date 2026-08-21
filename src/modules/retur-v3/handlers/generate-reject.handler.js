// src/modules/retur-v3/handlers/generate-reject.handler.js
const { sql, poolPromise } = require("../../../core/config/db");
const {
  generateNextCode,
} = require("../../../core/utils/sequence-code-helper");
const { badReq, conflict, notFound } = require("../../../core/utils/http-error");
const { applyAuditContext } = require("../../../core/utils/db-audit-context");

// KategoriInput=REJECT => body must supply {berat, idReject}; generates a
// RejectV2 label instead of a barangjadi/furniturewip label. Insert shape
// copied verbatim from sortir-reject-v2 create-reject.handler.js.
exports.generateRejectLabel = async (noRetur, idItem, body, ctx) => {
  const { actorId, actorUsername, requestId } = ctx;
  const berat = Number(body?.berat);
  const idReject = Number(body?.idReject);

  if (!Number.isFinite(berat) || berat <= 0) {
    throw badReq("berat wajib diisi dan lebih dari 0");
  }
  if (!Number.isFinite(idReject) || idReject <= 0) {
    throw badReq("idReject wajib diisi");
  }

  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await applyAuditContext(new sql.Request(tx), {
      actorId,
      actorUsername,
      requestId,
    });

    const headerRes = await new sql.Request(tx)
      .input("No", sql.VarChar(50), noRetur)
      .query(
        `SELECT StatusRetur FROM dbo.BJReturV3_h WITH (UPDLOCK, HOLDLOCK) WHERE NoRetur=@No`,
      );
    const header = headerRes.recordset[0];
    if (!header) throw notFound(`NoRetur ${noRetur} tidak ditemukan`);
    if (!["DIGANTI", "TIDAK_DIGANTI"].includes(header.StatusRetur)) {
      throw conflict(
        "Generate label hanya bisa dilakukan setelah keputusan PIC (DIGANTI/TIDAK_DIGANTI)",
      );
    }

    const itemRes = await new sql.Request(tx)
      .input("Id", sql.Int, idItem)
      .input("No", sql.VarChar(50), noRetur)
      .query(
        `SELECT * FROM dbo.BJReturV3Item_d WITH (UPDLOCK, HOLDLOCK) WHERE IdItem=@Id AND NoRetur=@No`,
      );
    const item = itemRes.recordset[0];
    if (!item) throw notFound(`Item ${idItem} tidak ditemukan pada retur ${noRetur}`);
    if (item.GeneratedLabelCode) {
      throw conflict("Item sudah memiliki label yang di-generate sebelumnya");
    }
    if (item.KategoriInput !== "REJECT") {
      throw badReq("Item bukan KategoriInput REJECT");
    }

    const rejectExist = await new sql.Request(tx)
      .input("Id", sql.Int, idReject)
      .query(`SELECT 1 FROM dbo.MstReject WHERE IdReject=@Id`);
    if (rejectExist.recordset.length === 0) {
      throw badReq(`idReject ${idReject} tidak ditemukan`);
    }

    const nowDate = new Date();

    const genReject = () =>
      generateNextCode(tx, {
        tableName: "RejectV2",
        columnName: "NoReject",
        prefix: "BF.",
        width: 10,
      });

    let newNoReject = await genReject();
    let exist = await new sql.Request(tx)
      .input("No", sql.VarChar(50), newNoReject)
      .query(`SELECT 1 FROM dbo.RejectV2 WITH (UPDLOCK,HOLDLOCK) WHERE NoReject=@No`);
    if (exist.recordset.length > 0) {
      newNoReject = await genReject();
      exist = await new sql.Request(tx)
        .input("No", sql.VarChar(50), newNoReject)
        .query(`SELECT 1 FROM dbo.RejectV2 WITH (UPDLOCK,HOLDLOCK) WHERE NoReject=@No`);
      if (exist.recordset.length > 0) {
        throw conflict("Gagal generate NoReject unik, coba lagi");
      }
    }

    await new sql.Request(tx)
      .input("NoReject", sql.VarChar(50), newNoReject)
      .input("IdReject", sql.Int, idReject)
      .input("DateCreate", sql.Date, nowDate)
      .input("DateUsage", sql.Date, null)
      .input("IdWarehouse", sql.Int, null)
      .input("Berat", sql.Decimal(18, 3), berat)
      .input("Jam", sql.VarChar(20), null)
      .input("CreateBy", sql.VarChar(50), actorUsername)
      .input("DateTimeCreate", sql.DateTime, nowDate)
      .input("IsPartial", sql.Bit, 0)
      .input("Blok", sql.VarChar(50), null)
      .input("IdLokasi", sql.Int, null).query(`
        INSERT INTO dbo.RejectV2 (
          NoReject, IdReject, DateCreate, DateUsage, IdWarehouse,
          Berat, Jam, CreateBy, DateTimeCreate, IsPartial, Blok, IdLokasi
        ) VALUES (
          @NoReject, @IdReject, @DateCreate, @DateUsage, @IdWarehouse,
          @Berat, @Jam, @CreateBy, @DateTimeCreate, @IsPartial, @Blok, @IdLokasi
        )
      `);

    await new sql.Request(tx)
      .input("Id", sql.Int, idItem)
      .input("Code", sql.VarChar(50), newNoReject)
      .input("Berat", sql.Decimal(18, 3), berat)
      .input("IdReject", sql.Int, idReject).query(`
        UPDATE dbo.BJReturV3Item_d
        SET GeneratedLabelCode=@Code, Berat=@Berat, IdReject=@IdReject
        WHERE IdItem=@Id
      `);

    await tx.commit();

    return {
      noRetur,
      idItem,
      labelCode: newNoReject,
      kodeKategori: "reject",
      berat,
      idReject,
      audit: { actorId, requestId },
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

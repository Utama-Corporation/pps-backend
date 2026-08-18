// src/modules/retur-v3/handlers/generate-furniture-wip.handler.js
const { sql, poolPromise } = require("../../../core/config/db");
const {
  generateNextCode,
} = require("../../../core/utils/sequence-code-helper");
const { badReq, conflict, notFound } = require("../../../core/utils/http-error");
const { applyAuditContext } = require("../../../core/utils/db-audit-context");

// KategoriInput=BAGUS, KodeKategori=furniturewip => generate a normal
// FurnitureWIP label matching the item's IdJenis/Pcs. Insert shape copied
// verbatim from furniture-wip-write.repository.js insertFurnitureWipHeader,
// prefix always "BB." per furniture-wip-service.js.
exports.generateFurnitureWipLabel = async (noRetur, idItem, ctx) => {
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  const { actorId, actorUsername, requestId } = ctx;

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
    if (item.KodeKategori !== "furniturewip") {
      throw badReq("Item bukan kategori furniturewip");
    }
    if (item.KategoriInput !== "BAGUS") {
      throw badReq("Item bukan KategoriInput BAGUS");
    }

    const nowDate = new Date();

    const genFw = () =>
      generateNextCode(tx, {
        tableName: "dbo.FurnitureWIP",
        columnName: "NoFurnitureWIP",
        prefix: "BB.",
        width: 10,
      });

    let newNoFurnitureWIP = await genFw();
    let exist = await new sql.Request(tx)
      .input("No", sql.VarChar(50), newNoFurnitureWIP)
      .query(
        `SELECT 1 FROM dbo.FurnitureWIP WITH (UPDLOCK,HOLDLOCK) WHERE NoFurnitureWIP=@No`,
      );
    if (exist.recordset.length > 0) {
      newNoFurnitureWIP = await genFw();
      exist = await new sql.Request(tx)
        .input("No", sql.VarChar(50), newNoFurnitureWIP)
        .query(
          `SELECT 1 FROM dbo.FurnitureWIP WITH (UPDLOCK,HOLDLOCK) WHERE NoFurnitureWIP=@No`,
        );
      if (exist.recordset.length > 0) {
        throw conflict("Gagal generate NoFurnitureWIP unik, coba lagi");
      }
    }

    await new sql.Request(tx)
      .input("NoFurnitureWIP", sql.VarChar(50), newNoFurnitureWIP)
      .input("DateCreate", sql.Date, nowDate)
      .input("Jam", sql.VarChar(20), null)
      .input("Pcs", sql.Decimal(18, 3), Number(item.Pcs))
      .input("IDFurnitureWIP", sql.Int, Number(item.IdJenis))
      .input("Berat", sql.Decimal(18, 3), 0)
      .input("IsPartial", sql.Bit, 0)
      .input("IdWarehouse", sql.Int, null)
      .input("IdWarna", sql.Int, null)
      .input("CreateBy", sql.VarChar(50), actorUsername)
      .input("DateTimeCreate", sql.DateTime, nowDate)
      .input("Blok", sql.VarChar(50), null)
      .input("IdLokasi", sql.Int, null).query(`
        INSERT INTO dbo.FurnitureWIP (
          NoFurnitureWIP, DateCreate, Jam, Pcs, IDFurnitureWIP, Berat, IsPartial, DateUsage,
          IdWarehouse, IdWarna, CreateBy, DateTimeCreate, Blok, IdLokasi
        ) VALUES (@NoFurnitureWIP, @DateCreate, @Jam, @Pcs, @IDFurnitureWIP, @Berat, @IsPartial, NULL,
          @IdWarehouse, @IdWarna, @CreateBy, @DateTimeCreate, @Blok, @IdLokasi)
      `);

    await new sql.Request(tx)
      .input("NoRetur", sql.VarChar(50), noRetur)
      .input("NoFurnitureWIP", sql.VarChar(50), newNoFurnitureWIP)
      .input("IdItem", sql.Int, idItem).query(`
        INSERT INTO dbo.BJReturV3OutputLabelFurnitureWIP (NoRetur, NoFurnitureWIP, IdItem)
        VALUES (@NoRetur, @NoFurnitureWIP, @IdItem)
      `);

    await new sql.Request(tx)
      .input("Id", sql.Int, idItem)
      .input("Code", sql.VarChar(50), newNoFurnitureWIP)
      .query(
        `UPDATE dbo.BJReturV3Item_d SET GeneratedLabelCode=@Code WHERE IdItem=@Id`,
      );

    await tx.commit();

    return {
      noRetur,
      idItem,
      labelCode: newNoFurnitureWIP,
      kodeKategori: "furniturewip",
      pcs: Number(item.Pcs),
      audit: { actorId, requestId },
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) {}
    throw e;
  }
};

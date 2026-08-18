// src/modules/retur-v3/handlers/generate-barang-jadi.handler.js
const { sql, poolPromise } = require("../../../core/config/db");
const {
  generateNextCode,
} = require("../../../core/utils/sequence-code-helper");
const { badReq, conflict, notFound } = require("../../../core/utils/http-error");
const { applyAuditContext } = require("../../../core/utils/db-audit-context");

// KategoriInput=BAGUS, KodeKategori=barangjadi => generate a normal BarangJadi
// label matching the item's IdJenis/Pcs. Insert shape copied verbatim from
// sortir-reject-v2 create-barang-jadi.handler.js.
exports.generateBarangJadiLabel = async (noRetur, idItem, ctx) => {
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
    if (header.StatusRetur !== "TIDAK_DIGANTI") {
      throw conflict(
        "Generate label hanya bisa dilakukan saat StatusRetur=TIDAK_DIGANTI",
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
    if (item.KodeKategori !== "barangjadi") {
      throw badReq("Item bukan kategori barangjadi");
    }
    if (item.KategoriInput !== "BAGUS") {
      throw badReq("Item bukan KategoriInput BAGUS");
    }

    const nowDate = new Date();

    const genBj = () =>
      generateNextCode(tx, {
        tableName: "BarangJadi",
        columnName: "NoBJ",
        prefix: "BA.",
        width: 10,
      });

    let newNoBJ = await genBj();
    let exist = await new sql.Request(tx)
      .input("No", sql.VarChar(50), newNoBJ)
      .query(`SELECT 1 FROM dbo.BarangJadi WITH (UPDLOCK,HOLDLOCK) WHERE NoBJ=@No`);
    if (exist.recordset.length > 0) {
      newNoBJ = await genBj();
      exist = await new sql.Request(tx)
        .input("No", sql.VarChar(50), newNoBJ)
        .query(`SELECT 1 FROM dbo.BarangJadi WITH (UPDLOCK,HOLDLOCK) WHERE NoBJ=@No`);
      if (exist.recordset.length > 0) {
        throw conflict("Gagal generate NoBJ unik, coba lagi");
      }
    }

    await new sql.Request(tx)
      .input("NoBJ", sql.VarChar(50), newNoBJ)
      .input("DateCreate", sql.Date, nowDate)
      .input("Jam", sql.VarChar(20), null)
      .input("Pcs", sql.Int, Math.trunc(Number(item.Pcs)))
      .input("IdBJ", sql.Int, Number(item.IdJenis))
      .input("Berat", sql.Decimal(18, 3), 0)
      .input("IsPartial", sql.Bit, 0)
      .input("DateUsage", sql.Date, null)
      .input("IdWarehouse", sql.Int, null)
      .input("CreateBy", sql.VarChar(50), actorUsername)
      .input("DateTimeCreate", sql.DateTime, nowDate)
      .input("Blok", sql.VarChar(50), null)
      .input("IdLokasi", sql.Int, null).query(`
        INSERT INTO dbo.BarangJadi (
          NoBJ, DateCreate, Jam, Pcs, IdBJ, Berat, IsPartial, DateUsage,
          IdWarehouse, CreateBy, DateTimeCreate, Blok, IdLokasi
        ) VALUES (
          @NoBJ, @DateCreate, @Jam, @Pcs, @IdBJ, @Berat, @IsPartial, @DateUsage,
          @IdWarehouse, @CreateBy, @DateTimeCreate, @Blok, @IdLokasi
        )
      `);

    await new sql.Request(tx)
      .input("NoRetur", sql.VarChar(50), noRetur)
      .input("NoBJ", sql.VarChar(50), newNoBJ)
      .input("IdItem", sql.Int, idItem).query(`
        INSERT INTO dbo.BJReturV3OutputLabelBarangJadi (NoRetur, NoBJ, IdItem)
        VALUES (@NoRetur, @NoBJ, @IdItem)
      `);

    await new sql.Request(tx)
      .input("Id", sql.Int, idItem)
      .input("Code", sql.VarChar(50), newNoBJ)
      .query(
        `UPDATE dbo.BJReturV3Item_d SET GeneratedLabelCode=@Code WHERE IdItem=@Id`,
      );

    await tx.commit();

    return {
      noRetur,
      idItem,
      labelCode: newNoBJ,
      kodeKategori: "barangjadi",
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

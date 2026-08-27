-- ================================================================
-- Migration: Create dbo.MstWarehouseGroup + MstWarehouse.IdWarehouseGroup (+ FK)
-- ================================================================
-- "Site" / grup lokasi fisik untuk warehouse. Dua warehouse dianggap SATU SITE
-- jika IdWarehouseGroup keduanya NON-NULL dan SAMA. NULL = ungrouped = pindah
-- lintas-warehouse tetap WAJIB lewat Goods Transfer (perilaku sekarang tidak
-- berubah selama belum di-assign).
--
-- Dipakai oleh guard CROSS_WAREHOUSE_NOT_ALLOWED di
-- src/modules/label/all/label-service.js (fungsi updateLabelLocation).
--
-- CATATAN: dbo.MstWarehouse adalah tabel LEGACY yang dimaintain aplikasi LAIN.
-- Perubahan padanya dibuat seaman mungkin:
--   * kolom NULLABLE, tanpa DEFAULT
--   * FK ke MstWarehouseGroup: nullable FK -> baris dgn IdWarehouseGroup NULL
--     (yang akan di-insert aplikasi lain) tetap lolos
-- Idempotent: guard OBJECT_ID / COL_LENGTH / sys.foreign_keys.
-- ================================================================

/* ---------- 1) Master group ---------- */
IF OBJECT_ID('dbo.MstWarehouseGroup', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MstWarehouseGroup (
        IdWarehouseGroup INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_MstWarehouseGroup PRIMARY KEY,
        NamaGroup   VARCHAR(100) NOT NULL,
        Keterangan  VARCHAR(255) NULL,
        Aktif       BIT NOT NULL
            CONSTRAINT DF_MstWarehouseGroup_Aktif DEFAULT (1),
        CreatedAt   DATETIME NOT NULL
            CONSTRAINT DF_MstWarehouseGroup_CreatedAt DEFAULT (GETDATE())
    );
END
GO

/* ---------- 2) Kolom di MstWarehouse ---------- */
IF COL_LENGTH('dbo.MstWarehouse', 'IdWarehouseGroup') IS NULL
    ALTER TABLE dbo.MstWarehouse ADD IdWarehouseGroup INT NULL;
GO

/* ---------- 3) Foreign key ---------- */
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MstWarehouse_WarehouseGroup'
)
    ALTER TABLE dbo.MstWarehouse
        ADD CONSTRAINT FK_MstWarehouse_WarehouseGroup
        FOREIGN KEY (IdWarehouseGroup)
        REFERENCES dbo.MstWarehouseGroup (IdWarehouseGroup);
GO

/* ---------- 4) Seeding (dilakukan DBA setelah migration) ----------
   INSERT dbo.MstWarehouseGroup (NamaGroup, Keterangan) VALUES ('Site A', '...');
   UPDATE dbo.MstWarehouse SET IdWarehouseGroup = <IdWarehouseGroup>
   WHERE IdWarehouse IN (<A>, <B>);
------------------------------------------------------------------- */

-- ================================================================
-- Migration: ganti StatusItem -> IsReceived (BIT) di GoodsTransferItemScan_d
-- ================================================================
-- StatusItem (enum IN_TRANSIT/RECEIVED/...) disederhanakan jadi flag boolean:
--   IsReceived = 0  -> sudah discan pengirim, belum discan penerima
--   IsReceived = 1  -> sudah discan penerima
-- REJECTED / CANCELLED tidak dipakai kode, jadi tidak perlu.
--
-- CATATAN: semua statement yang mereferensikan kolom StatusItem secara
-- langsung dibungkus dynamic SQL (EXEC). SQL Server mengikat nama kolom saat
-- meng-compile seluruh batch, BUKAN saat IF dievaluasi — jadi referensi ke
-- kolom yang sudah tidak ada tetap error "Invalid column name" walau berada
-- di dalam IF yang tidak pernah jalan.
--
-- Idempotent: aman dijalankan ulang.
-- ================================================================

-- 1) Kalau env sempat memakai nama interim "FlagTerima", rename ke IsReceived.
IF COL_LENGTH('dbo.GoodsTransferItemScan_d', 'FlagTerima') IS NOT NULL
   AND COL_LENGTH('dbo.GoodsTransferItemScan_d', 'IsReceived') IS NULL
BEGIN
    IF EXISTS (SELECT 1 FROM sys.default_constraints
               WHERE name = 'DF_GoodsTransferItemScan_d_FlagTerima')
        EXEC sp_rename
            'DF_GoodsTransferItemScan_d_FlagTerima',
            'DF_GoodsTransferItemScan_d_IsReceived';
    EXEC sp_rename
        'dbo.GoodsTransferItemScan_d.FlagTerima', 'IsReceived', 'COLUMN';
END
GO

-- 2) Tambah kolom IsReceived kalau belum ada.
IF COL_LENGTH('dbo.GoodsTransferItemScan_d', 'IsReceived') IS NULL
    ALTER TABLE dbo.GoodsTransferItemScan_d
        ADD IsReceived BIT NOT NULL
            CONSTRAINT DF_GoodsTransferItemScan_d_IsReceived DEFAULT (0);
GO

-- 3) Kolom lama StatusItem masih ada -> backfill + buang index/constraint/kolom.
--    Dibungkus EXEC supaya tidak gagal compile saat StatusItem sudah tiada.
IF COL_LENGTH('dbo.GoodsTransferItemScan_d', 'StatusItem') IS NOT NULL
BEGIN
    EXEC (N'
        UPDATE dbo.GoodsTransferItemScan_d
        SET IsReceived = CASE WHEN StatusItem = ''RECEIVED'' THEN 1 ELSE 0 END;

        IF EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = ''IX_GoodsTransferItemScan_d_Label''
                     AND object_id = OBJECT_ID(''dbo.GoodsTransferItemScan_d''))
            DROP INDEX IX_GoodsTransferItemScan_d_Label ON dbo.GoodsTransferItemScan_d;

        DECLARE @cn sysname;
        SELECT @cn = cc.name FROM sys.check_constraints cc
        WHERE cc.parent_object_id = OBJECT_ID(''dbo.GoodsTransferItemScan_d'')
          AND cc.definition LIKE ''%StatusItem%'';
        IF @cn IS NOT NULL
            EXEC(''ALTER TABLE dbo.GoodsTransferItemScan_d DROP CONSTRAINT '' + @cn);

        DECLARE @dn sysname;
        SELECT @dn = dc.name
        FROM sys.default_constraints dc
        JOIN sys.columns c ON c.object_id = dc.parent_object_id
                          AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID(''dbo.GoodsTransferItemScan_d'')
          AND c.name = ''StatusItem'';
        IF @dn IS NOT NULL
            EXEC(''ALTER TABLE dbo.GoodsTransferItemScan_d DROP CONSTRAINT '' + @dn);

        ALTER TABLE dbo.GoodsTransferItemScan_d DROP COLUMN StatusItem;
    ');
END
GO

-- 4) Pastikan index label ada dengan key (LabelCode, IsReceived).
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_GoodsTransferItemScan_d_Label'
                 AND object_id = OBJECT_ID('dbo.GoodsTransferItemScan_d'))
    CREATE INDEX IX_GoodsTransferItemScan_d_Label
        ON dbo.GoodsTransferItemScan_d ([LabelCode], [IsReceived]);
GO

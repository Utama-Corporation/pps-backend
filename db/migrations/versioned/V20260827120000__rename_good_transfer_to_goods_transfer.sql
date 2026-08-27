-- ================================================================
-- Migration: Ganti fitur LEGACY GoodsTransfer_* dgn fitur BARU (rename GoodTransfer_* -> GoodsTransfer_*)
-- ================================================================
-- Penamaan yang benar adalah "Goods Transfer". Tabel & constraint fitur baru
-- (dibuat di V20260814112634 / V20260814112635 + GoodTransferItem_d yang
-- ditambah out-of-band) di-rename dari "GoodTransfer*" -> "GoodsTransfer*".
--
-- MASALAH: nama "GoodsTransfer_h" + keluarga "GoodsTransfer_d_*" SUDAH dipakai
-- fitur LAMA (histori 2021-2026, ~90k baris). Atas keputusan eksplisit owner,
-- fitur lama DI-DROP dan namanya diambil alih fitur baru.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ !!! WAJIB FULL BACKUP DATABASE SEBELUM MENJALANKAN MIGRATION INI !!!       │
-- │ DROP di bawah menghapus PERMANEN ~90k baris histori transfer gudang lama. │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Dependency fitur lama yang AKAN RUSAK setelah migration ini (di luar scope,
-- owner menyatakan akan menangani sendiri):
--   * pps_backend  : src/modules/master-furniture-material/master-furniture-material-service.js
--                    (CTE "Goods Transfer In/Out" -> saldo Cabinet Material)
--   * app PPS lain : SP_LapStockBahanBaku, SP_LapStockBahanBakuPerWarehouse,
--                    SP_GetCetakGoodTransfer
--
-- Idempotent: aman dijalankan ulang (guard OBJECT_ID / NOT EXISTS).
-- Trigger audit baru dibuat oleh R__tr_Audit_GoodsTransfer_h.sql / ...Item.sql
-- ================================================================

SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

/* ================================================================
   1) DROP fitur LEGACY GoodsTransfer_*
   ================================================================ */

-- 1a) Drop semua FOREIGN KEY yang menempel di GoodsTransfer_h & GoodsTransfer_d_*
--     (nama constraint lama tidak konsisten -> pakai katalog, jangan hardcode)
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql = @sql
     + N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(t.schema_id)) + N'.' + QUOTENAME(t.name)
     + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';' + CHAR(13) + CHAR(10)
FROM sys.foreign_keys fk
JOIN sys.tables t ON t.object_id = fk.parent_object_id
WHERE t.name = N'GoodsTransfer_h'
   OR t.name LIKE N'GoodsTransfer[_]d[_]%'
   OR fk.referenced_object_id = OBJECT_ID(N'dbo.GoodsTransfer_h');
IF @sql <> N'' EXEC sys.sp_executesql @sql;
GO

-- 1b) Drop semua tabel detail legacy GoodsTransfer_d_*
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql = @sql
     + N'DROP TABLE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';' + CHAR(13) + CHAR(10)
FROM sys.tables
WHERE name LIKE N'GoodsTransfer[_]d[_]%';
IF @sql <> N'' EXEC sys.sp_executesql @sql;
GO

-- 1c) Drop header legacy
IF OBJECT_ID(N'dbo.GoodsTransfer_h', N'U') IS NOT NULL
    DROP TABLE dbo.GoodsTransfer_h;
GO

/* ================================================================
   2) Drop trigger audit LAMA fitur baru (dibuat ulang dgn nama baru
      oleh R__tr_Audit_GoodsTransfer_h.sql / R__tr_Audit_GoodsTransferItem.sql)
   ================================================================ */
IF OBJECT_ID(N'dbo.tr_Audit_GoodTransfer_h', N'TR') IS NOT NULL
    DROP TRIGGER dbo.tr_Audit_GoodTransfer_h;
IF OBJECT_ID(N'dbo.tr_Audit_GoodTransferItem', N'TR') IS NOT NULL
    DROP TRIGGER dbo.tr_Audit_GoodTransferItem;
GO

/* ================================================================
   3) Rename tabel fitur baru  GoodTransfer* -> GoodsTransfer*
   ================================================================ */
IF OBJECT_ID(N'dbo.GoodTransfer_h', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.GoodsTransfer_h', N'U') IS NULL
    EXEC sys.sp_rename N'dbo.GoodTransfer_h', N'GoodsTransfer_h';

IF OBJECT_ID(N'dbo.GoodTransferItem', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.GoodsTransferItem', N'U') IS NULL
    EXEC sys.sp_rename N'dbo.GoodTransferItem', N'GoodsTransferItem';

IF OBJECT_ID(N'dbo.GoodTransferItem_d', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.GoodsTransferItem_d', N'U') IS NULL
    EXEC sys.sp_rename N'dbo.GoodTransferItem_d', N'GoodsTransferItem_d';
GO

/* ================================================================
   4) Rename constraint & index  *_GoodTransfer* -> *_GoodsTransfer*
   ================================================================ */
DECLARE @renames TABLE (seq INT IDENTITY(1,1), oldname NVARCHAR(400), newname SYSNAME, kind VARCHAR(10));
INSERT INTO @renames (oldname, newname, kind) VALUES
 -- GoodsTransfer_h
 ('dbo.PK_GoodTransfer_h',                'PK_GoodsTransfer_h',                'OBJECT'),
 ('dbo.FK_GoodTransfer_h_WhAsal',         'FK_GoodsTransfer_h_WhAsal',         'OBJECT'),
 ('dbo.FK_GoodTransfer_h_WhTujuan',       'FK_GoodsTransfer_h_WhTujuan',       'OBJECT'),
 ('dbo.CK_GoodTransfer_h_Status',         'CK_GoodsTransfer_h_Status',         'OBJECT'),
 ('dbo.CK_GoodTransfer_h_WhBeda',         'CK_GoodsTransfer_h_WhBeda',         'OBJECT'),
 ('dbo.DF_GoodTransfer_h_CreatedAt',      'DF_GoodsTransfer_h_CreatedAt',      'OBJECT'),
 ('dbo.DF_GoodTransfer_h_DateTimeKirim',  'DF_GoodsTransfer_h_DateTimeKirim',  'OBJECT'),
 ('dbo.DF_GoodTransfer_h_Status',         'DF_GoodsTransfer_h_Status',         'OBJECT'),
 -- GoodsTransferItem
 ('dbo.PK_GoodTransferItem',              'PK_GoodsTransferItem',              'OBJECT'),
 ('dbo.FK_GoodTransferItem_Header',       'FK_GoodsTransferItem_Header',       'OBJECT'),
 ('dbo.CK_GoodTransferItem_Status',       'CK_GoodsTransferItem_Status',       'OBJECT'),
 ('dbo.DF_GoodTransferItem_CreatedAt',    'DF_GoodsTransferItem_CreatedAt',    'OBJECT'),
 ('dbo.DF_GoodTransferItem_StatusItem',   'DF_GoodsTransferItem_StatusItem',   'OBJECT'),
 -- GoodsTransferItem_d
 ('dbo.PK_GoodTransferItem_d',                 'PK_GoodsTransferItem_d',                 'OBJECT'),
 ('dbo.DF_GoodTransferItem_d_DateTimeCreate',  'DF_GoodsTransferItem_d_DateTimeCreate',  'OBJECT'),
 -- index non-PK (prefix = nama tabel BARU, rename tabel sudah dilakukan di step 3)
 ('dbo.GoodsTransfer_h.IX_GoodTransfer_h_WhAsal_Status',        'IX_GoodsTransfer_h_WhAsal_Status',        'INDEX'),
 ('dbo.GoodsTransfer_h.IX_GoodTransfer_h_WhTujuan_Status',      'IX_GoodsTransfer_h_WhTujuan_Status',      'INDEX'),
 ('dbo.GoodsTransferItem.IX_GoodTransferItem_LabelCode',        'IX_GoodsTransferItem_LabelCode',          'INDEX'),
 ('dbo.GoodsTransferItem.IX_GoodTransferItem_NoTransfer',       'IX_GoodsTransferItem_NoTransfer',         'INDEX'),
 ('dbo.GoodsTransferItem.UX_GoodTransferItem_LabelCode_Active', 'UX_GoodsTransferItem_LabelCode_Active',   'INDEX');

DECLARE @seq INT = 1, @max INT = (SELECT ISNULL(MAX(seq), 0) FROM @renames);
DECLARE @o NVARCHAR(400), @n SYSNAME, @k VARCHAR(10), @idx SYSNAME, @tab NVARCHAR(400);

WHILE @seq <= @max
BEGIN
    SELECT @o = oldname, @n = newname, @k = kind FROM @renames WHERE seq = @seq;

    IF @k = 'OBJECT'
    BEGIN
        IF OBJECT_ID(@o) IS NOT NULL
            AND OBJECT_ID(PARSENAME(@o, 2) + '.' + @n) IS NULL
            EXEC sys.sp_rename @o, @n;
    END
    ELSE
    BEGIN
        SET @idx = PARSENAME(@o, 1);
        SET @tab = QUOTENAME(PARSENAME(@o, 3)) + '.' + QUOTENAME(PARSENAME(@o, 2));
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = @idx AND object_id = OBJECT_ID(@tab))
           AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = @n AND object_id = OBJECT_ID(@tab))
            EXEC sys.sp_rename @o, @n, 'INDEX';
    END

    SET @seq += 1;
END
GO

/* ================================================================
   5) Permission code  good_transfer:*  ->  goods_transfer:*
      (kode lama dibiarkan tetap ada; hanya menambah kode baru + copy grant)
   ================================================================ */
INSERT INTO dbo.MstPermissionList (NoPermission, Permission)
SELECT v.NoPermission, v.Permission
FROM (VALUES
    ('goods_transfer:read',   'Read Goods Transfer'),
    ('goods_transfer:create', 'Create Goods Transfer'),
    ('goods_transfer:update', 'Update Goods Transfer'),
    ('goods_transfer:delete', 'Delete Goods Transfer')
) AS v(NoPermission, Permission)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MstPermissionList p WHERE p.NoPermission = v.NoPermission
);
GO

INSERT INTO dbo.MstUserGroupPermission (IdUGroup, NoPermission, Allow)
SELECT gp.IdUGroup, mapping.NewPermission, gp.Allow
FROM dbo.MstUserGroupPermission gp
INNER JOIN (VALUES
    ('good_transfer:read',   'goods_transfer:read'),
    ('good_transfer:create', 'goods_transfer:create'),
    ('good_transfer:update', 'goods_transfer:update'),
    ('good_transfer:delete', 'goods_transfer:delete')
) AS mapping(OldPermission, NewPermission)
    ON mapping.OldPermission = gp.NoPermission
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.MstUserGroupPermission existing
    WHERE existing.IdUGroup = gp.IdUGroup
      AND existing.NoPermission = mapping.NewPermission
);
GO

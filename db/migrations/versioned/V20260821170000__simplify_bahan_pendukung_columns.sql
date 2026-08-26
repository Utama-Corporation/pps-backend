-- ================================================================
-- Migration: Simplify BahanPendukung columns
-- ================================================================
-- Perubahan:
--   1. DROP COLUMN [Satuan]     — label selalu PCS, tidak perlu disimpan
--   2. DROP COLUMN [NamaBarang] — nama barang diambil dari FK IdCabinetMaterial
--   3. DROP COLUMN [Jam]        — tidak dipakai
--   4. DROP COLUMN [DateCreate] — tidak dipakai
--   5. RENAME [Pcs] → [Qty]    —更语义化的 nama kolom
--   6. DROP COLUMN [DateTimeCreate], tambah [CreatedAt] DATETIME DEFAULT GETDATE()
-- ================================================================

-- 1. Drop Satuan
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BahanPendukung') AND name = 'Satuan')
BEGIN
  ALTER TABLE [dbo].[BahanPendukung] DROP CONSTRAINT [DF_BahanPendukung_Satuan];
  ALTER TABLE [dbo].[BahanPendukung] DROP COLUMN [Satuan];
END
GO

-- 2. Drop NamaBarang
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BahanPendukung') AND name = 'NamaBarang')
BEGIN
  ALTER TABLE [dbo].[BahanPendukung] DROP COLUMN [NamaBarang];
END
GO

-- 3. Drop Jam
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BahanPendukung') AND name = 'Jam')
BEGIN
  ALTER TABLE [dbo].[BahanPendukung] DROP COLUMN [Jam];
END
GO

-- 4. Drop DateCreate
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BahanPendukung') AND name = 'DateCreate')
BEGIN
  ALTER TABLE [dbo].[BahanPendukung] DROP COLUMN [DateCreate];
END
GO

-- 5. Rename Pcs → Qty
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BahanPendukung') AND name = 'Pcs')
  AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BahanPendukung') AND name = 'Qty')
BEGIN
  EXEC sp_rename 'dbo.BahanPendukung.Pcs', 'Qty', 'COLUMN';
END
GO

-- 6. Drop DateTimeCreate, add CreatedAt with GETDATE() default
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BahanPendukung') AND name = 'DateTimeCreate')
BEGIN
  ALTER TABLE [dbo].[BahanPendukung] DROP CONSTRAINT [DF_BahanPendukung_DateTimeCreate];
  ALTER TABLE [dbo].[BahanPendukung] DROP COLUMN [DateTimeCreate];
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BahanPendukung') AND name = 'CreatedAt')
BEGIN
  ALTER TABLE [dbo].[BahanPendukung]
    ADD [CreatedAt] DATETIME NOT NULL CONSTRAINT [DF_BahanPendukung_CreatedAt] DEFAULT (GETDATE());
END
GO

-- 7. Recreate audit trigger (drop lama, buat baru dengan kolom yang benar)
IF EXISTS (SELECT 1 FROM sys.triggers WHERE object_id = OBJECT_ID('dbo.tr_Audit_BahanPendukung'))
  DROP TRIGGER [dbo].[tr_Audit_BahanPendukung];
GO

CREATE TRIGGER [dbo].[tr_Audit_BahanPendukung]
ON [dbo].[BahanPendukung]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @actor nvarchar(128) =
    COALESCE(
      CONVERT(nvarchar(128), TRY_CONVERT(int, SESSION_CONTEXT(N'actor_id'))),
      CAST(SESSION_CONTEXT(N'actor') AS nvarchar(128)),
      SUSER_SNAME()
    );

  DECLARE @rid nvarchar(64) =
    CAST(SESSION_CONTEXT(N'request_id') AS nvarchar(64));

  /* INSERT */
  INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
  SELECT
    'INSERT', 'BahanPendukung', @actor, @rid,
    CONCAT('{"NoBahanPendukung":"', i.NoBahanPendukung, '"}'),
    NULL,
    (SELECT i.NoBahanPendukung, i.IdSupplier, i.IdCabinetMaterial,
            CAST(i.Qty AS decimal(18,3)) AS Qty, i.Keterangan,
            CAST(i.Berat AS decimal(18,3)) AS Berat, i.IsPartial,
            i.DateUsage, i.IdWarna, i.CreateBy, i.CreatedAt,
            i.Blok, i.IdLokasi, i.HasBeenPrinted
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
  FROM inserted i
  LEFT JOIN deleted d ON d.NoBahanPendukung = i.NoBahanPendukung
  WHERE d.NoBahanPendukung IS NULL;

  /* UPDATE */
  INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
  SELECT
    'UPDATE', 'BahanPendukung', @actor, @rid,
    CONCAT('{"NoBahanPendukung":"', i.NoBahanPendukung, '"}'),
    (SELECT d.NoBahanPendukung, d.IdSupplier, d.IdCabinetMaterial,
            CAST(d.Qty AS decimal(18,3)) AS Qty, d.Keterangan,
            CAST(d.Berat AS decimal(18,3)) AS Berat, d.IsPartial,
            d.DateUsage, d.IdWarna, d.CreateBy, d.CreatedAt,
            d.Blok, d.IdLokasi, d.HasBeenPrinted
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
    (SELECT i.NoBahanPendukung, i.IdSupplier, i.IdCabinetMaterial,
            CAST(i.Qty AS decimal(18,3)) AS Qty, i.Keterangan,
            CAST(i.Berat AS decimal(18,3)) AS Berat, i.IsPartial,
            i.DateUsage, i.IdWarna, i.CreateBy, i.CreatedAt,
            i.Blok, i.IdLokasi, i.HasBeenPrinted
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
  FROM inserted i
  JOIN deleted d ON d.NoBahanPendukung = i.NoBahanPendukung;

  /* DELETE */
  INSERT dbo.AuditTrail(Action, TableName, Actor, RequestId, PK, OldData, NewData)
  SELECT
    'DELETE', 'BahanPendukung', @actor, @rid,
    CONCAT('{"NoBahanPendukung":"', d.NoBahanPendukung, '"}'),
    (SELECT d.NoBahanPendukung, d.IdSupplier, d.IdCabinetMaterial,
            CAST(d.Qty AS decimal(18,3)) AS Qty, d.Keterangan,
            CAST(d.Berat AS decimal(18,3)) AS Berat, d.IsPartial,
            d.DateUsage, d.IdWarna, d.CreateBy, d.CreatedAt,
            d.Blok, d.IdLokasi, d.HasBeenPrinted
     FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
    NULL
  FROM deleted d
  LEFT JOIN inserted i ON i.NoBahanPendukung = d.NoBahanPendukung
  WHERE i.NoBahanPendukung IS NULL;
END;
GO

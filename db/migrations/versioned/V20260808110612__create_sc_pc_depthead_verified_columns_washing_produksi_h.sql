-- Menggantikan desain verifikasi single-stage (VerifiedBy/VerifiedAt/VerifiedNote)
-- dengan 3-tahap sesuai format produksi: SC (staff checker), PC (production
-- control), DeptHead. Status tiap tahap ditentukan dari ...VerifiedAt IS NOT NULL;
-- ...VerifiedBy simpan id user saja, konsisten dengan pola lama.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.WashingProduksi_h') AND name = 'SCVerifiedBy'
)
    ALTER TABLE dbo.WashingProduksi_h ADD SCVerifiedBy int NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.WashingProduksi_h') AND name = 'SCVerifiedAt'
)
    ALTER TABLE dbo.WashingProduksi_h ADD SCVerifiedAt datetime2 NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.WashingProduksi_h') AND name = 'PCVerifiedBy'
)
    ALTER TABLE dbo.WashingProduksi_h ADD PCVerifiedBy int NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.WashingProduksi_h') AND name = 'PCVerifiedAt'
)
    ALTER TABLE dbo.WashingProduksi_h ADD PCVerifiedAt datetime2 NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.WashingProduksi_h') AND name = 'DeptHeadVerifiedBy'
)
    ALTER TABLE dbo.WashingProduksi_h ADD DeptHeadVerifiedBy int NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.WashingProduksi_h') AND name = 'DeptHeadVerifiedAt'
)
    ALTER TABLE dbo.WashingProduksi_h ADD DeptHeadVerifiedAt datetime2 NULL;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.WashingProduksi_h') AND name = 'VerifiedBy'
)
    ALTER TABLE dbo.WashingProduksi_h DROP COLUMN VerifiedBy;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.WashingProduksi_h') AND name = 'VerifiedAt'
)
    ALTER TABLE dbo.WashingProduksi_h DROP COLUMN VerifiedAt;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.WashingProduksi_h') AND name = 'VerifiedNote'
)
    ALTER TABLE dbo.WashingProduksi_h DROP COLUMN VerifiedNote;
GO

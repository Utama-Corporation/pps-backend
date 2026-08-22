-- Retur v3: tabel target pengganti (turnover) terpisah dari item retur.
--
-- Sebelumnya BJReturV3Item_d (barang yang KEMBALI) dipakai langsung sebagai
-- acuan scan turnover, dengan asumsi barang pengganti harus persis sama
-- kategori+jenisnya dengan barang yang kembali. Asumsi itu salah: barang
-- pengganti bisa beda kategori/jenis, dan bisa lebih dari satu jenis untuk
-- 1 item retur (mis. 1 item retur diganti kombinasi 2 jenis barang beda).
-- Makanya perlu tabel target terpisah, diisi manual oleh Admin setelah
-- keputusan DIGANTI, sebelum proses scan turnover bisa mulai.
--
-- Trade-off yang disadari & diterima: tidak ada aturan total pcs target
-- harus sama dengan pcs item retur asalnya — bebas ditentukan Admin.

IF OBJECT_ID('[dbo].[BJReturV3TurnoverTarget_d]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[BJReturV3TurnoverTarget_d] (
        [IdTarget]        INT IDENTITY(1,1) NOT NULL,
        [NoRetur]         VARCHAR(50)   NOT NULL,
        [IdItem]          INT           NOT NULL,
        [KodeKategori]    VARCHAR(20)   NOT NULL,
        [IdJenis]         INT           NOT NULL,
        [Pcs]             INT           NOT NULL,
        [CreateBy]        VARCHAR(50)   NULL,
        [DateTimeCreate]  DATETIME2     NOT NULL
            CONSTRAINT [DF_BJReturV3TurnoverTarget_d_DateTimeCreate] DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT [PK_BJReturV3TurnoverTarget_d] PRIMARY KEY CLUSTERED ([IdTarget] ASC),
        CONSTRAINT [FK_BJReturV3TurnoverTarget_d_BJReturV3_h]
            FOREIGN KEY ([NoRetur]) REFERENCES [dbo].[BJReturV3_h] ([NoRetur]),
        CONSTRAINT [FK_BJReturV3TurnoverTarget_d_BJReturV3Item_d]
            FOREIGN KEY ([IdItem]) REFERENCES [dbo].[BJReturV3Item_d] ([IdItem]),
        CONSTRAINT [CK_BJReturV3TurnoverTarget_d_KodeKategori]
            CHECK ([KodeKategori] IN ('barangjadi', 'furniturewip')),
        CONSTRAINT [CK_BJReturV3TurnoverTarget_d_Pcs_Positive]
            CHECK ([Pcs] > 0)
    );
END
GO

-- Data scan turnover lama (kalau ada) di-scan berdasarkan model IdItem yang
-- sekarang tidak berlaku lagi — invalidasi: unlock label yang sempat
-- ditandai terpakai, lalu kosongkan tabel scan-nya, sebelum FK-nya diganti
-- dari IdItem ke IdTarget.
IF COL_LENGTH('dbo.BJReturV3Turnover_d', 'IdItem') IS NOT NULL
BEGIN
    UPDATE bj
    SET bj.DateUsage = NULL
    FROM dbo.BarangJadi bj
    INNER JOIN dbo.BJReturV3Turnover_d tv ON tv.LabelCode = bj.NoBJ;

    UPDATE fw
    SET fw.DateUsage = NULL
    FROM dbo.FurnitureWIP fw
    INNER JOIN dbo.BJReturV3Turnover_d tv ON tv.LabelCode = fw.NoFurnitureWIP;

    DELETE FROM dbo.BJReturV3Turnover_d;
END
GO

IF COL_LENGTH('dbo.BJReturV3Turnover_d', 'IdItem') IS NOT NULL
BEGIN
    DECLARE @fkName NVARCHAR(200) = (
        SELECT fk.name
        FROM sys.foreign_keys fk
        INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        INNER JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
        WHERE fk.parent_object_id = OBJECT_ID('dbo.BJReturV3Turnover_d') AND c.name = 'IdItem'
    );
    IF @fkName IS NOT NULL
        EXEC('ALTER TABLE dbo.BJReturV3Turnover_d DROP CONSTRAINT [' + @fkName + ']');

    ALTER TABLE dbo.BJReturV3Turnover_d DROP COLUMN IdItem;
END
GO

IF COL_LENGTH('dbo.BJReturV3Turnover_d', 'IdTarget') IS NULL
BEGIN
    ALTER TABLE dbo.BJReturV3Turnover_d ADD IdTarget INT NOT NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_BJReturV3Turnover_d_BJReturV3TurnoverTarget_d'
)
BEGIN
    ALTER TABLE dbo.BJReturV3Turnover_d
        ADD CONSTRAINT [FK_BJReturV3Turnover_d_BJReturV3TurnoverTarget_d]
        FOREIGN KEY ([IdTarget]) REFERENCES [dbo].[BJReturV3TurnoverTarget_d] ([IdTarget]);
END
GO

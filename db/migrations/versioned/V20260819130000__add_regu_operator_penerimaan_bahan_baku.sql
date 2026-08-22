-- ================================================================
-- Migration: Tambah Regu & multi-Operator ke Penerimaan Bahan Baku,
-- format identik dengan WashingProduksi_h (IdRegu di header) +
-- WashingProduksiOperator_d (tabel detail multi-operator).
-- ================================================================

-- 1) IdRegu di header — atribut dokumen (siapa yang mengerjakan),
--    sama seperti IdTim/Shift/Jam.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanBaku_h') AND name = 'IdRegu'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h ADD IdRegu int NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PenerimaanBahanBaku_h_MstRegu'
)
    ALTER TABLE dbo.PenerimaanBahanBaku_h
        ADD CONSTRAINT FK_PenerimaanBahanBaku_h_MstRegu
        FOREIGN KEY (IdRegu) REFERENCES dbo.MstRegu (IdRegu);
GO

-- 2) Tabel detail multi-operator (analog WashingProduksiOperator_d).
IF OBJECT_ID('dbo.PenerimaanBahanBakuOperator_d', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[PenerimaanBahanBakuOperator_d] (
        [Id]          INT      IDENTITY(1,1) NOT NULL,
        [NoPenerimaan] VARCHAR(20) NOT NULL,
        [IdOperator]  INT      NOT NULL,
        [CreatedAt]   DATETIME NOT NULL CONSTRAINT [DF_PenerimaanBahanBakuOperator_d_CreatedAt] DEFAULT (GETDATE()),

        CONSTRAINT [PK_PenerimaanBahanBakuOperator_d] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_PenerimaanBahanBakuOperator_d_PenerimaanBahanBaku_h]
            FOREIGN KEY ([NoPenerimaan]) REFERENCES [dbo].[PenerimaanBahanBaku_h] ([NoPenerimaan])
    );
END
GO

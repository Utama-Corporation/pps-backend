-- ================================================================
-- Migration: Create PenerimaanBahanPendukungOperator_d
-- Tabel detail multi-operator untuk Penerimaan Bahan Pendukung — analog
-- PenerimaanBahanBakuOperator_d / WashingProduksiOperator_d.
-- ================================================================
CREATE TABLE [dbo].[PenerimaanBahanPendukungOperator_d] (
    [Id]            INT      IDENTITY(1,1) NOT NULL,
    [NoPenerimaan]  VARCHAR(20) NOT NULL,
    [IdOperator]    INT      NOT NULL,
    [CreatedAt]     DATETIME NOT NULL CONSTRAINT [DF_PenerimaanBahanPendukungOperator_d_CreatedAt] DEFAULT (GETDATE()),

    CONSTRAINT [PK_PenerimaanBahanPendukungOperator_d] PRIMARY KEY CLUSTERED ([Id] ASC),
    CONSTRAINT [FK_PenerimaanBahanPendukungOperator_d_PenerimaanBahanPendukung_h]
        FOREIGN KEY ([NoPenerimaan]) REFERENCES [dbo].[PenerimaanBahanPendukung_h] ([NoPenerimaan])
);
GO

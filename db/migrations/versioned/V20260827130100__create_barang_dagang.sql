-- ================================================================
-- Migration: Create BarangDagang
-- Mirror struktur FINAL BahanPendukung (menggabungkan atribut label +
-- atribut isi barang dalam satu baris). FK item memakai master yang
-- sudah ada, dbo.MstBarangDagang (legacy, sudah ada di DB live sebelum
-- Flyway), bukan dbo.MstCabinetMaterial.
-- ================================================================
CREATE TABLE [dbo].[BarangDagang] (
    [NoBarangDagang]  VARCHAR(50)    NOT NULL,
    [IdSupplier]      INT            NOT NULL,
    [IdBarangDagang]  INT            NOT NULL,
    [Qty]             DECIMAL(18,3)  NOT NULL,
    [Keterangan]      NVARCHAR(200)  NULL,
    [IsPartial]       BIT            NOT NULL CONSTRAINT [DF_BarangDagang_IsPartial] DEFAULT (0),
    [DateUsage]       DATETIME       NULL,
    [CreateBy]        VARCHAR(100)   NULL,
    [CreatedAt]       DATETIME       NOT NULL CONSTRAINT [DF_BarangDagang_CreatedAt] DEFAULT (GETDATE()),
    [Blok]            VARCHAR(50)    NULL,
    [IdLokasi]        INT            NULL,
    [HasBeenPrinted]  INT            NOT NULL CONSTRAINT [DF_BarangDagang_HasBeenPrinted] DEFAULT (0),

    CONSTRAINT [PK_BarangDagang] PRIMARY KEY CLUSTERED ([NoBarangDagang] ASC),
    CONSTRAINT [FK_BarangDagang_MstSupplier]
        FOREIGN KEY ([IdSupplier]) REFERENCES [dbo].[MstSupplier] ([IdSupplier]),
    CONSTRAINT [FK_BarangDagang_MstBarangDagang]
        FOREIGN KEY ([IdBarangDagang]) REFERENCES [dbo].[MstBarangDagang] ([IdBarangDagang])
);
GO

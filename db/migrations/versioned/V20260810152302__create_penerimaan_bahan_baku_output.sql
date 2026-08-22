-- ================================================================
-- Migration: Create PenerimaanBahanBakuOutput
-- Link antara header penerimaan dan sak label bahan baku yang dihasilkan.
-- ================================================================
CREATE TABLE [dbo].[PenerimaanBahanBakuOutput] (
    [NoPenerimaan]  VARCHAR(20)  NOT NULL,
    [NoBahanBaku]   VARCHAR(50)  NOT NULL,
    [NoPallet]      INT          NOT NULL,
    [NoSak]         INT          NOT NULL,

    CONSTRAINT [PK_PenerimaanBahanBakuOutput] PRIMARY KEY CLUSTERED (
        [NoPenerimaan] ASC, [NoBahanBaku] ASC, [NoPallet] ASC, [NoSak] ASC
    ),
    CONSTRAINT [FK_PenerimaanBahanBakuOutput_PenerimaanBahanBaku_h]
        FOREIGN KEY ([NoPenerimaan]) REFERENCES [dbo].[PenerimaanBahanBaku_h] ([NoPenerimaan])
);
GO

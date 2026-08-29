-- ================================================================
-- Migration: Create dbo.GoodsTransferItemScan_d (realisasi scan label)
-- ================================================================
-- Tabel milik PPS. Satu baris = satu label fisik yang discan operator untuk
-- memenuhi baris permintaan dbo.GoodsTransferItem_d (dicocokkan lewat
-- NoTransfer + KodeKategori + IdJenis, pola sama dengan dbo.BJJualScanLabel_d).
--
-- Scan HANYA mencatat. Label fisik (dbo.BarangJadi / dbo.FurnitureWIP) TIDAK
-- dipindah/dikonsumsi saat scan. Perpindahan warehouse dilakukan saat langkah
-- terima (fitur In Transit -> POST /api/goods-transfer/accept-scan), yang saat
-- itu menyetel IsReceived = 1 dan mengisi BlokTujuan / IdLokasiTujuan.
--
-- IsReceived: 0 = sudah discan pengirim, belum discan/diterima penerima.
--             1 = sudah discan penerima (label fisik dipindah ke tujuan).
--
-- Tidak ada UNIQUE index "1 label aktif" — model pcs mengizinkan 1 label
-- menyokong beberapa scan. Over-scan dicegah lewat perhitungan availablePcs
-- (Pcs parent - SUM partial - SUM scan IsReceived=0) + transaksi SERIALIZABLE.
-- ================================================================

IF OBJECT_ID('[dbo].[GoodsTransferItemScan_d]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[GoodsTransferItemScan_d] (
        [IdScan]           INT IDENTITY(1,1) NOT NULL,
        [NoTransfer]       VARCHAR(20)  NOT NULL,
        [KodeKategori]     VARCHAR(20)  NOT NULL,
        [IdJenis]          INT          NOT NULL,
        [LabelCode]        VARCHAR(50)  NOT NULL,
        [Pcs]              INT          NOT NULL,
        [IsReceived]       BIT          NOT NULL
            CONSTRAINT [DF_GoodsTransferItemScan_d_IsReceived] DEFAULT (0),
        [BlokTujuan]       VARCHAR(50)  NULL,
        [IdLokasiTujuan]   INT          NULL,
        [IdUsernameScan]   INT          NOT NULL,
        [DateTimeScan]     DATETIME2    NOT NULL
            CONSTRAINT [DF_GoodsTransferItemScan_d_DateTimeScan] DEFAULT (SYSUTCDATETIME()),
        [IdUsernameTerima] INT          NULL,
        [DateTimeTerima]   DATETIME2    NULL,
        [UpdatedAt]        DATETIME     NULL,

        CONSTRAINT [PK_GoodsTransferItemScan_d] PRIMARY KEY CLUSTERED ([IdScan] ASC),
        CONSTRAINT [FK_GoodsTransferItemScan_d_Header]
            FOREIGN KEY ([NoTransfer]) REFERENCES [dbo].[GoodsTransfer_h] ([NoTransfer]),
        CONSTRAINT [CK_GoodsTransferItemScan_d_KodeKategori]
            CHECK ([KodeKategori] IN ('barangjadi', 'furniturewip')),
        CONSTRAINT [CK_GoodsTransferItemScan_d_Pcs_Positive]
            CHECK ([Pcs] > 0)
    );

    CREATE INDEX [IX_GoodsTransferItemScan_d_NoTransfer]
        ON [dbo].[GoodsTransferItemScan_d] ([NoTransfer]);

    CREATE INDEX [IX_GoodsTransferItemScan_d_Label]
        ON [dbo].[GoodsTransferItemScan_d] ([LabelCode], [IsReceived]);
END
GO

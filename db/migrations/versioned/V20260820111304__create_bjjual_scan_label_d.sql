-- ================================================================
-- Migration: Create BJJualScanLabel_d (tracking scan label Penjualan)
-- ================================================================
-- Setiap baris = satu label ASLI (NoFurnitureWIP/NoBJ, bukan kode
-- partial internal BC./BL.) yang berkontribusi memenuhi turnover pada
-- satu baris BJJualItem_d (NoBJJual + KodeKategori + IdJenis, PK
-- komposit BJJualItem_d). Kalau pcs label melebihi sisa kebutuhan,
-- backend memecahnya jadi partial (INSERT ke FurnitureWIPPartial/
-- BarangJadiPartial) tapi NoLabel di sini tetap mencatat kode label
-- fisik aslinya — bukan kode partial-nya — supaya audit trail match
-- dengan apa yang user scan.
-- NoLabel SENGAJA TIDAK UNIQUE: label yang sama boleh muncul berkali-
-- kali (dipecah ke beberapa BJJual berbeda, atau baris berbeda pada
-- BJJual yang sama) selama sisa pcs-nya masih ada — dicegah dobel-
-- pakai lewat perhitungan availablePcs (Pcs dikurangi total partial
-- yang sudah ada) + lock transaksional di handler scan, bukan lewat
-- constraint DB.

CREATE TABLE dbo.BJJualScanLabel_d (
    Id            INT IDENTITY(1,1) NOT NULL,
    NoBJJual      VARCHAR(13)  NOT NULL,
    KodeKategori  VARCHAR(20)  NOT NULL,
    IdJenis       INT          NOT NULL,
    NoLabel       VARCHAR(50)  NOT NULL,
    Pcs           INT          NOT NULL,
    IdUsername    INT          NULL,
    DateTimeScan  DATETIME     NOT NULL CONSTRAINT DF_BJJualScanLabel_d_DateTimeScan DEFAULT (GETDATE()),
    CreatedAt     DATETIME     NOT NULL CONSTRAINT DF_BJJualScanLabel_d_CreatedAt DEFAULT (GETDATE()),
    CONSTRAINT PK_BJJualScanLabel_d PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_BJJualScanLabel_d_BJJual_h FOREIGN KEY (NoBJJual) REFERENCES dbo.BJJual_h(NoBJJual),
    CONSTRAINT FK_BJJualScanLabel_d_BJJualItem_d FOREIGN KEY (NoBJJual, KodeKategori, IdJenis)
        REFERENCES dbo.BJJualItem_d (NoBJJual, KodeKategori, IdJenis),
    CONSTRAINT CK_BJJualScanLabel_d_KodeKategori CHECK (KodeKategori IN ('furniturewip', 'barangjadi'))
);
GO

CREATE INDEX IX_BJJualScanLabel_d_NoBJJual_Kategori_Jenis
    ON dbo.BJJualScanLabel_d (NoBJJual, KodeKategori, IdJenis);
GO

CREATE INDEX IX_BJJualScanLabel_d_NoLabel
    ON dbo.BJJualScanLabel_d (NoLabel);
GO

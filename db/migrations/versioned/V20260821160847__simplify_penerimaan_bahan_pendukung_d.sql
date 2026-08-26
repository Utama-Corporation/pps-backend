-- ================================================================
-- Migration: Sederhanakan PenerimaanBahanPendukung_d jadi pengikat
-- ================================================================
-- Sebelumnya PenerimaanBahanPendukung_d menyimpan atribut isi barang
-- (IdSupplier, NamaBarang, Qty, Satuan, Keterangan) langsung. Sekarang
-- atribut itu pindah ke dbo.BahanPendukung (lihat
-- V20260821154704__create_bahan_pendukung.sql), dan tabel ini HANYA
-- jadi pengikat tipis antara header penerimaan (NoPenerimaan) dan baris
-- BahanPendukung yang dihasilkannya — analog PenerimaanBahanBakuOutput
-- yang mengikat PenerimaanBahanBaku_h ke BahanBaku_h, TANPA tabel
-- junction terpisah (satu baris _d = 1 baris BahanPendukung, 1:1).
--
-- NoUrut juga dihapus (langkah 3 di bawah): karena NoBahanPendukung sudah
-- unik 1:1, tidak perlu nomor urut lagi untuk membedakan baris dalam satu
-- NoPenerimaan — PK pindah ke NoBahanPendukung saja.
-- ================================================================

-- 1) Drop FK & kolom lama yang isinya sudah pindah ke BahanPendukung
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PenerimaanBahanPendukung_d_MstSupplier'
)
    ALTER TABLE dbo.PenerimaanBahanPendukung_d DROP CONSTRAINT FK_PenerimaanBahanPendukung_d_MstSupplier;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_d') AND name = 'IdSupplier')
    ALTER TABLE dbo.PenerimaanBahanPendukung_d DROP COLUMN IdSupplier;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_d') AND name = 'NamaBarang')
    ALTER TABLE dbo.PenerimaanBahanPendukung_d DROP COLUMN NamaBarang;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_d') AND name = 'Qty')
    ALTER TABLE dbo.PenerimaanBahanPendukung_d DROP COLUMN Qty;
GO
IF EXISTS (
    SELECT 1 FROM sys.default_constraints WHERE name = 'DF_PenerimaanBahanPendukung_d_Satuan'
)
    ALTER TABLE dbo.PenerimaanBahanPendukung_d DROP CONSTRAINT DF_PenerimaanBahanPendukung_d_Satuan;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_d') AND name = 'Satuan')
    ALTER TABLE dbo.PenerimaanBahanPendukung_d DROP COLUMN Satuan;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_d') AND name = 'Keterangan')
    ALTER TABLE dbo.PenerimaanBahanPendukung_d DROP COLUMN Keterangan;
GO

-- 2) Tambah pengikat NoBahanPendukung -> dbo.BahanPendukung
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_d') AND name = 'NoBahanPendukung'
)
    ALTER TABLE dbo.PenerimaanBahanPendukung_d ADD NoBahanPendukung VARCHAR(50) NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_d') AND name = 'NoBahanPendukung' AND is_nullable = 0
)
    ALTER TABLE dbo.PenerimaanBahanPendukung_d ALTER COLUMN NoBahanPendukung VARCHAR(50) NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PenerimaanBahanPendukung_d_BahanPendukung'
)
    ALTER TABLE dbo.PenerimaanBahanPendukung_d
        ADD CONSTRAINT FK_PenerimaanBahanPendukung_d_BahanPendukung
        FOREIGN KEY (NoBahanPendukung) REFERENCES dbo.BahanPendukung (NoBahanPendukung);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'UQ_PenerimaanBahanPendukung_d_NoBahanPendukung'
)
    CREATE UNIQUE INDEX UQ_PenerimaanBahanPendukung_d_NoBahanPendukung
        ON dbo.PenerimaanBahanPendukung_d (NoBahanPendukung);
GO

-- 3) Hapus NoUrut — NoBahanPendukung sudah unik 1:1, jadi tidak perlu
--    nomor urut lagi untuk membedakan baris dalam satu NoPenerimaan.
--    PK dipindah dari (NoPenerimaan, NoUrut) menjadi NoBahanPendukung saja.
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_d') AND name = 'NoUrut'
)
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.key_constraints
        WHERE name = 'PK_PenerimaanBahanPendukung_d'
          AND parent_object_id = OBJECT_ID('dbo.PenerimaanBahanPendukung_d')
    )
        ALTER TABLE dbo.PenerimaanBahanPendukung_d DROP CONSTRAINT PK_PenerimaanBahanPendukung_d;

    ALTER TABLE dbo.PenerimaanBahanPendukung_d
        ADD CONSTRAINT PK_PenerimaanBahanPendukung_d PRIMARY KEY CLUSTERED (NoBahanPendukung ASC);

    ALTER TABLE dbo.PenerimaanBahanPendukung_d DROP COLUMN NoUrut;
END
GO

-- Index unik jadi redundan sekarang (NoBahanPendukung sudah PK).
IF EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'UQ_PenerimaanBahanPendukung_d_NoBahanPendukung'
)
    DROP INDEX UQ_PenerimaanBahanPendukung_d_NoBahanPendukung ON dbo.PenerimaanBahanPendukung_d;
GO

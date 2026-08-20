-- ================================================================
-- Migration: Drop KodeKategori dari BahanBaku_h — kolom ini redundan,
-- kategori (Bahan Baku Pakai / Proses) sudah 1:1 bisa diturunkan dari
-- prefix NoBahanBaku vs dbo.MstKategori.PrefixLabel ("A." = bahanbaku/
-- Proses, "AB." = bahanbakupakai/Pakai) — persis seperti sebelum
-- V20260819100000 menambahkannya. IdTim tetap dipertahankan karena
-- TIDAK bisa diturunkan dari prefix.
-- ================================================================
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.BahanBaku_h') AND name = 'KodeKategori'
)
    ALTER TABLE dbo.BahanBaku_h DROP COLUMN KodeKategori;
GO

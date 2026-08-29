-- ================================================================
-- Migration: drop kolom tak terpakai di dbo.GoodsTransferItemScan_d
-- ================================================================
-- IdItemD -> GoodsTransferItem_d tidak punya surrogate key (PK komposit
--            NoTransfer+KodeKategori+IdJenis), kolom ini selalu NULL.
--            Pencocokan baris permintaan pakai triple tsb.
--
-- Catatan: BlokTujuan / IdLokasiTujuan TETAP dipakai (diisi saat langkah
-- terima) — lihat V20260828140000 yang menambahkannya kembali untuk env yang
-- sempat men-drop-nya.
--
-- Idempotent: guard COL_LENGTH.
-- ================================================================

IF COL_LENGTH('dbo.GoodsTransferItemScan_d', 'IdItemD') IS NOT NULL
    ALTER TABLE dbo.GoodsTransferItemScan_d DROP COLUMN [IdItemD];
GO

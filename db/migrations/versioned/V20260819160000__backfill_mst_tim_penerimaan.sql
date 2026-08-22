-- ================================================================
-- Migration: Backfill MstTimPenerimaan dari MstTimPenerimaanBB
-- ================================================================
-- MstTimPenerimaan adalah tabel tim penerimaan GLOBAL (dipakai modul baru
-- Penerimaan Bahan Pendukung, dan modul penerimaan lain di masa depan),
-- terpisah dari MstTimPenerimaanBB yang khusus bahan baku. Supaya tim yang
-- sudah ada tidak perlu diinput ulang manual, migration ini menyalin baris
-- MstTimPenerimaanBB ke MstTimPenerimaan.
--
-- CATATAN: IdTim di MstTimPenerimaan adalah IDENTITY BARU — TIDAK sama
-- dengan IdTim di MstTimPenerimaanBB (dua ruang ID yang independen; tidak
-- ada FK silang antar keduanya). Modul Penerimaan Bahan Baku tetap pakai
-- MstTimPenerimaanBB seperti sebelumnya — migration ini tidak mengubah
-- data/FK modul itu sama sekali.
--
-- Idempotent: dicocokkan lewat NamaTim, aman dijalankan ulang.
-- ================================================================
INSERT INTO dbo.MstTimPenerimaan (NamaTim, KepalaTim, Keterangan, Aktif)
SELECT
    bb.NamaTim,
    bb.KepalaTim,
    bb.Keterangan,
    bb.Aktif
FROM dbo.MstTimPenerimaanBB bb
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MstTimPenerimaan mtp WHERE mtp.NamaTim = bb.NamaTim
);
GO

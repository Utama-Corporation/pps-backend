-- ================================================================
-- Migration: Backfill IsComplete/DateComplete pada BJJual_h
-- ================================================================
-- Dijalankan sekali setelah kolom IsComplete/DateComplete (lihat
-- V20260820111303) dan tabel BJJualScanLabel_d (lihat V20260820111304)
-- dibuat. Menandai header sebagai complete bila SEMUA baris
-- BJJualItem_d miliknya sudah terpenuhi (SUM Pcs di BJJualScanLabel_d
-- >= Pcs target) — pakai definisi "complete" yang sama persis dengan
-- yang dipakai endpoint scan (src/modules/penjualan/handlers/
-- scan-label.handler.js) supaya konsisten. Header tanpa baris
-- BJJualItem_d sama sekali otomatis ikut ditandai complete (vacuous
-- true, NOT EXISTS), sama seperti definisi di handler.
-- Idempotent: hanya update baris yang IsComplete masih 0, DateComplete
-- diisi GETDATE() hanya kalau sebelumnya NULL.

UPDATE h
SET h.IsComplete = 1,
    h.DateComplete = ISNULL(h.DateComplete, GETDATE())
FROM dbo.BJJual_h h
WHERE h.IsComplete = 0
  AND NOT EXISTS (
    SELECT 1
    FROM dbo.BJJualItem_d d
    WHERE d.NoBJJual = h.NoBJJual
      AND ISNULL((
        SELECT SUM(s.Pcs)
        FROM dbo.BJJualScanLabel_d s
        WHERE s.NoBJJual = d.NoBJJual
          AND s.KodeKategori = d.KodeKategori
          AND s.IdJenis = d.IdJenis
      ), 0) < d.Pcs
  );
GO

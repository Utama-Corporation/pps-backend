-- ================================================================
-- Migration: tambah Blok, IdLokasi, Target ke MstMesinInject
-- ================================================================
-- Mesin inject sekarang lepas total dari MstMesin — daftar mesin,
-- resolusi lokasi label output (mesin-location-helper, prefix "S."),
-- dan Target di endpoint GET /master-mesin/inject semuanya pindah
-- ke MstMesinInject. Kolom Blok/IdLokasi/Target belum ada di sana,
-- jadi ditambahkan di sini lalu di-backfill dari MstMesin untuk
-- mesin yang sebelumnya sudah terdaftar di kedua tabel.
--
-- Idempotent: aman dijalankan ulang.
-- ================================================================

IF COL_LENGTH('dbo.MstMesinInject', 'Blok') IS NULL
    ALTER TABLE dbo.MstMesinInject ADD Blok VARCHAR(50) NULL;
GO

IF COL_LENGTH('dbo.MstMesinInject', 'IdLokasi') IS NULL
    ALTER TABLE dbo.MstMesinInject ADD IdLokasi INT NULL;
GO

IF COL_LENGTH('dbo.MstMesinInject', 'Target') IS NULL
    ALTER TABLE dbo.MstMesinInject ADD Target DECIMAL(18, 2) NULL;
GO

-- Backfill dari MstMesin untuk mesin yang IdMesin-nya ada di kedua tabel.
UPDATE mi
SET mi.Blok     = COALESCE(mi.Blok, m.Blok),
    mi.IdLokasi = COALESCE(mi.IdLokasi, m.IdLokasi),
    mi.Target   = COALESCE(mi.Target, m.Target)
FROM dbo.MstMesinInject mi
INNER JOIN dbo.MstMesin m ON m.IdMesin = mi.IdMesin
WHERE mi.Blok IS NULL
   OR mi.IdLokasi IS NULL
   OR mi.Target IS NULL;
GO

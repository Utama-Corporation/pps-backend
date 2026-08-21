-- Retur v3: rename FlagKirim* -> IsComplete/Completed* di BJReturV3_h.
--
-- Nama lama ("flag kirim") menyiratkan status pengiriman fisik, padahal
-- kolom ini menandai transaksi retur-nya sendiri sudah selesai diproses
-- (semua target penggantian terpenuhi, lalu ditutup) — "IsComplete" lebih
-- akurat menggambarkan itu tanpa mengubah alur bisnis "Kirim" di UI sama
-- sekali (tombol/label "Kirim" di app tidak berubah, cuma nama kolomnya).
--
-- Idempotent: sp_rename hanya dijalankan kalau kolom lama masih ada.

IF COL_LENGTH('dbo.BJReturV3_h', 'FlagKirim') IS NOT NULL
BEGIN
    EXEC sp_rename 'dbo.BJReturV3_h.FlagKirim', 'IsComplete', 'COLUMN';
END
GO

IF COL_LENGTH('dbo.BJReturV3_h', 'FlagKirimBy') IS NOT NULL
BEGIN
    EXEC sp_rename 'dbo.BJReturV3_h.FlagKirimBy', 'CompletedBy', 'COLUMN';
END
GO

IF COL_LENGTH('dbo.BJReturV3_h', 'FlagKirimByUsername') IS NOT NULL
BEGIN
    EXEC sp_rename 'dbo.BJReturV3_h.FlagKirimByUsername', 'CompletedByUsername', 'COLUMN';
END
GO

IF COL_LENGTH('dbo.BJReturV3_h', 'FlagKirimAt') IS NOT NULL
BEGIN
    EXEC sp_rename 'dbo.BJReturV3_h.FlagKirimAt', 'CompletedAt', 'COLUMN';
END
GO

-- Ikut rename default constraint-nya biar konsisten (bukan wajib secara
-- fungsional, tapi nama constraint yang masih nyebut FlagKirim jadi
-- menyesatkan kalau dibiarkan).
IF OBJECT_ID('dbo.DF_BJReturV3_h_FlagKirim', 'D') IS NOT NULL
BEGIN
    EXEC sp_rename 'dbo.DF_BJReturV3_h_FlagKirim', 'DF_BJReturV3_h_IsComplete', 'OBJECT';
END
GO

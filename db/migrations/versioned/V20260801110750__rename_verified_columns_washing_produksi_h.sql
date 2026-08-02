-- Rename kolom verifikasi tingkat pertama (kepala stock) supaya konsisten
-- dengan penamaan role SC (Stock Controller) / PC (Product Controller) /
-- DeptHead (Department Head) yang dipakai di kolom PCVerified* dan
-- DeptHeadVerified*. VerifiedNote juga dihapus: status verifikasi cukup
-- ditentukan dari flag *VerifiedAt IS NOT NULL, tanpa catatan bebas teks.
EXEC sp_rename 'dbo.WashingProduksi_h.VerifiedBy', 'SCVerifiedBy', 'COLUMN';
GO
EXEC sp_rename 'dbo.WashingProduksi_h.VerifiedAt', 'SCVerifiedAt', 'COLUMN';
GO
ALTER TABLE dbo.WashingProduksi_h DROP COLUMN VerifiedNote;
GO

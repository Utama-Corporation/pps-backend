-- Rename kolom verifikasi tingkat pertama (kepala stock) supaya konsisten
-- dengan penamaan role SC (Stock Controller) / PC (Product Controller) /
-- DeptHead (Department Head), sama seperti WashingProduksi_h. VerifiedNote
-- juga dihapus: status verifikasi cukup ditentukan dari flag
-- *VerifiedAt IS NOT NULL, tanpa catatan bebas teks.
EXEC sp_rename 'dbo.BrokerProduksi_h.VerifiedBy', 'SCVerifiedBy', 'COLUMN';
GO
EXEC sp_rename 'dbo.BrokerProduksi_h.VerifiedAt', 'SCVerifiedAt', 'COLUMN';
GO
ALTER TABLE dbo.BrokerProduksi_h DROP COLUMN VerifiedNote;
GO

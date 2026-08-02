-- Kolom OperatorVerified*/DepartmentVerified* sempat ke-apply ke DB ini
-- dengan nama lama sebelum migration V20260731092127 dan V20260731140241
-- direvisi jadi PCVerified*/DeptHeadVerified*. Data lama (kalau ada) sudah
-- dipindah manual sebelum migration ini jalan; sekarang tinggal buang
-- kolom lama yang sudah tidak dipakai kode.
ALTER TABLE dbo.WashingProduksi_h DROP COLUMN OperatorVerifiedBy;
GO
ALTER TABLE dbo.WashingProduksi_h DROP COLUMN OperatorVerifiedAt;
GO
ALTER TABLE dbo.WashingProduksi_h DROP COLUMN OperatorVerifiedNote;
GO
ALTER TABLE dbo.WashingProduksi_h DROP COLUMN DepartmentVerifiedBy;
GO
ALTER TABLE dbo.WashingProduksi_h DROP COLUMN DepartmentVerifiedAt;
GO
ALTER TABLE dbo.WashingProduksi_h DROP COLUMN DepartmentVerifiedNote;
GO

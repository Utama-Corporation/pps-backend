-- Tingkat verifikasi ketiga (Department Head), memvalidasi bahwa
-- verifikasi Stock Controller (SCVerifiedAt) dan Product Controller
-- (PCVerifiedAt) sudah dilakukan. Status "sudah diverifikasi department"
-- ditentukan dari DeptHeadVerifiedAt IS NOT NULL. Hanya flag by/at, tanpa
-- kolom note, sama seperti WashingProduksi_h.
ALTER TABLE dbo.BrokerProduksi_h ADD
    DeptHeadVerifiedBy int NULL,
    DeptHeadVerifiedAt datetime2 NULL;
GO

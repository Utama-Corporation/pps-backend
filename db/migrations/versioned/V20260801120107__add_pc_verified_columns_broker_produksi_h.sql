-- Tingkat verifikasi kedua (Product Controller / PC), independen dari
-- SCVerifiedBy/SCVerifiedAt (Stock Controller). Status "sudah diverifikasi
-- PC" ditentukan dari PCVerifiedAt IS NOT NULL. Hanya flag by/at, tanpa
-- kolom note, sama seperti WashingProduksi_h.
ALTER TABLE dbo.BrokerProduksi_h ADD
    PCVerifiedBy int NULL,
    PCVerifiedAt datetime2 NULL;
GO

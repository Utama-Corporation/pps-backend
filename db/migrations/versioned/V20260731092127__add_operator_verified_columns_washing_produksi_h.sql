-- Tingkat verifikasi kedua (Product Controller / PC), independen dari
-- SCVerifiedBy/SCVerifiedAt (Stock Controller). Status "sudah diverifikasi
-- PC" ditentukan dari PCVerifiedAt IS NOT NULL. Hanya flag by/at, tanpa
-- kolom note.
ALTER TABLE dbo.WashingProduksi_h ADD
    PCVerifiedBy int NULL,
    PCVerifiedAt datetime2 NULL;
GO

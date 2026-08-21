-- Retur v3: hapus 3 tabel mapping output label (BarangJadi/FurnitureWIP/
-- Reject) — awalnya dibuat mengikuti pola tabel mapping produksi lain
-- (HotStampingOutputLabelFWIP dkk), tapi disederhanakan: label yang
-- digenerate sekarang cukup dilacak lewat BJReturV3Item_d.GeneratedLabelCode
-- saja (kolom itu sudah ada sejak awal). Query "outputs" (untuk print) join
-- balik ke GeneratedLabelCode + KodeKategori/KategoriInput untuk tahu tabel
-- master mana (BarangJadi/FurnitureWIP/RejectV2) yang harus di-JOIN.
--
-- Trade-off yang disadari & diterima: tidak ada FK constraint langsung dari
-- GeneratedLabelCode ke tabel labelnya (SQL Server tidak bisa bikin satu
-- kolom jadi FK ke 3 tabel berbeda tergantung kondisi) — retur v3 jadi satu
-- satunya modul di backend ini yang tidak pakai pola output-mapping-table.

IF OBJECT_ID('[dbo].[BJReturV3OutputLabelBarangJadi]', 'U') IS NOT NULL
BEGIN
    DROP TABLE [dbo].[BJReturV3OutputLabelBarangJadi];
END
GO

IF OBJECT_ID('[dbo].[BJReturV3OutputLabelFurnitureWIP]', 'U') IS NOT NULL
BEGIN
    DROP TABLE [dbo].[BJReturV3OutputLabelFurnitureWIP];
END
GO

IF OBJECT_ID('[dbo].[BJReturV3OutputLabelReject]', 'U') IS NOT NULL
BEGIN
    DROP TABLE [dbo].[BJReturV3OutputLabelReject];
END
GO

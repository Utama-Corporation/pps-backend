// src/modules/goods-transfer/__tests__/goods-transfer-service.test.js

jest.mock("../../../core/config/db", () => {
  const mQuery = jest.fn();
  const MockRequest = jest.fn().mockImplementation(() => {
    const req = { input: () => req, query: mQuery };
    return req;
  });
  const MockTransaction = jest.fn().mockImplementation(() => ({
    begin: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
  }));
  const makeType = (name) => jest.fn(() => name);
  const mPool = { request: () => new MockRequest() };

  return {
    sql: {
      VarChar: makeType("VarChar"),
      Int: makeType("Int"),
      Date: makeType("Date"),
      NVarChar: makeType("NVarChar"),
      ISOLATION_LEVEL: { SERIALIZABLE: "SERIALIZABLE" },
      Request: MockRequest,
      Transaction: MockTransaction,
    },
    poolPromise: Promise.resolve(mPool),
  };
});

const service = require("../goods-transfer-service");

describe("goods-transfer scanLabel guards", () => {
  const ctx = { actorId: 7, actorUsername: "tester", requestId: "" };

  test("menolak noTransfer kosong", async () => {
    await expect(service.scanLabel("", "BA.0000000001", ctx)).rejects.toThrow(
      /noTransfer wajib/,
    );
  });

  test("menolak noLabel kosong", async () => {
    await expect(service.scanLabel("GT.0000000001", "", ctx)).rejects.toThrow(
      /noLabel wajib/,
    );
  });

  test("menolak label bukan kategori BA./BB.", async () => {
    await expect(
      service.scanLabel("GT.0000000001", "A.0000000001-1", ctx),
    ).rejects.toThrow(/bukan kategori yang valid/);
  });

  test("menolak actorId tidak valid", async () => {
    await expect(
      service.scanLabel("GT.0000000001", "BA.0000000001", { actorId: 0 }),
    ).rejects.toThrow(/actorId wajib/);
  });
});

describe("goods-transfer acceptScannedItem guards", () => {
  test("menolak jika labelCode/blokTujuan/idLokasiTujuan tidak lengkap", async () => {
    const result = await service.acceptScannedItem({
      labelCode: "BA.0000000001",
      blokTujuan: "A1",
      idLokasiTujuan: null,
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });
});

describe("goods-transfer undoScan guards", () => {
  test("menolak idScan tidak valid", async () => {
    const result = await service.undoScan({ idScan: "abc" });
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });
});

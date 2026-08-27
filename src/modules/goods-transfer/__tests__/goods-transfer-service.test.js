// src/modules/goods-transfer/__tests__/goods-transfer-service.test.js

jest.mock("../../../core/config/db", () => {
  const mQuery = jest.fn();
  const MockRequest = jest.fn().mockImplementation(() => {
    const req = {
      input: () => req,
      query: mQuery,
    };
    return req;
  });

  const mBegin = jest.fn();
  const mCommit = jest.fn();
  const mRollback = jest.fn();

  const MockTransaction = jest.fn().mockImplementation(() => ({
    begin: mBegin,
    commit: mCommit,
    rollback: mRollback,
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
    __mocks: { mQuery, MockRequest, MockTransaction, mBegin, mCommit, mRollback, mPool },
  };
});

const service = require("../goods-transfer-service");

describe("goods-transfer-service validation guards", () => {
  test("createGoodsTransfer menolak jika idWarehouseAsal/Tujuan kosong", async () => {
    const result = await service.createGoodsTransfer({
      idWarehouseAsal: null,
      idWarehouseTujuan: 2,
      labelCodes: ["A.0000000001-1"],
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });

  test("createGoodsTransfer menolak jika warehouse asal = tujuan", async () => {
    const result = await service.createGoodsTransfer({
      idWarehouseAsal: 1,
      idWarehouseTujuan: 1,
      labelCodes: ["A.0000000001-1"],
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("SAME_WAREHOUSE");
  });

  test("createGoodsTransfer menolak jika labelCodes kosong", async () => {
    const result = await service.createGoodsTransfer({
      idWarehouseAsal: 1,
      idWarehouseTujuan: 2,
      labelCodes: [],
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });

  test("rejectGoodsTransfer menolak jika alasanTolak kosong", async () => {
    const result = await service.rejectGoodsTransfer({
      noTransfer: "GT.0000000001",
      alasanTolak: "",
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });

  test("acceptGoodsTransfer menolak jika items kosong", async () => {
    const result = await service.acceptGoodsTransfer({
      noTransfer: "GT.0000000001",
      items: [],
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });

  test("acceptGoodsTransfer menolak jika item tidak lengkap (kurang idLokasiTujuan)", async () => {
    const result = await service.acceptGoodsTransfer({
      noTransfer: "GT.0000000001",
      items: [{ labelCode: "A.0000000001-1", blokTujuan: "A1" }],
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("VALIDATION_ERROR");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => void | Promise<void>>,
  fetchMock: vi.fn(),
  generateContentMock: vi.fn(),
  saveRoomConfigMock: vi.fn(),
  verifyMock: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: (callback: () => void | Promise<void>) => {
    mocks.afterCallbacks.push(callback);
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mocks.generateContentMock,
    };
  },
}));

vi.mock("../lib/googleSheetsExpenseStore", () => ({
  saveRoomConfig: mocks.saveRoomConfigMock,
}));

vi.mock("tweetnacl", () => ({
  default: {
    sign: {
      detached: {
        verify: mocks.verifyMock,
      },
    },
  },
}));

function createInteractionRequest(
  name: string,
  options: Array<{ name: string; value: string | number | boolean }>
) {
  return new Request("http://localhost/api/discord", {
    method: "POST",
    headers: {
      "X-Signature-Ed25519": "signature",
      "X-Signature-Timestamp": "timestamp",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: 2,
      application_id: "app_123",
      token: "token_456",
      data: {
        name,
        options,
      },
    }),
  });
}

async function runDeferredWork() {
  const callbacks = mocks.afterCallbacks.splice(0);

  for (const callback of callbacks) {
    await callback();
  }
}

async function loadRouteModule() {
  vi.resetModules();
  return import("../app/api/discord/route");
}

function getPatchedContent() {
  expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
  const [, init] = mocks.fetchMock.mock.calls[0];
  const payload = JSON.parse(String(init?.body));
  return payload.content as string;
}

describe("POST /api/discord", () => {
  beforeEach(() => {
    mocks.afterCallbacks.length = 0;
    mocks.fetchMock.mockReset();
    mocks.generateContentMock.mockReset();
    mocks.saveRoomConfigMock.mockReset();
    mocks.verifyMock.mockReset();

    mocks.fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    mocks.saveRoomConfigMock.mockResolvedValue({
      configSheetName: "Config",
      ledgerSheetName: "P405",
      headers: [],
    });
    mocks.verifyMock.mockReturnValue(true);

    vi.stubGlobal("fetch", mocks.fetchMock);
    process.env.DISCORD_PUBLIC_KEY = "discord_public_key";
    process.env.GEMINI_API_KEY = "gemini_api_key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defers a valid /start response and patches the success message later", async () => {
    const { POST } = await loadRouteModule();

    const response = await POST(
      createInteractionRequest("start", [
        { name: "so_nguoi", value: 3 },
        { name: "thanh_vien", value: "Huy, Vu, TienAnh" },
      ])
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ type: 5 });
    expect(mocks.saveRoomConfigMock).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(1);

    await runDeferredWork();

    expect(mocks.saveRoomConfigMock).toHaveBeenCalledWith({
      members: ["Huy", "Vu", "TienAnh"],
    });
    expect(getPatchedContent()).toContain("Da cau hinh phong thanh cong");
  });

  it("returns an immediate validation error for invalid /start input", async () => {
    const { POST } = await loadRouteModule();

    const response = await POST(
      createInteractionRequest("start", [
        { name: "so_nguoi", value: 2 },
        { name: "thanh_vien", value: "Huy, Vu, TienAnh" },
      ])
    );

    expect(await response.json()).toEqual({
      type: 4,
      data: {
        content: "so_nguoi = 2 nhung danh sach thanh vien co 3 ten.",
      },
    });
    expect(mocks.afterCallbacks).toHaveLength(0);
    expect(mocks.saveRoomConfigMock).not.toHaveBeenCalled();
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });

  it("returns an immediate validation error when /ask prompt is empty", async () => {
    const { POST } = await loadRouteModule();

    const response = await POST(
      createInteractionRequest("ask", [{ name: "prompt", value: "   " }])
    );

    expect(await response.json()).toEqual({
      type: 4,
      data: {
        content: "Ban chua nhap cau hoi.",
      },
    });
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it("patches a quota-aware error message when Gemini returns 429", async () => {
    mocks.generateContentMock.mockRejectedValueOnce(
      Object.assign(new Error("quota exceeded"), {
        status: 429,
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.RetryInfo",
            retryDelay: "50s",
          },
        ],
      })
    );

    const { POST } = await loadRouteModule();

    const response = await POST(
      createInteractionRequest("ask", [{ name: "prompt", value: "Tom tat chi tieu" }])
    );

    expect(await response.json()).toEqual({ type: 5 });

    await runDeferredWork();

    expect(getPatchedContent()).toContain("quota");
    expect(getPatchedContent()).toContain("50 giay");
  });

  it("retries transient Gemini 503 errors before patching the answer", async () => {
    mocks.generateContentMock
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { status: 503 }))
      .mockResolvedValueOnce({ text: "Da xong" });

    const { POST } = await loadRouteModule();

    const response = await POST(
      createInteractionRequest("ask", [{ name: "prompt", value: "Tom tat chi tieu" }])
    );

    expect(await response.json()).toEqual({ type: 5 });

    await runDeferredWork();

    expect(mocks.generateContentMock).toHaveBeenCalledTimes(3);
    expect(mocks.generateContentMock.mock.calls[0]?.[0]).toMatchObject({
      model: "gemini-2.5-flash-lite",
    });
    expect(getPatchedContent()).toBe("Da xong");
  });
});

// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const TEST_SECRET = new TextEncoder().encode("development-secret-key");

async function mintToken(overrides: Record<string, unknown> = {}) {
  const payload = {
    userId: "user-123",
    email: "alice@example.com",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(TEST_SECRET);
}

function makeCookieStore(tokenValue?: string) {
  return {
    get: vi.fn((name: string) =>
      name === "auth-token" && tokenValue !== undefined
        ? { value: tokenValue }
        : undefined
    ),
    set: vi.fn(),
    delete: vi.fn(),
  };
}

// ─── Import SUT after mocks ───────────────────────────────────────────────────

import {
  createSession,
  getSession,
  deleteSession,
  verifySession,
} from "@/lib/auth";

const mockCookies = cookies as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createSession ────────────────────────────────────────────────────────────

describe("createSession", () => {
  test("sets cookie with correct name and a verifiable JWT", async () => {
    const store = makeCookieStore();
    mockCookies.mockResolvedValue(store);

    await createSession("user-123", "alice@example.com");

    expect(store.set).toHaveBeenCalledOnce();
    const [name, token] = store.set.mock.calls[0];
    expect(name).toBe("auth-token");

    const { payload } = await jwtVerify(token, TEST_SECRET);
    expect(payload.userId).toBe("user-123");
    expect(payload.email).toBe("alice@example.com");
  });

  test("sets correct cookie options in non-production", async () => {
    const store = makeCookieStore();
    mockCookies.mockResolvedValue(store);

    const before = Date.now();
    await createSession("user-123", "alice@example.com");
    const after = Date.now();

    const options = store.set.mock.calls[0][2];
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(false);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(options.expires.getTime()).toBeGreaterThanOrEqual(before + sevenDays - 5000);
    expect(options.expires.getTime()).toBeLessThanOrEqual(after + sevenDays + 5000);
  });

  test("sets secure: true in production", async () => {
    const store = makeCookieStore();
    mockCookies.mockResolvedValue(store);
    vi.stubEnv("NODE_ENV", "production");

    try {
      await createSession("user-123", "alice@example.com");
      const options = store.set.mock.calls[0][2];
      expect(options.secure).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("token expires approximately 7 days from now", async () => {
    const store = makeCookieStore();
    mockCookies.mockResolvedValue(store);

    const before = Date.now();
    await createSession("user-123", "alice@example.com");
    const after = Date.now();

    const options = store.set.mock.calls[0][2];
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(options.expires.getTime()).toBeGreaterThanOrEqual(before + sevenDays - 5000);
    expect(options.expires.getTime()).toBeLessThanOrEqual(after + sevenDays + 5000);
  });

  test("token is signed with HS256", async () => {
    const store = makeCookieStore();
    mockCookies.mockResolvedValue(store);

    await createSession("user-123", "alice@example.com");

    const token: string = store.set.mock.calls[0][1];
    const headerB64 = token.split(".")[0];
    const header = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")));
    expect(header.alg).toBe("HS256");
  });
});

// ─── getSession ───────────────────────────────────────────────────────────────

describe("getSession", () => {
  test("returns null when no cookie is present", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());

    const result = await getSession();

    expect(result).toBeNull();
  });

  test("returns parsed SessionPayload for a valid token", async () => {
    const token = await mintToken();
    mockCookies.mockResolvedValue(makeCookieStore(token));

    const result = await getSession();

    expect(result).not.toBeNull();
    expect(result!.userId).toBe("user-123");
    expect(result!.email).toBe("alice@example.com");
    // Date is serialised to string by jose during JWT signing
    expect(typeof result!.expiresAt).toBe("string");
  });

  test("returns null for a token signed with a wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await new SignJWT({ userId: "u", email: "e@e.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(wrongSecret);
    mockCookies.mockResolvedValue(makeCookieStore(token));

    const result = await getSession();

    expect(result).toBeNull();
  });

  test("returns null for an expired token", async () => {
    const token = await new SignJWT({ userId: "u", email: "e@e.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("-1s")
      .sign(TEST_SECRET);
    mockCookies.mockResolvedValue(makeCookieStore(token));

    const result = await getSession();

    expect(result).toBeNull();
  });

  test("returns null for a malformed token string", async () => {
    mockCookies.mockResolvedValue(makeCookieStore("not.a.real.jwt"));

    const result = await getSession();

    expect(result).toBeNull();
  });

  test("returns null for an empty string token", async () => {
    mockCookies.mockResolvedValue(makeCookieStore(""));

    const result = await getSession();

    expect(result).toBeNull();
  });
});

// ─── deleteSession ────────────────────────────────────────────────────────────

describe("deleteSession", () => {
  test("calls delete with the auth-token cookie name", async () => {
    const store = makeCookieStore();
    mockCookies.mockResolvedValue(store);

    await deleteSession();

    expect(store.delete).toHaveBeenCalledOnce();
    expect(store.delete).toHaveBeenCalledWith("auth-token");
  });

  test("calls cookies() exactly once", async () => {
    const store = makeCookieStore();
    mockCookies.mockResolvedValue(store);

    await deleteSession();

    expect(mockCookies).toHaveBeenCalledOnce();
  });
});

// ─── verifySession ────────────────────────────────────────────────────────────

describe("verifySession", () => {
  test("returns null when no auth-token cookie is on the request", async () => {
    const req = new NextRequest("http://localhost/api/test");

    const result = await verifySession(req);

    expect(result).toBeNull();
  });

  test("returns valid SessionPayload for a correctly signed token", async () => {
    const token = await mintToken({ userId: "user-456", email: "bob@example.com" });
    const req = new NextRequest("http://localhost/api/test", {
      headers: { cookie: `auth-token=${token}` },
    });

    const result = await verifySession(req);

    expect(result).not.toBeNull();
    expect(result!.userId).toBe("user-456");
    expect(result!.email).toBe("bob@example.com");
  });

  test("returns null for a token signed with a wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await new SignJWT({ userId: "u", email: "e@e.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(wrongSecret);
    const req = new NextRequest("http://localhost/api/test", {
      headers: { cookie: `auth-token=${token}` },
    });

    const result = await verifySession(req);

    expect(result).toBeNull();
  });

  test("returns null for an expired token", async () => {
    const token = await new SignJWT({ userId: "u", email: "e@e.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("-1s")
      .sign(TEST_SECRET);
    const req = new NextRequest("http://localhost/api/test", {
      headers: { cookie: `auth-token=${token}` },
    });

    const result = await verifySession(req);

    expect(result).toBeNull();
  });

  test("returns null for a malformed token string", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { cookie: "auth-token=garbage" },
    });

    const result = await verifySession(req);

    expect(result).toBeNull();
  });

  test("ignores other cookies and only reads auth-token", async () => {
    const token = await mintToken({ userId: "user-789", email: "carol@example.com" });
    const req = new NextRequest("http://localhost/api/test", {
      headers: { cookie: `other-cookie=abc; auth-token=${token}` },
    });

    const result = await verifySession(req);

    expect(result).not.toBeNull();
    expect(result!.userId).toBe("user-789");
    expect(result!.email).toBe("carol@example.com");
  });

  test("returns null when auth-token cookie exists but has empty value", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { cookie: "auth-token=" },
    });

    const result = await verifySession(req);

    expect(result).toBeNull();
  });
});

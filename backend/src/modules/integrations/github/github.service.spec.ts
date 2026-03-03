import { ConfigService } from "@nestjs/config";
import { GithubService } from "./github.service";

jest.mock("@octokit/rest", () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

describe("GithubService OAuth state", () => {
  const mockDb: any = { query: jest.fn() };
  const config = {
    get: jest.fn((key: string) => {
      if (key === "jwt.secret") return "test-secret";
      if (key === "encryption.key") return "test-encryption-key";
      if (key === "github.clientId") return "gh-client";
      if (key === "github.callbackUrl") return "http://localhost:3001/callback";
      return undefined;
    }),
  } as unknown as ConfigService;

  const service = new GithubService(mockDb, config);

  it("validates signed state", () => {
    const url = service.getOAuthUrl({ userId: "u1", orgId: "o1" });
    const state = decodeURIComponent(url.split("state=")[1]);
    const parsed = service.parseAndValidateState(state);
    expect(parsed).toEqual({ userId: "u1", orgId: "o1" });
  });

  it("rejects tampered signature", () => {
    const url = service.getOAuthUrl({ userId: "u1", orgId: "o1" });
    const state = decodeURIComponent(url.split("state=")[1]);
    const [payload, sig] = state.split(".");
    const tampered = `${payload}.${sig.slice(0, -1)}x`;
    expect(service.parseAndValidateState(tampered)).toBeNull();
  });

  it("rejects expired state", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const url = service.getOAuthUrl({ userId: "u1", orgId: "o1" });
    const state = decodeURIComponent(url.split("state=")[1]);
    nowSpy.mockReturnValue(1_700_000_000_000 + 16 * 60 * 1000);
    expect(service.parseAndValidateState(state)).toBeNull();
    nowSpy.mockRestore();
  });
});

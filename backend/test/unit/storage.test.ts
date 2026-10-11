import { describe, expect, it } from "vitest";
import { presignUrl, r2Storage } from "../../src/storage.js";

describe("presignUrl", () => {
  it("matches AWS's published presigned URL example", () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    const url = presignUrl({
      method: "GET",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      expiresSeconds: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    });
    expect(new URL(url).searchParams.get("X-Amz-Signature")).toBe(
      "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });
});

describe("r2Storage.signUpload", () => {
  const storage = r2Storage({ accountId: "acct", bucket: "media", accessKeyId: "AK", secretAccessKey: "SK" });

  it("signs a PUT under the user's prefix, bound to type and size", () => {
    const user = "6f1c2a3e-5b7d-4c8e-9f00-112233445566";
    const signed = storage.signUpload(user, "image/webp", 1234);
    expect(signed.storageKey).toMatch(new RegExp(`^uploads/${user}/[0-9a-f-]{36}\\.webp$`));
    const url = new URL(signed.url);
    expect(url.host).toBe("acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/media/${signed.storageKey}`);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(signed.headers).toEqual({ "content-type": "image/webp", "content-length": "1234" });
  });
});

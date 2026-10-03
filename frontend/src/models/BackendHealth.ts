export class BackendHealth {
  private constructor(
    readonly status: "ok",
  ) {}

  static fromResponse(value: unknown): BackendHealth {
    if (typeof value !== "object" || value === null || !("status" in value)) {
      throw new Error("Backend health response is invalid");
    }
    if (value.status !== "ok") {
      throw new Error("Backend health response is invalid");
    }
    return new BackendHealth("ok");
  }
}

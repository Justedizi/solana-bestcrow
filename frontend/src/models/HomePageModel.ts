import type { BackendApiClient } from "@/services/BackendApiClient";

export class HomePageModel {
  private constructor(
    readonly backendOnline: boolean,
  ) {}

  static async load(api: BackendApiClient): Promise<HomePageModel> {
    try {
      await api.health();
      return new HomePageModel(true);
    } catch {
      return new HomePageModel(false);
    }
  }
}

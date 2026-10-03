import { FrontendConfig } from "@/config/FrontendConfig";
import { HomePageModel } from "@/models/HomePageModel";
import { BackendApiClient } from "@/services/BackendApiClient";
import { CampaignLookup } from "@/components/CampaignLookup";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = FrontendConfig.fromEnv();
  const model = await HomePageModel.load(new BackendApiClient(config));

  return (
    <main className="shell">
      <div className="card">
        <p className="eyebrow">Bestcrow v2 prototype</p>
        <h1>Milestone crowdfunding on Solana</h1>
        <p className="intro">USDC milestone funding with MetaDAO Pass/Fail markets.</p>
        <div className="status" role="status">
          <span className={model.backendOnline ? "dot online" : "dot"} aria-hidden="true" />
          <span>Backend {model.backendOnline ? "connected" : "unavailable"}</span>
        </div>
        <CampaignLookup />
      </div>
    </main>
  );
}

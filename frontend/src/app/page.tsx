import { FrontendConfig } from "@/config/FrontendConfig";
import { HomePageModel } from "@/models/HomePageModel";
import { BackendApiClient } from "@/services/BackendApiClient";
import { CampaignLookup } from "@/components/CampaignLookup";
import { BackendStatus } from "@/components/BackendStatus";

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
        <BackendStatus initialOnline={model.backendOnline} />
        <CampaignLookup />
      </div>
    </main>
  );
}

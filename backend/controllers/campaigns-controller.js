import { simulationHost } from '../services/simulation-host.js';
import { enrichCampaign, simulationMeta } from './helpers.js';

export function getCampaigns(req, res) {
  const { state, readOnly } = simulationHost.resolve(req);
  res.json({
    simulation: simulationMeta(state),
    readOnly,
    campaigns: state.campaignData.campaigns.map((campaign) =>
      enrichCampaign(state, campaign),
    ),
    detector: {
      signals: [
        'near_duplicate_content',
        'burst_timing',
        'new_accounts_in_sync',
        'vouch_ring',
        'high_volume_low_merge',
        'denouncement_burst',
      ],
      requirement: 'A campaign needs at least two independent signal types and at least two linked accounts.',
      config: state.campaignData.config,
    },
    note: 'Campaigns are inferred from simulated PRs and signed records. Metrics compare predictions with simulator ground truth.',
  });
}

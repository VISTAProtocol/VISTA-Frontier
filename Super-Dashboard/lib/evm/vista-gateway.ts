import { parseAbi } from "viem";

/// VistaGateway ABI — keep in sync with contracts/evm/src/VistaGateway.sol.
/// Trusted-relayer mode: no LayerZero on EVM side. Oracle-node tails the
/// CampaignBridged event and relays metadata to Solana out-of-band.
export const VISTA_GATEWAY_ABI = parseAbi([
  "function depositCampaign(bytes32 campaignId, uint256 totalBudget, uint64 ratePerSecond, uint64 duration, bytes32 solanaCampaignVault) external",
  "function campaigns(bytes32) external view returns (bytes32 campaignId, address advertiser, uint256 totalBudget, uint64 ratePerSecond, uint64 duration, uint64 cctpNonce, uint64 createdAt)",
  "event CampaignBridged(bytes32 indexed campaignId, address indexed advertiser, uint256 totalBudget, uint64 ratePerSecond, uint64 duration, uint64 cctpNonce, uint32 sourceChainId, bytes32 solanaCampaignVault)",
]);

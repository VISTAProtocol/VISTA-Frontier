import { parseAbi } from "viem";

/// VistaGateway ABI — keep in sync with contracts/evm/src/VistaGateway.sol.
export const VISTA_GATEWAY_ABI = parseAbi([
  "function depositCampaign(bytes32 campaignId, uint256 totalBudget, uint64 ratePerSecond, uint64 duration, bytes32 solanaCampaignVault, bytes lzOptions) external payable",
  "function quoteLzFee(bytes32 campaignId, address advertiser, uint256 totalBudget, uint64 ratePerSecond, uint64 duration, bytes lzOptions) external view returns ((uint256 nativeFee, uint256 lzTokenFee))",
  "function campaigns(bytes32) external view returns (bytes32 campaignId, address advertiser, uint256 totalBudget, uint64 ratePerSecond, uint64 duration, uint64 cctpNonce, uint64 createdAt)",
  "event CampaignBridged(bytes32 indexed campaignId, address indexed advertiser, uint256 totalBudget, uint64 ratePerSecond, uint64 duration, uint64 cctpNonce, uint32 sourceChainId, bytes32 solanaCampaignVault)",
]);

/// Default LayerZero V2 options: 200k gas, 0 native value to recipient.
/// Encoded as ULN302 OptionsBuilder format: 0x0003 prefix + executor option.
/// See https://docs.layerzero.network/v2/developers/evm/protocol-gas-settings/options
/// For Solana destinations, this just signals executor compute units.
export const DEFAULT_LZ_OPTIONS = "0x00030100110100000000000000000000000000030d40" as const;

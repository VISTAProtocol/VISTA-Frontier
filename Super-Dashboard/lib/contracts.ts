import { isAddress, parseAbi, type Address } from "viem"

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 value) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
])

export const vistaEscrowAbi = parseAbi([
  "function deposit(bytes32 campaignId, uint256 amount, uint256 ratePerSecond, uint256 duration) external",
  "function refundRemaining(bytes32 campaignId) external",
])

export const vistaStreamAbi = parseAbi([
  "function sessions(bytes32) external view returns (bytes32 sessionId, bytes32 campaignId, address userWallet, address publisherWallet, uint256 secondsVerified, uint256 totalPaid, bool active, uint256 startedAt)",
])

export const vistaVaultAbi = parseAbi([
  "function withdraw() external",
  "function getBalance(address wallet) external view returns (uint256)",
  "function getEarningRecords(address wallet) external view returns ((bytes32 sessionId, address publisherWallet, bytes32 campaignId, uint256 amount, uint8 role, uint256 timestamp)[])",
])

const rawContracts = {
  vistaStream: process.env.NEXT_PUBLIC_VISTA_STREAM_ADDRESS,
  vistaEscrow: process.env.NEXT_PUBLIC_VISTA_ESCROW_ADDRESS,
  vistaVault: process.env.NEXT_PUBLIC_VISTA_VAULT_ADDRESS,
  mockUsdc: process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS,
}

export const contractAddresses = {
  vistaStream: isAddress(rawContracts.vistaStream ?? "") ? (rawContracts.vistaStream as Address) : null,
  vistaEscrow: isAddress(rawContracts.vistaEscrow ?? "") ? (rawContracts.vistaEscrow as Address) : null,
  vistaVault: isAddress(rawContracts.vistaVault ?? "") ? (rawContracts.vistaVault as Address) : null,
  mockUsdc: isAddress(rawContracts.mockUsdc ?? "") ? (rawContracts.mockUsdc as Address) : null,
}

export const hasContractConfig = Boolean(
  contractAddresses.vistaEscrow && contractAddresses.mockUsdc
)

export function buildWalletAuthMessage({
  domain,
  uri,
  address,
  nonce,
  issuedAt,
}) {
  return [
    "Sign in to Farcaster Solana App",
    `Domain: ${domain}`,
    `URI: ${uri}`,
    `Address: ${address}`,
    `Cluster: solana:devnet`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    "Statement: This signature proves wallet ownership.",
  ].join("\n");
}

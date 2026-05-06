export function buildWalletAuthMessage({
  domain,
  uri,
  address,
  nonce,
  chainId,
  issuedAt,
}) {
  return [
    "Sign in to Farcaster Base Sepolia App",
    `Domain: ${domain}`,
    `URI: ${uri}`,
    `Address: ${address}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    "Statement: This signature proves wallet ownership.",
  ].join("\n");
}

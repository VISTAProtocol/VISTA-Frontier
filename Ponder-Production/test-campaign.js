const { createPublicClient, http } = require("viem");
const { baseSepolia } = require("viem/chains");
const VistaEscrowAbi = require("./abis/VistaEscrow.json");

const client = createPublicClient({
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"),
});

async function main() {
  const campaign = await client.readContract({
    address: "0x728d51695a3Fb4811b01e4c5aC65E8dDDB95F795",
    abi: VistaEscrowAbi,
    functionName: "campaigns",
    args: ["0x31722e704e3979b3669d30e11495bf23eff587dc3c24c03f4d345f9602f3d4c3"],
  });
  console.log(campaign);
}
main();

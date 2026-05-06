import { NextResponse } from "next/server";
import { createWalletClient, http, publicActions, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const MOCK_USDC_ABI = [
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export async function POST(req: Request) {
  try {
    const { address, amount } = await req.json();

    if (!address) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const privateKey = process.env.ADMIN_PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
      return NextResponse.json(
        { error: "ADMIN_PRIVATE_KEY is not set in environment" },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(privateKey);
    const client = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_BASE_RPC),
    }).extend(publicActions);

    const mockUsdcAddress = process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS as `0x${string}`;
    if (!mockUsdcAddress) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_MOCK_USDC_ADDRESS is not set" },
        { status: 500 }
      );
    }

    // Amount is in USDC (6 decimals)
    const amountToMint = parseUnits((amount || 1000).toString(), 6);

    const { request } = await client.simulateContract({
      address: mockUsdcAddress,
      abi: MOCK_USDC_ABI,
      functionName: "mint",
      args: [address as `0x${string}`, amountToMint],
    });

    const hash = await client.writeContract(request);

    // Wait for the transaction to be mined
    await client.waitForTransactionReceipt({ hash });

    return NextResponse.json({ success: true, hash });
  } catch (error: any) {
    console.error("Faucet error:", error);
    return NextResponse.json({ error: error.message || "Failed to mint USDC" }, { status: 500 });
  }
}

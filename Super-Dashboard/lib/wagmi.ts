import { http } from "viem";
import { baseSepolia } from "viem/chains";
import { cookieStorage, createConfig, createStorage } from "wagmi";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

import { APP_NAME, BASE_MAINNET } from "@/lib/constants";

const PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  "vista-demo-walletconnect";

const RPC_URL = process.env.NEXT_PUBLIC_BASE_RPC || BASE_MAINNET.rpcUrl;

export const baseNetwork = baseSepolia;
export const baseSepoliaNetwork = baseNetwork;

export const wagmiConfig = createConfig({
  chains: [baseNetwork],
  connectors: [
    injected(),
    walletConnect({ projectId: PROJECT_ID }),
    coinbaseWallet({ appName: APP_NAME }),
  ],
  transports: {
    [baseNetwork.id]: http(RPC_URL),
  },
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
});

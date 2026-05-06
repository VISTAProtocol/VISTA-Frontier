import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import Web3Provider from "@/modules/auth/Web3Provider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata = {
  title: "Farcaster Clone",
  description: "Homepage and basic login flow for a Farcaster-inspired app",
  other: {
    "talentapp:project_verification":
      "be534ebffd928d4a8ffc5170697c3f71366faa288be39c83e62d0cd90b6a013b06955e98f3884817fcbc7dcf0748ffb5a6a5c2a6dc6bbbccde9709578ba6b509",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}

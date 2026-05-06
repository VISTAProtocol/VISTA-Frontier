import { DashboardLayout } from "@/components/dashboard-layout"

export default function AdvertiserLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardLayout role="advertiser">{children}</DashboardLayout>
}

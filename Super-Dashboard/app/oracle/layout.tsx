import { DashboardLayout } from "@/components/dashboard-layout"

export default function OracleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardLayout role="oracle">{children}</DashboardLayout>
}

import { DashboardLayout } from "@/components/dashboard-layout"

export default function PublisherLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardLayout role="publisher">{children}</DashboardLayout>
}

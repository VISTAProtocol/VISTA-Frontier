import { redirect } from "next/navigation"

export default function PublisherAnalyticsPage() {
  redirect("/publisher/dashboard?tab=analytics")
}

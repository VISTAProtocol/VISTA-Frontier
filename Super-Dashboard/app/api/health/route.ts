import { jsonOk } from "@/lib/api"

export function GET() {
  return jsonOk({ status: "ok" })
}

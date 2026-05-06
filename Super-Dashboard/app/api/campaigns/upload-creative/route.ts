import { type NextRequest } from "next/server"

import { ApiError, jsonError, jsonOk } from "@/lib/api"
import { uploadToStorage } from "@/lib/storage"

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
])

const MAX_BYTES = 100 * 1024 * 1024 // 100 MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      throw new ApiError("No file provided.", 400)
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new ApiError(
        "File type not supported. Allowed: jpg, png, webp, gif, mp4, mov, webm.",
        400,
      )
    }

    if (file.size > MAX_BYTES) {
      throw new ApiError("File size exceeds 100 MB limit.", 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await uploadToStorage(buffer, file.name, file.type, file.size)

    return jsonOk(result)
  } catch (error) {
    console.error("[Upload]", error)
    return jsonError(error)
  }
}

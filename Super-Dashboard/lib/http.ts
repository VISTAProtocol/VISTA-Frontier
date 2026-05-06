export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  const contentType = response.headers.get("content-type") ?? ""
  const body = contentType.includes("application/json") ? await response.json() : await response.text()

  if (!response.ok) {
    const message =
      typeof body === "string"
        ? body
        : typeof body?.error === "string"
          ? body.error
          : "Something went wrong."

    throw new Error(message)
  }

  return body as T
}

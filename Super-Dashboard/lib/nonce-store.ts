interface NonceEntry {
  nonce: string
  expires: number
}

const store = new Map<string, NonceEntry>()

setInterval(() => {
  const now = Date.now()
  store.forEach((entry, key) => {
    if (entry.expires < now) store.delete(key)
  })
}, 60_000)

export function setNonce(address: string, nonce: string) {
  store.set(address.toLowerCase(), { nonce, expires: Date.now() + 5 * 60 * 1000 })
}

export function getNonceEntry(address: string): NonceEntry | undefined {
  return store.get(address.toLowerCase())
}

export function deleteNonce(address: string) {
  store.delete(address.toLowerCase())
}

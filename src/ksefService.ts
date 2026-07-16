const KSEF_API = 'https://api.ksef.mf.gov.pl/api/online'

interface KsefCredentials {
  nip: string
  token: string
}

interface ChallengeResponse {
  challenge: string
  timestamp: string
  timestampMs: number
}

interface AuthResponse {
  referenceNumber: string
  authenticationToken: {
    token: string
    validUntil: string
  }
}

export async function getKsefChallenge(): Promise<ChallengeResponse> {
  const response = await fetch(`${KSEF_API}/auth/challenge`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`KSEF API error: ${response.status}`)
  }

  return await response.json()
}

async function encryptTokenWithChallenge(token: string, timestampMs: number): Promise<string> {
  const payload = `${token}|${timestampMs}`
  
  // TODO: Implement RSA-OAEP SHA-256 encryption with KSEF public key
  // For now, return base64 encoded payload (client must implement real RSA encryption)
  // Browser crypto.subtle supports RSA-OAEP but needs proper key import
  return btoa(payload)
}

export async function authenticateWithKsef(credentials: KsefCredentials): Promise<AuthResponse> {
  const challenge = await getKsefChallenge()
  
  const encryptedToken = await encryptTokenWithChallenge(
    credentials.token,
    challenge.timestampMs
  )

  const response = await fetch(`${KSEF_API}/auth/ksef-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      challenge: challenge.challenge,
      contextIdentifier: {
        type: 'Nip',
        value: credentials.nip,
      },
      encryptedToken,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`KSEF auth failed: ${JSON.stringify(error)}`)
  }

  return await response.json()
}

export async function validateKsefToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${KSEF_API}/auth/sessions`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.ok
  } catch {
    return false
  }
}

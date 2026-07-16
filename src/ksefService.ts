const KSEF_API = import.meta.env.DEV ? '/api/ksef' : 'https://api.ksef.mf.gov.pl/v2'

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

  const authPayload = {
    challenge: challenge.challenge,
    contextIdentifier: {
      type: 'Nip',
      value: credentials.nip,
    },
    encryptedToken,
  }
  
  console.log('Auth request:', { nip: credentials.nip, challenge: challenge.challenge })

  const response = await fetch(`${KSEF_API}/auth/ksef-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(authPayload),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Auth failed:', error)
    throw new Error(`KSEF auth failed: ${JSON.stringify(error)}`)
  }

  const authResponse = await response.json()
  console.log('Auth success, checking permissions...')
  
  // Try to decode JWT to see permissions
  try {
    const tokenParts = authResponse.authenticationToken.token.split('.')
    if (tokenParts.length === 3) {
      const payload = JSON.parse(atob(tokenParts[1]))
      console.log('JWT payload:', payload)
    }
  } catch (e) {
    console.error('Could not decode JWT:', e)
  }

  return authResponse
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

export interface KsefInvoice {
  ksefNumber: string
  issueDate: string
  invoicingDate?: string
  subjectName: string
  amountBrutto: number
  currencyCode: string
}

interface InvoiceQueryResponse {
  invoices: KsefInvoice[]
  hasMore: boolean
  isTruncated: boolean
}

export async function queryInvoices(
  sessionToken: string,
  pageSize: number = 50
): Promise<InvoiceQueryResponse> {
  const dateFrom = new Date()
  dateFrom.setMonth(dateFrom.getMonth() - 3)

  const response = await fetch(
    `${KSEF_API}/invoices/query/metadata?pageSize=${pageSize}&pageOffset=0&sortOrder=Desc`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subjectType: 'Subject2',
        dateRange: {
          dateType: 'IssueDate',
          from: dateFrom.toISOString(),
          to: new Date().toISOString(),
        },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`KSEF query failed: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return {
    invoices: data.invoices || [],
    hasMore: data.hasMore || false,
    isTruncated: data.isTruncated || false,
  }
}

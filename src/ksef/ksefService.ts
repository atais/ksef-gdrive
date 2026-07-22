import * as forge from 'node-forge'
import * as xadesjs from 'xadesjs'

const KSEF_API = import.meta.env.DEV ? '/api/ksef' : 'https://api.ksef.mf.gov.pl/v2'

export interface KsefCertificateCredentials {
  method: 'certificate'
  nip: string
  certPem: string
  keyPem: string
  keyPassword: string
}

export type KsefCredentials = KsefCertificateCredentials

interface ChallengeResponse {
  challenge: string
  timestamp: string
  timestampMs: number
}

interface AuthInitResponse {
  referenceNumber: string
  authenticationToken: {
    token: string
    validUntil: string
  }
}

interface AuthStatusResponse {
  status: {
    code: number
    description: string
    details?: string[]
  }
}

export interface KsefAccessTokenResponse {
  accessToken: { token: string; validUntil: string }
  refreshToken: { token: string; validUntil: string }
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

// Polls the authentication operation until it leaves the "in progress" (100) state.
async function pollAuthStatus(
  referenceNumber: string,
  operationToken: string,
  { intervalMs = 1000, timeoutMs = 20000 } = {}
): Promise<AuthStatusResponse> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${KSEF_API}/auth/${referenceNumber}`, {
      headers: { Authorization: `Bearer ${operationToken}` },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`KSEF auth status check failed: ${response.status} - ${error}`)
    }

    const data: AuthStatusResponse = await response.json()
    if (data.status.code !== 100) {
      return data
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('KSEF authentication timed out')
}

async function redeemAccessToken(operationToken: string): Promise<KsefAccessTokenResponse> {
  const response = await fetch(`${KSEF_API}/auth/token/redeem`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${operationToken}` },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`KSEF token redeem failed: ${response.status} - ${error}`)
  }

  return await response.json()
}

// Shared tail of both auth methods: wait for the async operation to finish, then
// exchange the temporary operation token for the real access/refresh tokens.
async function finalizeAuthentication(init: AuthInitResponse): Promise<KsefAccessTokenResponse> {
  const operationToken = init.authenticationToken.token
  const status = await pollAuthStatus(init.referenceNumber, operationToken)

  if (status.status.code !== 200) {
    const details = status.status.details?.length ? ` - ${status.status.details.join('; ')}` : ''
    throw new Error(`KSEF auth failed: ${status.status.description}${details}`)
  }

  return await redeemAccessToken(operationToken)
}

function buildAuthTokenRequestXml(challenge: string, nip: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>\n<AuthTokenRequest xmlns="http://ksef.mf.gov.pl/auth/token/2.0">\n  <Challenge>${challenge}</Challenge>\n  <ContextIdentifier>\n    <Nip>${nip}</Nip>\n  </ContextIdentifier>\n  <SubjectIdentifierType>certificateSubject</SubjectIdentifierType>\n</AuthTokenRequest>`
}

function pemCertToBase64Der(certPem: string): string {
  return certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')
}

// Converts a forge BigInteger to the base64url encoding JWK expects (minimal
// big-endian byte representation, no padding).
function bigIntToBase64Url(value: forge.jsbn.BigInteger): string {
  let hex = value.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  const bytes = forge.util.hexToBytes(hex)
  return byteStringToBase64Url(bytes)
}

function byteStringToBase64Url(bytes: string): string {
  return forge.util
    .encode64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

const RSA_ENCRYPTION_OID = forge.pki.oids.rsaEncryption as string
const EC_PUBLIC_KEY_OID = '1.2.840.10045.2.1'

const EC_CURVES: Record<string, { jwkName: string; hash: string }> = {
  '1.2.840.10045.3.1.7': { jwkName: 'P-256', hash: 'SHA-256' },
  '1.3.132.0.34': { jwkName: 'P-384', hash: 'SHA-384' },
  '1.3.132.0.35': { jwkName: 'P-521', hash: 'SHA-512' },
}

interface SigningKeyMaterial {
  algorithm: RsaHashedImportParams | EcKeyImportParams
  jwk: JsonWebKey
}

// Parses a SEC1 ECPrivateKey DER structure (RFC 5915), optionally falling back
// to a curve OID inherited from the enclosing PKCS#8 AlgorithmIdentifier.
function parseEcPrivateKeyOctet(octetBytes: string, curveOidFromOuter?: string): SigningKeyMaterial {
  const ecAsn1 = forge.asn1.fromDer(octetBytes)
  const seq = ecAsn1.value as forge.asn1.Asn1[]
  const privateKeyOctet = seq[1].value as string

  let curveOid = curveOidFromOuter
  let publicKeyBits: string | undefined

  for (let i = 2; i < seq.length; i++) {
    const item = seq[i]
    if (item.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && item.type === 0) {
      const inner = (item.value as forge.asn1.Asn1[])[0]
      curveOid = forge.asn1.derToOid(inner.value as string)
    }
    if (item.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && item.type === 1) {
      const bitString = (item.value as forge.asn1.Asn1[])[0]
      publicKeyBits = bitString.value as string
    }
  }

  if (!curveOid || !EC_CURVES[curveOid]) {
    throw new Error(`Unsupported EC curve${curveOid ? `: ${curveOid}` : ''}`)
  }
  if (!publicKeyBits) {
    throw new Error('EC private key does not embed its public key point - unsupported')
  }

  // BIT STRING content: first byte is the "unused bits" count, then 0x04 || X || Y
  // (uncompressed point encoding).
  const pointBytes = publicKeyBits.slice(1)
  if (pointBytes.charCodeAt(0) !== 0x04) {
    throw new Error('Only uncompressed EC public key points are supported')
  }
  const coordLength = (pointBytes.length - 1) / 2
  const x = pointBytes.slice(1, 1 + coordLength)
  const y = pointBytes.slice(1 + coordLength)

  const curve = EC_CURVES[curveOid]
  return {
    algorithm: { name: 'ECDSA', hash: curve.hash, namedCurve: curve.jwkName } as EcKeyImportParams,
    jwk: {
      kty: 'EC',
      crv: curve.jwkName,
      x: byteStringToBase64Url(x),
      y: byteStringToBase64Url(y),
      d: byteStringToBase64Url(privateKeyOctet),
    },
  }
}

function rsaPrivateKeyToJwk(rsaPrivateKey: forge.pki.rsa.PrivateKey): SigningKeyMaterial {
  return {
    algorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    jwk: {
      kty: 'RSA',
      n: bigIntToBase64Url(rsaPrivateKey.n),
      e: bigIntToBase64Url(rsaPrivateKey.e),
      d: bigIntToBase64Url(rsaPrivateKey.d),
      p: bigIntToBase64Url(rsaPrivateKey.p),
      q: bigIntToBase64Url(rsaPrivateKey.q),
      dp: bigIntToBase64Url(rsaPrivateKey.dP),
      dq: bigIntToBase64Url(rsaPrivateKey.dQ),
      qi: bigIntToBase64Url(rsaPrivateKey.qInv),
    },
  }
}

// Reads a (decrypted) PKCS#8 PrivateKeyInfo ASN.1 structure and builds signing
// key material for whichever algorithm it actually contains - RSA or EC. KSEF
// accepts XAdES signatures made with either, so we can't assume RSA.
function privateKeyInfoToSigningMaterial(privateKeyInfo: forge.asn1.Asn1): SigningKeyMaterial {
  const seq = privateKeyInfo.value as forge.asn1.Asn1[]
  const algorithmIdSeq = seq[1].value as forge.asn1.Asn1[]
  const algorithmOid = forge.asn1.derToOid(algorithmIdSeq[0].value as string)

  if (algorithmOid === RSA_ENCRYPTION_OID) {
    const rsaPrivateKey = forge.pki.privateKeyFromAsn1(privateKeyInfo) as forge.pki.rsa.PrivateKey
    return rsaPrivateKeyToJwk(rsaPrivateKey)
  }

  if (algorithmOid === EC_PUBLIC_KEY_OID) {
    const curveOidFromParams = algorithmIdSeq[1]
      ? forge.asn1.derToOid(algorithmIdSeq[1].value as string)
      : undefined
    const ecKeyOctet = seq[2].value as string
    return parseEcPrivateKeyOctet(ecKeyOctet, curveOidFromParams)
  }

  throw new Error(`Unsupported private key algorithm (OID ${algorithmOid}) - expected RSA or EC`)
}

// Decrypts the (password protected) private key, regardless of whether it's stored
// as encrypted PKCS#8, traditional encrypted PKCS#1 RSA, or unencrypted PEM, and
// builds WebCrypto-ready signing key material (RSA or EC) as a JWK. Building the
// key this way - instead of round-tripping through PKCS#8 DER - avoids ASN.1
// (re)encoding bugs that made crypto.subtle reject some real-world certificates
// with an opaque DataError.
function decryptPrivateKeyToSigningMaterial(keyPem: string, password: string): SigningKeyMaterial {
  if (keyPem.includes('ENCRYPTED PRIVATE KEY')) {
    const encryptedPrivateKeyInfo = forge.pki.encryptedPrivateKeyFromPem(keyPem)
    let privateKeyInfo: forge.asn1.Asn1 | null
    try {
      privateKeyInfo = forge.pki.decryptPrivateKeyInfo(encryptedPrivateKeyInfo, password)
    } catch {
      privateKeyInfo = null
    }
    if (!privateKeyInfo) {
      throw new Error('Could not decrypt private key - check the password')
    }
    return privateKeyInfoToSigningMaterial(privateKeyInfo)
  }

  if (keyPem.includes('RSA PRIVATE KEY')) {
    const decrypted = forge.pki.decryptRsaPrivateKey(keyPem, password)
    if (!decrypted) {
      throw new Error('Could not decrypt private key - check the password')
    }
    return rsaPrivateKeyToJwk(decrypted)
  }

  if (keyPem.includes('EC PRIVATE KEY')) {
    // Traditional SEC1 format is not password-encrypted the same way PKCS#8 is;
    // encrypted variants (Proc-Type/DEK-Info headers) aren't supported here.
    // Convert with `openssl pkcs8 -topk8` to use such a key.
    if (keyPem.includes('Proc-Type')) {
      throw new Error(
        'Encrypted traditional EC keys are not supported - convert with `openssl pkcs8 -topk8` first'
      )
    }
    const der = forge.pem.decode(keyPem)[0].body
    return parseEcPrivateKeyOctet(der)
  }

  if (keyPem.includes('PRIVATE KEY')) {
    // Unencrypted PKCS#8 key was provided - still works, password is simply ignored.
    const der = forge.pem.decode(keyPem)[0].body
    const privateKeyInfo = forge.asn1.fromDer(der)
    return privateKeyInfoToSigningMaterial(privateKeyInfo)
  }

  throw new Error('Unrecognized private key format - expected a PEM encoded RSA or EC key')
}

// Signs the AuthTokenRequest XML document with an XAdES-BES enveloped signature
// using the supplied certificate + private key. Everything runs client-side -
// the private key never leaves the browser. Supports both RSA and EC (ECDSA)
// certificates, matching the reference KSEF client SDKs.
async function signAuthTokenXml(
  xml: string,
  certPem: string,
  keyPem: string,
  keyPassword: string
): Promise<string> {
  const { algorithm, jwk } = decryptPrivateKeyToSigningMaterial(keyPem, keyPassword)
  const signingKey = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['sign'])

  const doc = xadesjs.Parse(xml)
  const signedXml = new xadesjs.SignedXml()

  await signedXml.Sign(
    algorithm,
    signingKey,
    doc,
    {
      x509: [pemCertToBase64Der(certPem)],
      // uri: '' must be explicit - xmldsigjs.Reference.Uri defaults to `undefined`
      // and is only serialized when explicitly assigned. Without it the enveloped
      // reference is emitted without a URI attribute at all, which KSeF's backend
      // parses as a null reference ("Element wskazywany przez referencję 'null'
      // nie został odnaleziony" / exceptionCode 9105).
      references: [{ uri: '', hash: 'SHA-256', transforms: ['enveloped'] }],
    }
  )

  return signedXml.toString()
}

export async function authenticateWithCertificate(
  credentials: KsefCertificateCredentials
): Promise<KsefAccessTokenResponse> {
  const challenge = await getKsefChallenge()
  const xml = buildAuthTokenRequestXml(challenge.challenge, credentials.nip)
  const signedXml = await signAuthTokenXml(
    xml,
    credentials.certPem,
    credentials.keyPem,
    credentials.keyPassword
  )

  const response = await fetch(`${KSEF_API}/auth/xades-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: signedXml,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`KSEF certificate auth failed: ${response.status} - ${error}`)
  }

  const init: AuthInitResponse = await response.json()
  return await finalizeAuthentication(init)
}

export async function authenticateWithKsef(
  credentials: KsefCredentials
): Promise<KsefAccessTokenResponse> {
  return await authenticateWithCertificate(credentials)
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

export type InvoiceQuerySubjectType = 'Subject1' | 'Subject2' | 'Subject3' | 'SubjectAuthorized'
export type InvoiceQueryDateType = 'Issue' | 'Invoicing' | 'PermanentStorage'

export interface InvoiceQueryDateRange {
  dateType: InvoiceQueryDateType
  from: string
  to?: string
}

export interface InvoiceQueryFilters {
  subjectType: InvoiceQuerySubjectType
  dateRange: InvoiceQueryDateRange
  ksefNumber?: string
  invoiceNumber?: string
}

export interface InvoiceMetadataParty {
  nip?: string
  name?: string
}

export interface InvoiceMetadata {
  ksefNumber: string
  invoiceNumber: string
  issueDate: string
  invoicingDate: string
  acquisitionDate: string
  permanentStorageDate: string
  seller: InvoiceMetadataParty
  buyer: { identifier: { type: string; value?: string }; name?: string }
  netAmount: number
  grossAmount: number
  vatAmount: number
  currency: string
  invoicingMode: string
  invoiceType: string
}

export interface QueryInvoicesMetadataResponse {
  hasMore: boolean
  isTruncated: boolean
  permanentStorageHwmDate: string | null
  invoices: InvoiceMetadata[]
}

// Lists invoice metadata matching the given filters ("Pobranie listy metadanych faktur").
// The date range is limited by KSEF to a 3 month window.
export async function queryInvoicesMetadata(
  sessionToken: string,
  filters: InvoiceQueryFilters,
  { pageOffset = 0, pageSize = 50 }: { pageOffset?: number; pageSize?: number } = {}
): Promise<QueryInvoicesMetadataResponse> {
  const response = await fetch(
    `${KSEF_API}/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=${pageSize}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(filters),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`KSEF invoice query failed: ${response.status} - ${error}`)
  }

  return await response.json()
}

// Downloads a single invoice's XML content by its KSEF number ("Pobranie faktury po numerze KSeF").
export async function downloadInvoiceXml(sessionToken: string, ksefNumber: string): Promise<string> {
  const response = await fetch(`${KSEF_API}/invoices/ksef/${ksefNumber}`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`KSEF invoice download failed: ${response.status} - ${error}`)
  }

  return await response.text()
}

export interface KsefEntityRole {
  role: string
  description: string
  startDate: string
}

interface EntityRolesResponse {
  roles: KsefEntityRole[]
  hasMore: boolean
}

export async function queryEntityRoles(
  sessionToken: string,
  pageSize: number = 10
): Promise<EntityRolesResponse> {
  const response = await fetch(
    `${KSEF_API}/permissions/query/entities/roles?pageOffset=0&pageSize=${pageSize}`,
    {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`KSEF query failed: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return {
    roles: data.roles || [],
    hasMore: data.hasMore || false,
  }
}

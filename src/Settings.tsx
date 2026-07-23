import { useState } from 'react'
import type { KsefCredentials } from './ksef/ksefService'

interface SettingsProps {
  currentCredentials: KsefCredentials | null
  onSave: (credentials: KsefCredentials) => Promise<void>
  saving: boolean
}

export function Settings({ currentCredentials, onSave, saving }: SettingsProps) {
  const [nip, setNip] = useState(currentCredentials?.nip || '')
  const [certPem, setCertPem] = useState('')
  const [keyPem, setKeyPem] = useState('')
  const [keyPassword, setKeyPassword] = useState('')
  const [error, setError] = useState('')

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!nip || !/^\d{10}$/.test(nip)) {
      setError('NIP must be 10 digits')
      return
    }

    const effectiveCert = certPem || currentCredentials?.certPem || ''
    const effectiveKey = keyPem || currentCredentials?.keyPem || ''
    const effectivePassword = keyPassword || currentCredentials?.keyPassword || ''

    if (!effectiveCert || !effectiveKey) {
      setError('Upload both the certificate (.crt) and the private key (.key)')
      return
    }

    try {
      await onSave({ method: 'certificate', nip, certPem: effectiveCert, keyPem: effectiveKey, keyPassword: effectivePassword })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">

        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              KSEF Settings
            </h2>
            <p className="text-gray-600">
              Update your KSEF certificate connection details.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="nip" className="block text-sm font-semibold text-gray-900 mb-2">
                NIP
              </label>
              <input
                id="nip"
                type="text"
                value={nip}
                onChange={(e) => setNip(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="1234567890"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                disabled={saving}
              />
            </div>

            <div>
              <label htmlFor="cert" className="block text-sm font-semibold text-gray-900 mb-2">
                Certificate (.crt / .pem)
              </label>
              <input
                id="cert"
                type="file"
                accept=".crt,.pem,.cer"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) setCertPem(await readFileAsText(file))
                }}
                className="w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                disabled={saving}
              />
              {certPem ? (
                <p className="text-sm text-green-600 mt-2">New certificate loaded</p>
              ) : currentCredentials ? (
                <p className="text-sm text-gray-500 mt-2">Current certificate is saved. Upload a new one to replace it.</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="key" className="block text-sm font-semibold text-gray-900 mb-2">
                Private Key (.key)
              </label>
              <input
                id="key"
                type="file"
                accept=".key,.pem"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) setKeyPem(await readFileAsText(file))
                }}
                className="w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                disabled={saving}
              />
              {keyPem ? (
                <p className="text-sm text-green-600 mt-2">New private key loaded</p>
              ) : currentCredentials ? (
                <p className="text-sm text-gray-500 mt-2">Current private key is saved. Upload a new one to replace it.</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="keyPassword" className="block text-sm font-semibold text-gray-900 mb-2">
                Private Key Password
              </label>
              <input
                id="keyPassword"
                type="password"
                value={keyPassword}
                onChange={(e) => setKeyPassword(e.target.value)}
                placeholder="Leave empty to keep current password"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                disabled={saving}
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-all hover:shadow-lg hover:shadow-blue-600/30"
              >
                {saving ? (
                  <>
                    <svg className="w-5 h-5 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-600">
              <strong>Note:</strong> The private key is only used client-side in your browser
              to sign the KSEF authentication request. Only RSA keys are currently supported.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

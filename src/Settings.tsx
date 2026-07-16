import { useState } from 'react'

interface KsefCredentials {
  nip: string
  token: string
}

interface SettingsProps {
  currentCredentials: KsefCredentials | null
  onSave: (nip: string, token: string) => Promise<void>
  onBack: () => void
  saving: boolean
}

export function Settings({ currentCredentials, onSave, onBack, saving }: SettingsProps) {
  const [nip, setNip] = useState(currentCredentials?.nip || '')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!nip || !token) {
      setError('Fill all fields')
      return
    }

    if (!/^\d{10}$/.test(nip)) {
      setError('NIP must be 10 digits')
      return
    }

    try {
      await onSave(nip, token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              KSEF Settings
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Update your KSEF connection details. Generate new token at{' '}
              <a
                href="https://ksef.mf.gov.pl"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                ksef.mf.gov.pl
              </a>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="nip" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                NIP
              </label>
              <input
                id="nip"
                type="text"
                value={nip}
                onChange={(e) => setNip(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="1234567890"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                disabled={saving}
              />
            </div>

            <div>
              <label htmlFor="token" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                KSEF Token
              </label>
              <textarea
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter new token or leave empty to keep current"
                rows={4}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 font-mono text-sm"
                disabled={saving}
              />
              {currentCredentials && !token && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Current token is saved. Enter new token to update.
                </p>
              )}
            </div>

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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

          <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-400 mb-3">
              <strong>How to generate token with InvoiceRead permission:</strong>
            </p>
            <ol className="text-sm text-amber-800 dark:text-amber-400 list-decimal list-inside space-y-2">
              <li>Go to <a href="https://ksef.mf.gov.pl" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900 dark:hover:text-amber-300">ksef.mf.gov.pl</a> and log in</li>
              <li>Navigate to <strong>Ustawienia</strong> (Settings) → <strong>Tokeny autoryzacyjne</strong></li>
              <li>Click <strong>Generuj nowy token</strong> (Generate new token)</li>
              <li>Enter token name and <strong>IMPORTANT: Check "Odczyt faktur" (InvoiceRead) checkbox</strong></li>
              <li>Click <strong>Generuj</strong> - token shown only once, copy immediately</li>
              <li>Paste token here and save</li>
            </ol>
            <p className="text-sm text-amber-800 dark:text-amber-400 mt-3 font-semibold">
              ⚠️ Without "Odczyt faktur" permission, token won't work for listing invoices
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

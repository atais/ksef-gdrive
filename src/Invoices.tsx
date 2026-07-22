import { useState } from 'react'
import {
  queryInvoicesMetadata,
  downloadInvoiceXml,
  type InvoiceMetadata,
  type InvoiceQuerySubjectType,
  type InvoiceQueryDateType,
} from './ksef/ksefService'
import { saveTextFileToFolder } from './gdrive/googleDriveService'

interface InvoicesProps {
  sessionToken: string
  accessToken: string | null
  driveFolderId: string | null
}

function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

export function Invoices({ sessionToken, accessToken, driveFolderId }: InvoicesProps) {
  const [subjectType, setSubjectType] = useState<InvoiceQuerySubjectType>('Subject2')
  const [dateType, setDateType] = useState<InvoiceQueryDateType>('Invoicing')
  const [from, setFrom] = useState(isoDaysAgo(30).slice(0, 10))
  const [to, setTo] = useState('')
  const [invoices, setInvoices] = useState<InvoiceMetadata[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [savingKsefNumber, setSavingKsefNumber] = useState<string | null>(null)

  const fetchInvoices = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await queryInvoicesMetadata(sessionToken, {
        subjectType,
        dateRange: {
          dateType,
          from: new Date(from).toISOString(),
          to: to ? new Date(to).toISOString() : undefined,
        },
      })
      setInvoices(result.invoices)
      setHasMore(result.hasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list invoices')
    } finally {
      setLoading(false)
    }
  }

  const saveInvoiceToDrive = async (invoice: InvoiceMetadata) => {
    if (!accessToken || !driveFolderId) {
      setError('Connect Google Drive first')
      return
    }
    setSavingKsefNumber(invoice.ksefNumber)
    setError(null)
    try {
      const xml = await downloadInvoiceXml(sessionToken, invoice.ksefNumber)
      await saveTextFileToFolder(
        accessToken,
        driveFolderId,
        `${invoice.ksefNumber}.xml`,
        xml,
        'application/xml'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice')
    } finally {
      setSavingKsefNumber(null)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">KSEF Invoices</h3>
      </div>

      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Role
          </label>
          <select
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value as InvoiceQuerySubjectType)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="Subject1">Issued (as seller)</option>
            <option value="Subject2">Received (as buyer)</option>
            <option value="Subject3">Subject3</option>
            <option value="SubjectAuthorized">Authorized</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Date type
          </label>
          <select
            value={dateType}
            onChange={(e) => setDateType(e.target.value as InvoiceQueryDateType)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="Issue">Issue date</option>
            <option value="Invoicing">Invoicing date</option>
            <option value="PermanentStorage">Permanent storage date</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            From
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            To (optional)
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <button
          type="button"
          onClick={fetchInvoices}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-all"
        >
          {loading ? 'Loading...' : 'List Invoices'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 text-sm text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {invoices.length === 0 && !loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 font-medium">No invoices loaded</p>
          <p className="text-gray-500 dark:text-gray-500 text-sm">
            Pick a date range and click "List Invoices"
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">KSEF Number</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Invoice Number</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Issue Date</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Seller</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Buyer</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Gross</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.ksefNumber}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td className="py-4 px-4 text-sm font-mono text-gray-900 dark:text-white">{invoice.ksefNumber}</td>
                  <td className="py-4 px-4 text-sm text-gray-900 dark:text-white">{invoice.invoiceNumber}</td>
                  <td className="py-4 px-4 text-sm text-gray-600 dark:text-gray-400">{invoice.issueDate}</td>
                  <td className="py-4 px-4 text-sm text-gray-900 dark:text-white">{invoice.seller?.name || invoice.seller?.nip}</td>
                  <td className="py-4 px-4 text-sm text-gray-900 dark:text-white">{invoice.buyer?.name || invoice.buyer?.identifier?.value}</td>
                  <td className="py-4 px-4 text-sm text-right text-gray-900 dark:text-white">
                    {invoice.grossAmount.toFixed(2)} {invoice.currency}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => saveInvoiceToDrive(invoice)}
                      disabled={savingKsefNumber === invoice.ksefNumber}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all disabled:opacity-50"
                    >
                      {savingKsefNumber === invoice.ksefNumber ? 'Saving...' : 'Save to Drive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-4">
              More results available - narrow the date range to see them.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

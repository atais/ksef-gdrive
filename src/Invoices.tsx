import { useState } from 'react'
import {
  queryInvoicesMetadata,
  downloadInvoiceXml,
  type InvoiceMetadata,
  type InvoiceQuerySubjectType,
  type InvoiceQueryDateType,
} from './ksef/ksefService'
import {
  saveTextFileToFolder,
  ensureMonthCategoryFolder,
  type InvoiceCategoryFolder,
} from './gdrive/googleDriveService'

interface InvoicesProps {
  sessionToken: string
  accessToken: string | null
  ksefFolderId: string | null
  userNip: string
}

function isoMonthsAgo(months: number): string {
  const date = new Date()
  date.setMonth(date.getMonth() - months)
  date.setDate(date.getDate() + 1)
  return date.toISOString()
}

const ALL_SUBJECT_TYPES: InvoiceQuerySubjectType[] = ['Subject1', 'Subject2', 'Subject3', 'SubjectAuthorized']

const MONTH_KEY_PATTERN = /^(\d{2})\.(\d{4})$/

function normalizeNip(nip: string | undefined): string {
  return (nip ?? '').replace(/[\s-]/g, '')
}

// Am I the seller or the buyer on this invoice? Seller invoices are sales
// (_Sprzedaz), everything else is treated as a cost (_Koszty).
function invoiceRole(invoice: InvoiceMetadata, userNip: string): 'seller' | 'buyer' {
  const me = normalizeNip(userNip)
  return me && normalizeNip(invoice.seller?.nip) === me ? 'seller' : 'buyer'
}

function categoryForRole(role: 'seller' | 'buyer'): InvoiceCategoryFolder {
  return role === 'seller' ? '_Sprzedaz' : '_Koszty'
}

// Default month bucket for an invoice, as MM.YYYY, from its issue date.
function invoiceMonthKey(invoice: InvoiceMetadata): string {
  const date = new Date(invoice.issueDate)
  if (Number.isNaN(date.getTime())) {
    const now = new Date()
    return `${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
  }
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`
}

function monthOptionsForKey(monthKey: string): string[] {
  const match = MONTH_KEY_PATTERN.exec(monthKey)
  const year = match ? match[2] : String(new Date().getFullYear())
  return Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}.${year}`)
}

export function Invoices({ sessionToken, accessToken, ksefFolderId, userNip }: InvoicesProps) {
  const [subjectType, setSubjectType] = useState<InvoiceQuerySubjectType | 'All'>('Subject2')
  const [dateType, setDateType] = useState<InvoiceQueryDateType>('Invoicing')
  const [from, setFrom] = useState(isoMonthsAgo(3).slice(0, 10))
  const [to, setTo] = useState('')
  const [invoices, setInvoices] = useState<InvoiceMetadata[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [savingKsefNumber, setSavingKsefNumber] = useState<string | null>(null)
  const [monthOverrides, setMonthOverrides] = useState<Record<string, string>>({})
  const [acceptedKsefNumbers, setAcceptedKsefNumbers] = useState<Set<string>>(new Set())

  const fetchInvoices = async () => {
    setLoading(true)
    setError(null)
    try {
      const dateRange = {
        dateType,
        from: new Date(from).toISOString(),
        to: to ? new Date(to).toISOString() : undefined,
      }

      if (subjectType === 'All') {
        const results = await Promise.all(
          ALL_SUBJECT_TYPES.map((type) =>
            queryInvoicesMetadata(sessionToken, { subjectType: type, dateRange })
          )
        )
        const merged = new Map<string, InvoiceMetadata>()
        for (const result of results) {
          for (const invoice of result.invoices) {
            merged.set(invoice.ksefNumber, invoice)
          }
        }
        setInvoices(Array.from(merged.values()))
        setHasMore(results.some((result) => result.hasMore))
      } else {
        const result = await queryInvoicesMetadata(sessionToken, { subjectType, dateRange })
        setInvoices(result.invoices)
        setHasMore(result.hasMore)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list invoices')
    } finally {
      setLoading(false)
    }
  }

  // Accepts an invoice: downloads its XML and files it under
  // <year>/<MM.year>/_Sprzedaz (if I'm the seller) or _Koszty (if buyer).
  const acceptInvoice = async (invoice: InvoiceMetadata) => {
    if (!accessToken || !ksefFolderId) {
      setError('Connect Google Drive first')
      return
    }
    const monthKey = monthOverrides[invoice.ksefNumber] ?? invoiceMonthKey(invoice)
    const match = MONTH_KEY_PATTERN.exec(monthKey)
    if (!match) {
      setError(`Invalid month: ${monthKey}`)
      return
    }
    const [, month, year] = match
    const category = categoryForRole(invoiceRole(invoice, userNip))

    setSavingKsefNumber(invoice.ksefNumber)
    setError(null)
    try {
      const folderId = await ensureMonthCategoryFolder(accessToken, ksefFolderId, year, month, category)
      const xml = await downloadInvoiceXml(sessionToken, invoice.ksefNumber)
      await saveTextFileToFolder(
        accessToken,
        folderId,
        `${invoice.ksefNumber}.xml`,
        xml,
        'application/xml'
      )
      setAcceptedKsefNumbers((prev) => new Set(prev).add(invoice.ksefNumber))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invoice')
    } finally {
      setSavingKsefNumber(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-gray-900">KSEF Invoices</h3>
      </div>

      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Role
          </label>
          <select
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value as InvoiceQuerySubjectType | 'All')}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
          >
            <option value="All">All roles</option>
            <option value="Subject1">Issued (as seller)</option>
            <option value="Subject2">Received (as buyer)</option>
            <option value="Subject3">Subject3</option>
            <option value="SubjectAuthorized">Authorized</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Date type
          </label>
          <select
            value={dateType}
            onChange={(e) => setDateType(e.target.value as InvoiceQueryDateType)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
          >
            <option value="Issue">Issue date</option>
            <option value="Invoicing">Invoicing date</option>
            <option value="PermanentStorage">Permanent storage date</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            From
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            To (optional)
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
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
        <div className="mb-4 px-4 py-2 text-sm text-red-700 bg-red-50 rounded-lg">
          {error}
        </div>
      )}

      {invoices.length === 0 && !loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600 font-medium">No invoices loaded</p>
          <p className="text-gray-500 text-sm">
            Pick a date range and click "List Invoices"
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Issue Date</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Invoice Number</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Seller</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Buyer</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Gross</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Accept</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.ksefNumber}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="py-4 px-4 text-sm text-gray-600">{invoice.issueDate}</td>
                  <td className="py-4 px-4 text-sm text-gray-900">{invoice.invoiceNumber}</td>
                  <td className="py-4 px-4 text-sm text-gray-900">{invoice.seller?.name || invoice.seller?.nip}</td>
                  <td className="py-4 px-4 text-sm text-gray-900">{invoice.buyer?.name || invoice.buyer?.identifier?.value}</td>
                  <td className="py-4 px-4 text-sm text-right text-gray-900">
                    {invoice.grossAmount.toFixed(2)} {invoice.currency}
                  </td>
                  <td className="py-4 px-4">
                    {(() => {
                      const role = invoiceRole(invoice, userNip)
                      const category = categoryForRole(role)
                      const monthKey = monthOverrides[invoice.ksefNumber] ?? invoiceMonthKey(invoice)
                      const isSaving = savingKsefNumber === invoice.ksefNumber
                      const isAccepted = acceptedKsefNumbers.has(invoice.ksefNumber)
                      return (
                        <div className="flex items-center justify-end gap-2">
                          <span
                            className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                              role === 'seller'
                                ? 'bg-green-50 text-green-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                            title={`Filed to ${category}`}
                          >
                            {category}
                          </span>
                          <select
                            value={monthKey}
                            onChange={(e) =>
                              setMonthOverrides((prev) => ({
                                ...prev,
                                [invoice.ksefNumber]: e.target.value,
                              }))
                            }
                            className="px-2 py-1 text-xs rounded-lg border border-gray-300 bg-white text-gray-900"
                          >
                            {monthOptionsForKey(monthKey).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => acceptInvoice(invoice)}
                            disabled={isSaving}
                            className={`inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 ${
                              isAccepted
                                ? 'text-green-700 hover:bg-green-50'
                                : 'text-white bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            {isSaving ? 'Accepting...' : isAccepted ? 'Accepted ✓' : 'Accept'}
                          </button>
                        </div>
                      )
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <p className="text-sm text-gray-500 mt-4">
              More results available - narrow the date range to see them.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

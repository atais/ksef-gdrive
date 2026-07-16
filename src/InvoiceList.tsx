import type { KsefInvoice } from './ksefService'

interface InvoiceListProps {
  invoices: KsefInvoice[]
  loading: boolean
  onRefresh: () => void
}

export function InvoiceList({ invoices, loading, onRefresh }: InvoiceListProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          KSEF Invoices
        </h3>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all disabled:opacity-50"
        >
          <svg className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {invoices.length === 0 && !loading ? (
        <div className="text-center py-12">
          <svg className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-600 dark:text-gray-400 font-medium">No invoices found</p>
          <p className="text-gray-500 dark:text-gray-500 text-sm">Invoices from last 3 months will appear here</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Number</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Date</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Subject</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.ksefNumber} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="py-4 px-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-white font-mono">
                      {invoice.ksefNumber}
                    </p>
                  </td>
                  <td className="py-4 px-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(invoice.issueDate).toLocaleDateString('pl-PL')}
                    </p>
                  </td>
                  <td className="py-4 px-4">
                    <p className="text-sm text-gray-900 dark:text-white">
                      {invoice.subjectName}
                    </p>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {invoice.amountBrutto.toFixed(2)} {invoice.currencyCode}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

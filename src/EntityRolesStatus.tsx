import type { KsefEntityRole } from './ksef/ksefService'

interface EntityRolesStatusProps {
  roles: KsefEntityRole[]
  loading: boolean
  onRefresh: () => void
}

export function EntityRolesStatus({ roles, loading, onRefresh }: EntityRolesStatusProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          KSEF Entity Roles
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

      {roles.length === 0 && !loading ? (
        <div className="text-center py-12">
          <svg className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-600 dark:text-gray-400 font-medium">No roles found</p>
          <p className="text-gray-500 dark:text-gray-500 text-sm">Roles for the current login context will appear here</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Role</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Description</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Since</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.role} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="py-4 px-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-white font-mono">
                      {role.role}
                    </p>
                  </td>
                  <td className="py-4 px-4">
                    <p className="text-sm text-gray-900 dark:text-white">
                      {role.description}
                    </p>
                  </td>
                  <td className="py-4 px-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(role.startDate).toLocaleDateString('pl-PL')}
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

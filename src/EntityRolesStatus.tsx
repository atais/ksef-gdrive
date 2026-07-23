import { ArrowPathIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import type { KsefEntityRole } from './ksef/ksefService'

interface EntityRolesStatusProps {
  roles: KsefEntityRole[]
  loading: boolean
  onRefresh: () => void
}

export function EntityRolesStatus({ roles, loading, onRefresh }: EntityRolesStatusProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-gray-900">
          KSEF Entity Roles
        </h3>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {roles.length === 0 && !loading ? (
        <div className="text-center py-12">
          <CheckCircleIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">No roles found</p>
          <p className="text-gray-500 text-sm">Roles for the current login context will appear here</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Role</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Description</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Since</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.role} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-4">
                    <p className="text-sm font-medium text-gray-900 font-mono">
                      {role.role}
                    </p>
                  </td>
                  <td className="py-4 px-4">
                    <p className="text-sm text-gray-900">
                      {role.description}
                    </p>
                  </td>
                  <td className="py-4 px-4">
                    <p className="text-sm text-gray-600">
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

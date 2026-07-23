import { Bars3Icon } from '@heroicons/react/24/solid'

interface HeaderProps {
  user: { email: string; name: string } | null
  onLogout: () => void
  onToggleSidebar: () => void
  isConnected?: boolean
}

export function Header({ user, onLogout, onToggleSidebar, isConnected }: HeaderProps) {
  return (
    <header className="w-full border-b border-gray-200 bg-white sticky top-0 z-50">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-2 lg:hidden text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">K</span>
            </div>
            <span className="font-bold text-lg text-gray-900 hidden sm:inline">KSEF</span>
          </div>
        </div>

        {user ? (
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} title={isConnected ? 'All systems connected' : 'Connection issues'} />
              <div className="flex flex-col items-end">
                <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
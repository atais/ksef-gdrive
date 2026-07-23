import { Bars3Icon, DocumentTextIcon, AdjustmentsHorizontalIcon, Cog6ToothIcon, ArrowPathIcon } from '@heroicons/react/24/solid'

interface HeaderProps {
  user: { email: string; name: string } | null
  onLogout: () => void
  onToggleSidebar: () => void
  isConnected?: boolean
  driveSyncing?: boolean
  currentView?: string
  onNavigate?: (view: string) => void
}

export function Header({ user, onLogout, onToggleSidebar, isConnected, driveSyncing, currentView, onNavigate }: HeaderProps) {
  const navItems = [
    { id: 'files', label: 'Files', icon: DocumentTextIcon },
    { id: 'invoices', label: 'Invoices', icon: AdjustmentsHorizontalIcon },
    { id: 'settings', label: 'Settings', icon: Cog6ToothIcon },
  ]

  return (
    <header className="w-full border-b border-gray-200 bg-white sticky top-0 z-50">
      <div className="flex h-16">
        {/* Logo section - sidebar width on desktop */}
        <div className="flex items-center gap-3 px-4 sm:px-6 w-full md:w-64 flex-shrink-0 border-r border-gray-200">
          <button
            onClick={onToggleSidebar}
            className="p-2 md:hidden text-gray-600 hover:bg-gray-100 rounded-lg"
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

        {/* Nav items - hidden on mobile, visible on md+ */}
        {user && (
          <nav className="hidden md:flex items-center gap-0 flex-1">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onNavigate?.(id)}
                className={`flex items-center justify-center gap-2 px-4 h-full transition-colors text-sm font-medium ${
                  currentView === id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}

        {/* User info and logout - right side */}
        {user ? (
          <div className="flex items-center gap-4 px-4 sm:px-6 flex-shrink-0">
            <div
              className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500"
              title={driveSyncing ? 'Syncing with Google Drive' : 'Google Drive up to date'}
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${driveSyncing ? 'animate-spin' : ''}`} />
              <span>{driveSyncing ? 'Syncing Drive...' : 'Drive synced'}</span>
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <div
                className="flex items-center gap-1.5 text-xs text-gray-500"
                title={isConnected ? 'KSEF connected' : 'KSEF connection issues'}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>KSEF</span>
              </div>
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
interface HeaderProps {
  user: { email: string; name: string } | null
  onLogout: () => void
  onToggleSidebar: () => void
}

export function Header({ user, onLogout, onToggleSidebar }: HeaderProps) {
  return (
    <header className="w-full border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleSidebar}
              className="p-2 lg:hidden text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-sm">K</span>
              </div>
              <span className="font-bold text-lg text-gray-900 dark:text-white hidden sm:inline">KSEF</span>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{user.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
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
      </div>
    </header>
  )
}

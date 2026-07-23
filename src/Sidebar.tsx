import { HomeIcon, DocumentTextIcon, AdjustmentsHorizontalIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  onNavigate?: (view: string) => void
  currentView?: string
}

export function Sidebar({ isOpen, onClose, onNavigate, currentView }: SidebarProps) {
  const handleNavigate = (view: string) => {
    onNavigate?.(view)
    onClose()
  }

  const navItemClass = (view: string) =>
    `w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors font-medium text-sm ${
      currentView === view
        ? 'bg-blue-600 text-white'
        : 'text-gray-700 hover:bg-gray-100'
    }`

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed lg:static left-0 top-16 bottom-0 w-64 bg-white border-r border-gray-200 z-40 transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <nav className="p-4 space-y-1">
          <button
            onClick={() => handleNavigate('main')}
            className={navItemClass('main')}
            aria-current={currentView === 'main' ? 'page' : undefined}
          >
            <HomeIcon className="w-5 h-5" />
            Dashboard
          </button>
          <button
            onClick={() => handleNavigate('files')}
            className={navItemClass('files')}
            aria-current={currentView === 'files' ? 'page' : undefined}
          >
            <DocumentTextIcon className="w-5 h-5" />
            Files
          </button>
          <button
            onClick={() => handleNavigate('invoices')}
            className={navItemClass('invoices')}
            aria-current={currentView === 'invoices' ? 'page' : undefined}
          >
            <AdjustmentsHorizontalIcon className="w-5 h-5" />
            Invoices
          </button>
          <button
            onClick={() => handleNavigate('settings')}
            className={navItemClass('settings')}
            aria-current={currentView === 'settings' ? 'page' : undefined}
          >
            <Cog6ToothIcon className="w-5 h-5" />
            Settings
          </button>
        </nav>
      </aside>
    </>
  )
}
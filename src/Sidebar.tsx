import { useEffect, useState } from 'react'
import { ChevronRightIcon, ChevronDownIcon, FolderIcon } from '@heroicons/react/24/outline'
import { listYearMonthTree, type YearFolder } from './gdrive/googleDriveService'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  accessToken: string | null
  ksefFolderId: string | null
  selectedFolderId: string | null
  onSelectFolder: (folderId: string) => void
}

export function Sidebar({ isOpen, onClose, accessToken, ksefFolderId, selectedFolderId, onSelectFolder }: SidebarProps) {
  const [years, setYears] = useState<YearFolder[]>([])
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!accessToken || !ksefFolderId) return

    let cancelled = false
    listYearMonthTree(accessToken, ksefFolderId)
      .then((tree) => {
        if (cancelled) return
        setYears(tree)
        setExpandedYears((prev) => (prev.size > 0 ? prev : new Set(tree.length > 0 ? [tree[0].id] : [])))
      })
      .catch((error) => console.error('Failed to load folder tree:', error))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, ksefFolderId])

  const toggleYear = (yearId: string) => {
    setExpandedYears((prev) => {
      const next = new Set(prev)
      if (next.has(yearId)) {
        next.delete(yearId)
      } else {
        next.add(yearId)
      }
      return next
    })
  }

  const handleSelectMonth = (monthId: string) => {
    onSelectFolder(monthId)
    onClose()
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed lg:static left-0 top-16 bottom-0 w-64 bg-white border-r border-gray-200 z-40 transform transition-transform duration-300 overflow-y-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <nav>
          {loading && years.length === 0 ? (
            <p className="text-sm text-gray-400 px-4 py-3">Loading folders...</p>
          ) : years.length === 0 ? (
            <p className="text-sm text-gray-400 px-4 py-3">No folders yet</p>
          ) : (
            <ul>
              {years.map((year) => {
                const expanded = expandedYears.has(year.id)
                return (
                  <li key={year.id}>
                    <button
                      type="button"
                      onClick={() => toggleYear(year.id)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
                    >
                      {expanded ? (
                        <ChevronDownIcon className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <ChevronRightIcon className="w-4 h-4 flex-shrink-0" />
                      )}
                      <FolderIcon className="w-4 h-4 flex-shrink-0 text-blue-600" />
                      <span>{year.name}</span>
                    </button>
                    {expanded && (
                      <ul>
                        {year.months.map((month) => (
                          <li key={month.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectMonth(month.id)}
                              className={`w-full text-left pl-10 pr-4 py-2 text-sm transition-colors ${
                                selectedFolderId === month.id
                                  ? 'bg-blue-50 text-blue-700 font-medium'
                                  : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {month.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </nav>
      </aside>
    </>
  )
}

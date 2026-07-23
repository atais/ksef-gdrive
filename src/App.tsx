import { useState, useEffect, useCallback } from 'react'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'
import axios from 'axios'
import { ArrowPathIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { KsefCredentialsForm } from './KsefCredentialsForm'
import { Invoices } from './Invoices'
import {
  ensureKsefFolder,
  ensureConfigFolder,
  saveJsonToConfig,
  fetchJsonFromConfig,
  deleteJsonFromConfig,
  ensureYearFolders,
  listMonthCategories,
  type CategorySection
} from './gdrive/googleDriveService'
import { authenticateWithKsef, type KsefCredentials } from './ksef/ksefService'

interface StoredSession {
  accessToken: string
  user: { email: string; name: string }
  configFolderId: string
  ksefCredentials: KsefCredentials | null
}

function AppContent() {
  const [user, setUser] = useState<{ email: string; name: string } | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [configFolderId, setConfigFolderId] = useState<string | null>(null)
  const [ksefCredentials, setKsefCredentials] = useState<KsefCredentials | null>(null)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [ksefSessionToken, setKsefSessionToken] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<'settings' | 'invoices' | 'files'>('invoices')
  const [ksefFolderId, setKsefFolderId] = useState<string | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [categorySections, setCategorySections] = useState<CategorySection[]>([])
  const [driveSyncCount, setDriveSyncCount] = useState(0)

  // Runs a Drive task in the background without blocking the caller, while
  // tracking it so the navbar can show a "syncing" indicator. Used for work
  // (like ensuring all 12 month folders exist) that shouldn't stall the rest
  // of app init/login.
  const runInBackground = useCallback((task: () => Promise<unknown>) => {
    setDriveSyncCount((c) => c + 1)
    task()
      .catch((error) => console.error('Background Drive sync failed:', error))
      .finally(() => setDriveSyncCount((c) => c - 1))
  }, [])

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const stored = localStorage.getItem('gdrive_session')
        if (!stored) {
          setRestoring(false)
          return
        }

        const session: StoredSession = JSON.parse(stored)
        
        // Verify token still valid
        const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        })

        if (response.status === 200) {
          setAccessToken(session.accessToken)
          setUser(session.user)
          setConfigFolderId(session.configFolderId)
          setKsefCredentials(session.ksefCredentials)

          // Re-resolve the ksef-gdrive folder id (idempotent lookup) so features
          // like saving invoices to Drive work after a session restore.
          const folderResult = await ensureKsefFolder(session.accessToken)
          setKsefFolderId(folderResult.folderId)

          if (folderResult.folderId) {
            const folderId = folderResult.folderId
            runInBackground(() => ensureYearFolders(session.accessToken, folderId))
          }

        } else {
          localStorage.removeItem('gdrive_session')
        }
      } catch (error) {
        console.error('Session restore failed:', error)
        localStorage.removeItem('gdrive_session')
      } finally {
        setRestoring(false)
      }
    }

    restoreSession()
  }, [runInBackground])

  const saveSession = (
    token: string,
    userData: { email: string; name: string },
    configId: string,
    ksefCreds: KsefCredentials | null
  ) => {
    const session: StoredSession = {
      accessToken: token,
      user: userData,
      configFolderId: configId,
      ksefCredentials: ksefCreds,
    }
    localStorage.setItem('gdrive_session', JSON.stringify(session))
  }

  const login = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      try {
        setAccessToken(codeResponse.access_token)

        // Get user info
        const userInfo = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${codeResponse.access_token}` },
        })

        const userData = {
          email: userInfo.data.email,
          name: userInfo.data.name,
        }
        setUser(userData)

        // Initialize ksef-gdrive folder
        const result = await ensureKsefFolder(codeResponse.access_token)
        setKsefFolderId(result.folderId)

        if (result.folderId) {
          // Ensure all 12 month folders exist, without blocking the rest of
          // init on 12 sequential Drive round-trips.
          const folderId = result.folderId
          runInBackground(() => ensureYearFolders(codeResponse.access_token, folderId))

          // Ensure .config folder exists
          const configId = await ensureConfigFolder(codeResponse.access_token, result.folderId)
          setConfigFolderId(configId)
          
          // Check for existing KSEF credentials
          const credentials = await fetchJsonFromConfig<KsefCredentials>(
            codeResponse.access_token,
            configId,
            'ksef_credentials.json'
          )
          setKsefCredentials(credentials)

          // Save session to localStorage
          saveSession(codeResponse.access_token, userData, configId, credentials)
        }
      } catch (error) {
        console.error('Login/init failed:', error)
      }
    },
    scope: 'https://www.googleapis.com/auth/drive.file',
    flow: 'implicit',
  })

  const refreshFiles = useCallback(async () => {
    if (!accessToken || !selectedFolderId) return
    setLoading(true)
    try {
      const sections = await listMonthCategories(accessToken, selectedFolderId)
      setCategorySections(sections)
    } catch (error) {
      console.error('Failed to refresh files:', error)
    } finally {
      setLoading(false)
    }
  }, [accessToken, selectedFolderId])

  useEffect(() => {
    if (currentView !== 'files' || !selectedFolderId || !accessToken) return

    let cancelled = false
    listMonthCategories(accessToken, selectedFolderId)
      .then((sections) => {
        if (!cancelled) setCategorySections(sections)
      })
      .catch((error) => console.error('Failed to refresh files:', error))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId])

  const handleLogout = () => {
    localStorage.removeItem('gdrive_session')
    setUser(null)
    setAccessToken(null)
    setCategorySections([])
    setConfigFolderId(null)
    setKsefCredentials(null)
    setKsefFolderId(null)
  }

  const handleSaveKsefCredentials = async (credentials: KsefCredentials) => {
    if (!accessToken || !configFolderId || !user) {
      throw new Error('Not connected to Google Drive')
    }

    setSaving(true)
    try {
      await saveJsonToConfig(accessToken, configFolderId, 'ksef_credentials.json', credentials)
      setKsefCredentials(credentials)

      // Update stored session
      saveSession(accessToken, user, configFolderId, credentials)
      
      // Auth with KSEF immediately
      await authenticateKsefSession(credentials)
      
      // Go back to invoices view
      setCurrentView('invoices')
    } catch (error) {
      console.error('Save credentials failed:', error)
      throw error
    } finally {
      setSaving(false)
    }
  }

  const authenticateKsefSession = useCallback(async (credentials: KsefCredentials) => {
    try {
      const authResponse = await authenticateWithKsef(credentials)
      setKsefSessionToken(authResponse.accessToken.token)
    } catch (error) {
      console.error('KSEF auth failed:', error)

      const errorMessage = error instanceof Error ? error.message : String(error)

      // Check if it's a permission error
      if (errorMessage.includes('403') && errorMessage.includes('missing-permissions')) {
        // Don't delete credentials - user needs to update permissions
      } else if (errorMessage.includes('401') || errorMessage.includes('KSEF auth failed')) {
        // Authentication failed - invalid credentials

        // Delete invalid credentials from GDrive
        if (accessToken && configFolderId) {
          try {
            await deleteJsonFromConfig(accessToken, configFolderId, 'ksef_credentials.json')
          } catch (deleteError) {
            console.error('Failed to delete credentials:', deleteError)
          }
        }

        // Clear local state
        setKsefCredentials(null)
        setKsefSessionToken(null)

        // Update stored session
        if (user && accessToken && configFolderId) {
          saveSession(accessToken, user, configFolderId, null)
        }
      }
    }
  }, [accessToken, configFolderId, user])

  useEffect(() => {
    if (ksefCredentials && !ksefSessionToken) {
      authenticateKsefSession(ksefCredentials)
    }
  }, [ksefCredentials, ksefSessionToken, authenticateKsefSession])

  return (
    <div className="w-full min-h-screen flex flex-col bg-white">
      {user && (
        <Header
          user={user}
          onLogout={handleLogout}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          isConnected={!!(ksefCredentials && ksefSessionToken)}
          driveSyncing={driveSyncCount > 0}
          currentView={currentView}
          onNavigate={(view) => setCurrentView(view as 'settings' | 'invoices' | 'files')}
        />
      )}
      <div className="flex flex-1">
        {user && (
          <Sidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            accessToken={accessToken}
            ksefFolderId={ksefFolderId}
            selectedFolderId={selectedFolderId}
            onSelectFolder={(folderId) => {
              setSelectedFolderId(folderId)
              setCurrentView('files')
            }}
          />
        )}
        <main className="flex-1 overflow-auto bg-white">
          <div className="w-full">
            {restoring ? (
              <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
                <div className="text-center">
                  <ArrowPathIcon className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                  <p className="text-gray-600">Restoring session...</p>
                </div>
              </div>
            ) : !user ? (
              <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-20">
                <div className="text-center max-w-2xl">
                  <div className="mb-8">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center mx-auto mb-6">
                      <span className="text-white font-bold text-4xl">K</span>
                    </div>
                    <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-4 tracking-tight">
                      KSEF
                    </h1>
                    <p className="text-xl text-gray-600 mb-2">
                      Google Drive Integration
                    </p>
                    <p className="text-gray-500">
                      Seamlessly manage your documents and files
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => login()}
                    className="inline-flex items-center justify-center px-8 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all hover:shadow-lg hover:shadow-blue-600/30"
                  >
                    Sign in with Google
                  </button>
                </div>
              </div>
            ) : currentView === 'settings' ? (
              <div className="min-h-[calc(100vh-64px)] p-4 sm:p-8">
                <div>
                  <KsefCredentialsForm
                    currentCredentials={ksefCredentials}
                    onSave={handleSaveKsefCredentials}
                    saving={saving}
                  />
                </div>
              </div>
            ) : !ksefCredentials ? (
              <div className="p-4 sm:p-8">
                <KsefCredentialsForm
                  onSave={handleSaveKsefCredentials}
                  saving={saving}
                />
              </div>
            ) : currentView === 'files' ? (
              <div className="min-h-[calc(100vh-64px)] p-4 sm:p-8">
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <h2 className="text-3xl font-bold text-gray-900">Files</h2>
                    <button
                      type="button"
                      onClick={refreshFiles}
                      disabled={loading}
                      className="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-all hover:shadow-lg hover:shadow-blue-600/30"
                    >
                      {loading ? (
                        <>
                          <ArrowPathIcon className="w-5 h-5 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <ArrowPathIcon className="w-5 h-5 mr-2" />
                          Refresh Files
                        </>
                      )}
                    </button>
                  </div>

                  {!selectedFolderId ? (
                    <div className="text-center py-12">
                      <DocumentTextIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 font-medium">Pick a month</p>
                      <p className="text-gray-500 text-sm">Select a month in the sidebar to see its files</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {categorySections.map((section) => (
                        <div
                          key={section.key}
                          className="bg-white rounded-xl border border-gray-200 p-8"
                        >
                          <h3 className="text-2xl font-bold text-gray-900 mb-6">
                            {section.title}
                          </h3>
                          {section.files.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {section.files.map((file) => (
                                <div
                                  key={file.id}
                                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-400 transition-all hover:shadow-md"
                                >
                                  <DocumentTextIcon className="w-6 h-6 text-blue-600 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {file.name}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">No files</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="min-h-[calc(100vh-64px)] p-4 sm:p-8">
                <div className="space-y-6">
                  {ksefSessionToken ? (
                    <Invoices
                      sessionToken={ksefSessionToken}
                      accessToken={accessToken}
                      ksefFolderId={ksefFolderId}
                      userNip={ksefCredentials.nip}
                    />
                  ) : (
                    <p className="text-gray-600">Connecting to KSEF...</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function App() {
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE'

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppContent />
    </GoogleOAuthProvider>
  )
}

export default App
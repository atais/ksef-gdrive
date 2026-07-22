import { useState, useEffect } from 'react'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'
import axios from 'axios'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { KsefSetup } from './KsefSetup'
import { Settings } from './Settings'
import { EntityRolesStatus } from './EntityRolesStatus'
import { Invoices } from './Invoices'
import { 
  ensureKsefFolder, 
  listDriveFiles, 
  ensureConfigFolder,
  saveJsonToConfig,
  fetchJsonFromConfig,
  deleteJsonFromConfig
} from './gdrive/googleDriveService'
import { authenticateWithKsef, queryEntityRoles, type KsefCredentials, type KsefEntityRole } from './ksef/ksefService'

interface StoredSession {
  accessToken: string
  user: { email: string; name: string }
  configFolderId: string
  ksefCredentials: KsefCredentials | null
}

function AppContent() {
  const [user, setUser] = useState<{ email: string; name: string } | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [folderStatus, setFolderStatus] = useState<string>('')
  const [files, setFiles] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [configFolderId, setConfigFolderId] = useState<string | null>(null)
  const [ksefCredentials, setKsefCredentials] = useState<KsefCredentials | null>(null)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [ksefSessionToken, setKsefSessionToken] = useState<string | null>(null)
  const [entityRoles, setEntityRoles] = useState<KsefEntityRole[]>([])
  const [loadingRoles, setLoadingRoles] = useState(false)
  const [currentView, setCurrentView] = useState<'main' | 'settings' | 'invoices'>('main')
  const [ksefFolderId, setKsefFolderId] = useState<string | null>(null)

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

          if (session.ksefCredentials) {
            setFolderStatus('Connected to Google Drive & KSEF')
          } else {
            setFolderStatus('Connected to Google Drive - Configure KSEF')
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
  }, [])

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
        setFolderStatus('Logging in...')
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
        setFolderStatus(result.message)
        setKsefFolderId(result.folderId)

        if (result.folderId) {
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
          
          if (credentials) {
            setFolderStatus('Connected to Google Drive & KSEF')
          } else {
            setFolderStatus('Connected to Google Drive - Configure KSEF')
          }

          // Save session to localStorage
          saveSession(codeResponse.access_token, userData, configId, credentials)

          const filesList = await listDriveFiles(codeResponse.access_token, result.folderId)
          setFiles(filesList)
        }
      } catch (error) {
        console.error('Login/init failed:', error)
        setFolderStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    },
    scope: 'https://www.googleapis.com/auth/drive.file',
    flow: 'implicit',
  })

  const refreshFiles = async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const filesList = await listDriveFiles(accessToken)
      setFiles(filesList)
    } catch (error) {
      console.error('Failed to refresh files:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('gdrive_session')
    setUser(null)
    setAccessToken(null)
    setFiles([])
    setFolderStatus('')
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
      setFolderStatus('KSEF credentials saved successfully')
      
      // Update stored session
      saveSession(accessToken, user, configFolderId, credentials)
      
      // Auth with KSEF immediately
      await authenticateAndFetchRoles(credentials)
      
      // Go back to main view
      setCurrentView('main')
    } catch (error) {
      console.error('Save credentials failed:', error)
      throw error
    } finally {
      setSaving(false)
    }
  }

  const authenticateAndFetchRoles = async (credentials: KsefCredentials) => {
    try {
      setLoadingRoles(true)
      const authResponse = await authenticateWithKsef(credentials)
      setKsefSessionToken(authResponse.accessToken.token)
      
      const result = await queryEntityRoles(authResponse.accessToken.token)
      setEntityRoles(result.roles)
      setFolderStatus('Connected to Google Drive & KSEF')
    } catch (error) {
      console.error('KSEF auth/fetch failed:', error)
      
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // Check if it's a permission error
      if (errorMessage.includes('403') && errorMessage.includes('missing-permissions')) {
        setFolderStatus('KSEF credentials missing required permission')
        // Don't delete credentials - user needs to update permissions
      } else if (errorMessage.includes('401') || errorMessage.includes('KSEF auth failed')) {
        // Authentication failed - invalid credentials
        setFolderStatus('KSEF authentication failed - credentials removed')
        
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
        setEntityRoles([])
        
        // Update stored session
        if (user && accessToken && configFolderId) {
          saveSession(accessToken, user, configFolderId, null)
        }
      } else {
        setFolderStatus('KSEF connection error - check configuration')
      }
    } finally {
      setLoadingRoles(false)
    }
  }

  const refreshRoles = async () => {
    if (!ksefSessionToken) return
    setLoadingRoles(true)
    try {
      const result = await queryEntityRoles(ksefSessionToken)
      setEntityRoles(result.roles)
    } catch (error) {
      console.error('Refresh roles failed:', error)
    } finally {
      setLoadingRoles(false)
    }
  }

  useEffect(() => {
    if (ksefCredentials && !ksefSessionToken) {
      authenticateAndFetchRoles(ksefCredentials)
    }
  }, [ksefCredentials])

  return (
    <div className="w-full min-h-screen flex flex-col bg-white dark:bg-slate-950">
      <Header
        user={user}
        onLogout={handleLogout}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />
      <div className="flex flex-1">
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)}
          onNavigate={(view) => setCurrentView(view as 'main' | 'settings')}
        />
        <main className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto w-full">
            {restoring ? (
              <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
                <div className="text-center">
                  <svg className="w-12 h-12 text-blue-600 dark:text-blue-400 animate-spin mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <p className="text-gray-600 dark:text-gray-400">Restoring session...</p>
                </div>
              </div>
            ) : !user ? (
              <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-20">
                <div className="text-center max-w-2xl">
                  <div className="mb-8">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center mx-auto mb-6">
                      <span className="text-white font-bold text-4xl">K</span>
                    </div>
                    <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
                      KSEF
                    </h1>
                    <p className="text-xl text-gray-600 dark:text-gray-300 mb-2">
                      Google Drive Integration
                    </p>
                    <p className="text-gray-500 dark:text-gray-400">
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
              <Settings
                currentCredentials={ksefCredentials}
                onSave={handleSaveKsefCredentials}
                onBack={() => setCurrentView('main')}
                saving={saving}
              />
            ) : !ksefCredentials ? (
              <KsefSetup onSave={handleSaveKsefCredentials} saving={saving} />
            ) : currentView === 'invoices' ? (
              <div className="min-h-[calc(100vh-64px)] p-4 sm:p-8">
                {ksefSessionToken ? (
                  <Invoices
                    sessionToken={ksefSessionToken}
                    accessToken={accessToken}
                    driveFolderId={ksefFolderId}
                  />
                ) : (
                  <p className="text-gray-600 dark:text-gray-400">Connecting to KSEF...</p>
                )}
              </div>
            ) : (
              <div className="min-h-[calc(100vh-64px)] p-4 sm:p-8">
                <div className="space-y-6">
                  {/* Status Card */}
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-xl border border-blue-200 dark:border-blue-800 p-8">
                    <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">STATUS</p>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                      {folderStatus || 'All systems ready'}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      KSEF NIP: {ksefCredentials.nip}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      type="button"
                      onClick={refreshFiles}
                      disabled={loading}
                      className="flex-1 inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-lg transition-all hover:shadow-lg hover:shadow-blue-600/30"
                    >
                      {loading ? (
                        <>
                          <svg className="w-5 h-5 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Loading...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Refresh Files
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentView('settings')}
                      className="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Settings
                    </button>
                  </div>

                  {/* KSEF Entity Roles Section */}
                  <EntityRolesStatus 
                    roles={entityRoles}
                    loading={loadingRoles}
                    onRefresh={refreshRoles}
                  />

                  {/* Files Grid */}
                  {files.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8">
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                        Files in ksef folder
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {files.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 transition-all hover:shadow-md"
                          >
                            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {file.name}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {files.length === 0 && !loading && (
                    <div className="text-center py-12">
                      <svg className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-gray-600 dark:text-gray-400 font-medium">No files yet</p>
                      <p className="text-gray-500 dark:text-gray-500 text-sm">Click "Refresh Files" to load files from your Google Drive</p>
                    </div>
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

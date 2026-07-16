import { useState } from 'react'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'
import axios from 'axios'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { ensureKsefFolder, listDriveFiles } from './googleDriveService'

function AppContent() {
  const [user, setUser] = useState<{ email: string; name: string } | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [folderStatus, setFolderStatus] = useState<string>('')
  const [files, setFiles] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const login = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      try {
        setFolderStatus('Logging in...')
        setAccessToken(codeResponse.access_token)

        // Get user info
        const userInfo = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${codeResponse.access_token}` },
        })

        setUser({
          email: userInfo.data.email,
          name: userInfo.data.name,
        })

        // Initialize ksef-gdrive folder
        const result = await ensureKsefFolder(codeResponse.access_token)
        setFolderStatus(result.message)

        if (result.folderId) {
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
    setUser(null)
    setAccessToken(null)
    setFiles([])
    setFolderStatus('')
  }

  return (
    <div className="w-full min-h-screen flex flex-col bg-white dark:bg-slate-950">
      <Header
        user={user}
        onLogout={handleLogout}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />
      <div className="flex flex-1">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto w-full">
            {!user ? (
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
            ) : (
              <div className="min-h-[calc(100vh-64px)] p-4 sm:p-8">
                <div className="space-y-6">
                  {/* Status Card */}
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-xl border border-blue-200 dark:border-blue-800 p-8">
                    <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">STATUS</p>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                      {folderStatus || 'All systems ready'}
                    </h2>
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
                  </div>

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

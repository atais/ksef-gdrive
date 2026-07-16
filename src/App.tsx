import { useState } from 'react'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'
import axios from 'axios'
import './App.css'
import { ensureKsefFolder, listDriveFiles } from './googleDriveService'

function AppContent() {
  const [user, setUser] = useState<{ email: string; name: string } | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [folderStatus, setFolderStatus] = useState<string>('')
  const [files, setFiles] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)

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

  return (
    <>
      <section id="center">
        {!user ? (
          <div>
            <h1>KSEF - Google Drive Integration</h1>
            <p>Sign in with your Google account to get started</p>
            <button
              type="button"
              className="counter"
              onClick={() => login()}
            >
              Login with Google
            </button>
          </div>
        ) : (
          <div>
            <h1>Welcome, {user.name}!</h1>
            <p>Email: {user.email}</p>
            <p className="status">{folderStatus}</p>

            <button
              type="button"
              className="counter"
              onClick={refreshFiles}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh Files'}
            </button>

            {files.length > 0 && (
              <div className="files-list">
                <h3>Files in ksef folder:</h3>
                <ul>
                  {files.map((file) => (
                    <li key={file.id}>{file.name}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              className="logout-btn"
              onClick={() => {
                setUser(null)
                setAccessToken(null)
                setFiles([])
                setFolderStatus('')
              }}
            >
              Logout
            </button>
          </div>
        )}
      </section>
    </>
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

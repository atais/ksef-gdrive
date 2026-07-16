const FOLDER_NAME = 'ksef-gdrive'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'

interface DriveFile {
  id: string
  name: string
}

interface EnsureFolderResult {
  folderId: string | null
  message: string
}

export async function ensureKsefFolder(accessToken: string): Promise<EnsureFolderResult> {
  try {
    // Search for existing ksef-gdrive folder in root
    const existing = await searchFolder(accessToken, FOLDER_NAME)

    if (existing) {
      return {
        folderId: existing.id,
        message: `Found existing 'ksef-gdrive' folder`,
      }
    }

    // Create new folder
    const created = await createFolder(accessToken, FOLDER_NAME)

    return {
      folderId: created.id,
      message: `Created new 'ksef-gdrive' folder`,
    }
  } catch (error) {
    return {
      folderId: null,
      message: `Error initializing folder: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

async function searchFolder(accessToken: string, folderName: string): Promise<DriveFile | null> {
  try {
    const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
    const response = await fetch(`${DRIVE_API}/files?q=${query}&spaces=drive&fields=files(id,name)&pageSize=1`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Drive API error: ${response.status}`)
    }

    const data = await response.json()
    return data.files && data.files.length > 0 ? data.files[0] : null
  } catch (error) {
    console.error('Search folder error:', error)
    throw error
  }
}

async function createFolder(accessToken: string, folderName: string): Promise<DriveFile> {
  try {
    const response = await fetch(`${DRIVE_API}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    })

    if (!response.ok) {
      throw new Error(`Drive API error: ${response.status}`)
    }

    const data = await response.json()
    return {
      id: data.id,
      name: data.name,
    }
  } catch (error) {
    console.error('Create folder error:', error)
    throw error
  }
}

export async function listDriveFiles(accessToken: string, folderId?: string): Promise<DriveFile[]> {
  try {
    let query = "trashed=false"
    
    if (folderId) {
      query += ` and '${folderId}' in parents`
    }

    const encodedQuery = encodeURIComponent(query)
    const response = await fetch(
      `${DRIVE_API}/files?q=${encodedQuery}&spaces=drive&fields=files(id,name)&pageSize=50`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Drive API error: ${response.status}`)
    }

    const data = await response.json()
    return data.files || []
  } catch (error) {
    console.error('List files error:', error)
    throw error
  }
}

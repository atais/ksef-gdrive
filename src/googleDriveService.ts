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

async function searchFolder(accessToken: string, folderName: string, parentId?: string): Promise<DriveFile | null> {
  try {
    let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    if (parentId) {
      query += ` and '${parentId}' in parents`
    }
    const encodedQuery = encodeURIComponent(query)
    const response = await fetch(`${DRIVE_API}/files?q=${encodedQuery}&spaces=drive&fields=files(id,name)&pageSize=1`, {
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

async function createFolder(accessToken: string, folderName: string, parentId?: string): Promise<DriveFile> {
  try {
    const metadata: { name: string; mimeType: string; parents?: string[] } = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }
    
    if (parentId) {
      metadata.parents = [parentId]
    }

    const response = await fetch(`${DRIVE_API}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
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

export async function ensureConfigFolder(accessToken: string, parentFolderId: string): Promise<string> {
  const existing = await searchFolder(accessToken, '.config', parentFolderId)
  if (existing) {
    return existing.id
  }
  const created = await createFolder(accessToken, '.config', parentFolderId)
  return created.id
}

export async function saveJsonToConfig(
  accessToken: string,
  configFolderId: string,
  filename: string,
  data: unknown
): Promise<void> {
  const jsonContent = JSON.stringify(data, null, 2)
  
  const existing = await searchFile(accessToken, filename, configFolderId)
  
  if (existing) {
    await updateFile(accessToken, existing.id, jsonContent)
  } else {
    await createFile(accessToken, filename, jsonContent, configFolderId)
  }
}

export async function deleteJsonFromConfig(
  accessToken: string,
  configFolderId: string,
  filename: string
): Promise<void> {
  const file = await searchFile(accessToken, filename, configFolderId)
  if (file) {
    await deleteFile(accessToken, file.id)
  }
}

export async function fetchJsonFromConfig<T>(
  accessToken: string,
  configFolderId: string,
  filename: string
): Promise<T | null> {
  try {
    const file = await searchFile(accessToken, filename, configFolderId)
    if (!file) {
      return null
    }
    
    const response = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    
    if (!response.ok) {
      throw new Error(`Drive API error: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('Fetch JSON error:', error)
    return null
  }
}

async function searchFile(accessToken: string, filename: string, parentId: string): Promise<DriveFile | null> {
  try {
    const query = encodeURIComponent(`name='${filename}' and '${parentId}' in parents and trashed=false`)
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
    console.error('Search file error:', error)
    throw error
  }
}

export async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const response = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Drive API error: ${response.status}`)
  }
}

async function createFile(accessToken: string, filename: string, content: string, parentId: string): Promise<void> {
  const metadata = {
    name: filename,
    parents: [parentId],
  }

  const boundary = '-------314159265358979323846'
  const delimiter = '\r\n--' + boundary + '\r\n'
  const closeDelim = '\r\n--' + boundary + '--'

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    content +
    closeDelim

  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Create file error:', error)
    throw new Error(`Drive API error: ${response.status}`)
  }
}

async function updateFile(accessToken: string, fileId: string, content: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: content,
  })

  if (!response.ok) {
    throw new Error(`Drive API error: ${response.status}`)
  }
}

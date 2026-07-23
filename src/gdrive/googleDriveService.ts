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
    const folder = await ensureFolder(accessToken, FOLDER_NAME)
    return {
      folderId: folder.id,
      message: `Using 'ksef-gdrive' folder`,
    }
  } catch (error) {
    return {
      folderId: null,
      message: `Error initializing folder: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

// Returns ALL folders matching name+parent, oldest first, so callers can
// detect and merge duplicates instead of picking one at random.
async function searchFolders(accessToken: string, folderName: string, parentId?: string): Promise<DriveFile[]> {
  try {
    let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    if (parentId) {
      query += ` and '${parentId}' in parents`
    }
    const encodedQuery = encodeURIComponent(query)
    const response = await fetch(
      `${DRIVE_API}/files?q=${encodedQuery}&spaces=drive&fields=files(id,name)&orderBy=createdTime&pageSize=100`,
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
    console.error('Search folder error:', error)
    throw error
  }
}

async function listChildren(accessToken: string, parentId: string): Promise<DriveFile[]> {
  const query = `'${parentId}' in parents and trashed=false`
  const encodedQuery = encodeURIComponent(query)
  const response = await fetch(`${DRIVE_API}/files?q=${encodedQuery}&spaces=drive&fields=files(id,name)&pageSize=1000`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Drive API error: ${response.status}`)
  }

  const data = await response.json()
  return data.files || []
}

async function moveFile(accessToken: string, fileId: string, fromParentId: string, toParentId: string): Promise<void> {
  const response = await fetch(
    `${DRIVE_API}/files/${fileId}?addParents=${toParentId}&removeParents=${fromParentId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Drive API error: ${response.status}`)
  }
}

// Folds duplicate folders (same name+parent) into the oldest one: moves any
// files out of each duplicate, then deletes the now-empty duplicate.
async function mergeDuplicateFolders(accessToken: string, keepId: string, duplicates: DriveFile[]): Promise<void> {
  for (const duplicate of duplicates) {
    try {
      const children = await listChildren(accessToken, duplicate.id)
      for (const child of children) {
        await moveFile(accessToken, child.id, duplicate.id, keepId)
      }
      await deleteFile(accessToken, duplicate.id)
    } catch (error) {
      console.error(`Failed to merge duplicate folder ${duplicate.id}:`, error)
    }
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
  const folder = await ensureFolder(accessToken, '.config', parentFolderId)
  return folder.id
}

// In-flight lock keyed by parent+name so concurrent callers (e.g. React
// StrictMode double-invoking an effect) await the same search/create instead
// of racing each other into creating duplicate folders.
const ensureFolderLocks = new Map<string, Promise<DriveFile>>()

async function ensureFolder(accessToken: string, name: string, parentId?: string): Promise<DriveFile> {
  const key = `${parentId ?? 'root'}:${name}`
  const inFlight = ensureFolderLocks.get(key)
  if (inFlight) {
    return inFlight
  }

  const promise = (async () => {
    const matches = await searchFolders(accessToken, name, parentId)
    if (matches.length > 0) {
      const [keep, ...duplicates] = matches
      if (duplicates.length > 0) {
        await mergeDuplicateFolders(accessToken, keep.id, duplicates)
      }
      return keep
    }
    return createFolder(accessToken, name, parentId)
  })()

  ensureFolderLocks.set(key, promise)
  try {
    return await promise
  } finally {
    ensureFolderLocks.delete(key)
  }
}

// Category subfolders created inside every month folder. Sales invoices go to
// _Sprzedaz, cost invoices to _Koszty, bank statements to Wyciagi.
export const MONTH_CATEGORY_FOLDERS = ['_Sprzedaz', '_Koszty', 'Wyciagi'] as const

export type InvoiceCategoryFolder = '_Sprzedaz' | '_Koszty'

// Ensures <yyyy>/01.<yyyy> .. 12.<yyyy> all exist under ksef root for given
// date's year (defaults to now), plus the category subfolders (_Sprzedaz,
// _Koszty, Wyciagi) inside each month.
export async function ensureYearFolders(
  accessToken: string,
  ksefFolderId: string,
  date: Date = new Date()
): Promise<{ yearId: string; monthIds: string[] }> {
  const year = String(date.getFullYear())
  const yearFolder = await ensureFolder(accessToken, year, ksefFolderId)

  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
  const monthFolders = await Promise.all(
    months.map((month) => ensureFolder(accessToken, `${month}.${year}`, yearFolder.id))
  )

  await Promise.all(
    monthFolders.flatMap((monthFolder) =>
      MONTH_CATEGORY_FOLDERS.map((name) => ensureFolder(accessToken, name, monthFolder.id))
    )
  )

  return { yearId: yearFolder.id, monthIds: monthFolders.map((f) => f.id) }
}

// Resolves (creating if missing) a specific month's category subfolder, e.g.
// ksef/2026/03.2026/_Koszty, and returns its folder id.
export async function ensureMonthCategoryFolder(
  accessToken: string,
  ksefFolderId: string,
  year: string,
  month: string,
  category: InvoiceCategoryFolder
): Promise<string> {
  const yearFolder = await ensureFolder(accessToken, year, ksefFolderId)
  const monthFolder = await ensureFolder(accessToken, `${month}.${year}`, yearFolder.id)
  const categoryFolder = await ensureFolder(accessToken, category, monthFolder.id)
  return categoryFolder.id
}

export interface MonthFolder {
  id: string
  name: string
}

export interface YearFolder {
  id: string
  name: string
  months: MonthFolder[]
}

async function listSubfolders(accessToken: string, parentId: string): Promise<DriveFile[]> {
  const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const encodedQuery = encodeURIComponent(query)
  const response = await fetch(`${DRIVE_API}/files?q=${encodedQuery}&spaces=drive&fields=files(id,name)&pageSize=1000`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Drive API error: ${response.status}`)
  }

  const data = await response.json()
  return data.files || []
}

const YEAR_PATTERN = /^\d{4}$/
const MONTH_PATTERN = /^(\d{2})\.(\d{4})$/

// Builds the year/month folder tree for the sidebar, e.g.
// 2026/01.2026 .. 2026/12.2026. Years sorted descending, months ascending.
export async function listYearMonthTree(accessToken: string, ksefFolderId: string): Promise<YearFolder[]> {
  const topFolders = await listSubfolders(accessToken, ksefFolderId)
  const yearFolders = topFolders.filter((f) => YEAR_PATTERN.test(f.name))

  const years = await Promise.all(
    yearFolders.map(async (yearFolder) => {
      const monthFolders = await listSubfolders(accessToken, yearFolder.id)
      const months = monthFolders
        .filter((f) => MONTH_PATTERN.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name))

      return { id: yearFolder.id, name: yearFolder.name, months }
    })
  )

  return years.sort((a, b) => b.name.localeCompare(a.name))
}

async function listFilesOnly(accessToken: string, parentId: string): Promise<DriveFile[]> {
  const query = `'${parentId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed=false`
  const encodedQuery = encodeURIComponent(query)
  const response = await fetch(`${DRIVE_API}/files?q=${encodedQuery}&spaces=drive&fields=files(id,name)&pageSize=1000`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Drive API error: ${response.status}`)
  }

  const data = await response.json()
  return data.files || []
}

export interface CategorySection {
  key: string
  title: string
  files: DriveFile[]
}

const CATEGORY_TITLES: Record<string, string> = {
  _Sprzedaz: 'Sprzedaż',
  _Koszty: 'Koszty',
  Wyciagi: 'Wyciągi',
}

// Lists the files inside each category subfolder of a month folder, returned in
// display order (Sprzedaz, Koszty, Wyciagi). Missing subfolders yield an empty
// section rather than being dropped.
export async function listMonthCategories(
  accessToken: string,
  monthFolderId: string
): Promise<CategorySection[]> {
  const subfolders = await listSubfolders(accessToken, monthFolderId)
  const byName = new Map(subfolders.map((f) => [f.name, f]))

  return Promise.all(
    MONTH_CATEGORY_FOLDERS.map(async (name) => {
      const folder = byName.get(name)
      const files = folder ? await listFilesOnly(accessToken, folder.id) : []
      return { key: name, title: CATEGORY_TITLES[name] ?? name, files }
    })
  )
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

// Saves an arbitrary text file (e.g. invoice XML) into the given Drive folder,
// overwriting an existing file with the same name if present.
export async function saveTextFileToFolder(
  accessToken: string,
  folderId: string,
  filename: string,
  content: string,
  mimeType: string
): Promise<void> {
  const existing = await searchFile(accessToken, filename, folderId)

  if (existing) {
    await updateFile(accessToken, existing.id, content, mimeType)
  } else {
    await createFile(accessToken, filename, content, folderId, mimeType)
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

async function createFile(
  accessToken: string,
  filename: string,
  content: string,
  parentId: string,
  mimeType: string = 'application/json'
): Promise<void> {
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
    `Content-Type: ${mimeType}\r\n\r\n` +
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

async function updateFile(
  accessToken: string,
  fileId: string,
  content: string,
  mimeType: string = 'application/json'
): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mimeType,
    },
    body: content,
  })

  if (!response.ok) {
    throw new Error(`Drive API error: ${response.status}`)
  }
}

# Project: ksef-gdrive

A React app integrating KSeF (Polish e-invoicing system) with Google Drive.

## Stack
- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS v3** (via PostCSS)
- No routing library — single-page app with sidebar navigation

## Project structure
- `src/ksef/` — KSeF API service
- `src/gdrive/` — Google Drive service
- `src/App.tsx` — main app shell
- `src/Settings.tsx`, `src/Sidebar.tsx`, `src/Header.tsx` — UI layout
- `src/Invoices.tsx`, `src/KsefSetup.tsx`, `src/EntityRolesStatus.tsx` — feature components

## Dev commands
```
npm run dev       # start dev server (Vite)
npm run build     # production build
npm run lint      # ESLint
npm run preview   # preview production build
```

## Environment
See `.env.example` for required environment variables.

## Notes
Talk like smart caveman. Same brain, fewer tokens.
Compress every model response to caveman-style prose. Drops articles, filler, pleasantries, and hedging. Keeps every technical detail, code block, error string, and symbol exact. Cuts 65% of output tokens (measured) with full accuracy preserved. Mode persists for the whole session until changed or stopped.
Default. Drop articles, fragments OK, short synonyms.

You are using CLINE plugin in IntellJ to access the project.
You are Claude model.

Known issues you should address during your work:
- The tools use XML tags directly, not `<tool_use>` wrapper.
- calls fail due to response truncation when writing large files. Write one file at a time, keep each response to a single tool call.
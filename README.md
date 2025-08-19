# Airtable: Incremental CSV (Userscript)

Append each screenful of an Airtable grid to a local buffer, then save or copy the combined CSV. Designed for virtualized, div-based grids. Bypasses Airtable’s copy lock by not using the page’s copy handlers.

## Install
1. Install Tampermonkey (Chrome/Brave/Edge/Firefox).
2. Open the raw script file [`airtable-incremental-csv.user.js`](https://github.com/TurboKach/airtable-incremental-csv/raw/refs/heads/master/airtable-incremental-csv.user.js) in this repo and click **Install**.

## Usage
- Scroll to a screen of rows you want included.
- **Append**: click the “Append” button the script adds, or press **Ctrl/Cmd+Shift+A**.
- Repeat as you page through the table.
- **Save CSV**: button or **Ctrl/Cmd+Shift+S**.
- **Copy CSV**: button or **Ctrl/Cmd+Shift+C**.
- **Clear buffer**: button or **Ctrl/Cmd+Shift+X**.

The buffer is stored in `localStorage` and merges by `data-rowid`. It unions columns you’ve exposed across screens and deduplicates rows.

## What it captures
- Only **visible rows** and **visible columns** on each append.
- Multi-select tokens are joined by `;`.
- Column order follows Airtable’s header order.

## Limitations
- Hidden columns are not captured; reveal them before appending.
- You must scroll through all rows you want included (the script does not auto-scroll).
- Selectors target Airtable’s current grid DOM. If Airtable changes classes, update:
  - Header: `.gridHeaderCellPhosphorIcons[data-columnid]`
  - Row: `.dataRow[data-rowid]`
  - Cell: `div[data-columnid]` (direct children of a row)

## Files
- [`airtable-incremental-csv.user.js`](https://github.com/TurboKach/airtable-incremental-csv/raw/refs/heads/master/airtable-incremental-csv.user.js) — the userscript.

## License
MIT

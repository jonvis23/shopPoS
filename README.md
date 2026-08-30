# Duka POS — Cereal Edition

Offline-first desktop POS system for a Kenyan cereal retail and wholesale shop.

This project is designed to work fully on a single local machine without internet access, cloud services, or remote servers. All sales, stock, users, settings, and backups are stored in a local SQLite database.

## Overview

Duka POS helps a cereal shop manage:

- sales by weight
- stock receipts and inventory movement
- customer debt and repayments
- daily shift accounting and cash reconciliation
- expenses and domestic consumption
- user PIN-based access and admin controls
- receipt printing and backups

## Key Features

### Sales and checkout
- Sell products by weight and quantity
- Support both retail and wholesale pricing
- Accept cash and M-Pesa payments
- Print sales receipts on a configured printer
- Manage a live cart before checkout

### Inventory management
- Add and categorize products
- Track stock levels and product pricing
- Record stock restocking events
- View stock movement and history
- Manage domestic consumption separately from sales

### Customers and credit
- Record customer debts
- Record debt repayments
- Track balances and customer transaction history

### Shift and accounting
- Open and close shop shifts
- Record cash float and expected takings
- Reconcile cash and M-Pesa totals
- Generate Z-reports and end-of-day summaries
- Track expenses and deductions

### Safety and reliability
- Works fully offline
- Stores data in a local SQLite database
- Creates automatic backups
- Supports practice mode for safe demo/training use
- Keeps backup files for restore and recovery

## Tech Stack

- Electron
- React 19
- TypeScript
- Tailwind CSS
- SQLite (Node built-in SQLite)

## Project Structure

```text
src/
  main/          # Electron main process, DB logic, backup and print handlers
  preload/      # Secure bridge between renderer and main process
  renderer/     # User interface
  shared/       # Common contract and shared logic
build/          # Build support files
release/        # Distribution output / installer artifacts
out/            # Generated output from the build process
```

## Installation

1. Install dependencies:

```bash
npm install
```

2. Start the app in development mode:

```bash
npm run dev
```

3. Run TypeScript validation:

```bash
npm run typecheck
```

4. Build the app:

```bash
npm run build
```

5. Produce a Windows installer:

```bash
npm run dist
```

## Important Notes

- The app is designed to work without internet, cloud access, or remote hosting.
- All data is stored locally in a SQLite file under the app user data directory.
- Practice mode uses a separate database file instead of a flag column in the main database.
- The app keeps backups automatically during active shift operations.

## License

This project is for local business use and internal deployment. License details should be confirmed by the project owner before public or commercial redistribution.

## Repository Backup

This repository is intended to preserve a complete local project snapshot, including app source, build artifacts, and release output for backup and recovery purposes.

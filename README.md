# MCR Roofing CRM

This project is a local CRM dashboard for roofing operations.

## Run locally

```bash
npm install
npm start
```

Then open: http://localhost:3000

## PostgreSQL

For online or multi-user use, set `DATABASE_URL` to your PostgreSQL connection string before starting the app:

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/DATABASE"
npm start
```

The app creates its `crm_records` table automatically and imports existing records from `crm-data.json` the first time the database is empty. After migration, PostgreSQL is the source of truth. Set `PGSSL=disable` only for a local PostgreSQL server that does not use SSL.

## Login

Default local login:

- Username: `admin`
- Password: `the password`

Viewer login:

- Username: `viewer`
- Password: `view only`

Additional administrator:

- Username: `Anton`
- Password: `423martin`

Set `CRM_USERNAME` and `CRM_PASSWORD` before `npm start` to use different credentials.
Set `CRM_VIEWER_USERNAME` and `CRM_VIEWER_PASSWORD` to change the read-only login.

## Features

- Dashboard overview
- Leads management
- Jobs tracking
- Estimate management
- Customer list
- Reporting snapshot
- Date-range reports
- Single-user login with protected API routes
- PostgreSQL persistence with automatic first-run JSON import

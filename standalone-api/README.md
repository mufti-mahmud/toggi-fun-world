# Toggi Fun World - Standalone Ticket Sales REST API

Production-ready, lightweight, self-contained REST API for theme park ticket sales, turnstiles, and POS terminal synchronization.

---

## 🚀 Quick Start (Local / VM / Windows Server)

### 1. Requirements
- Node.js 16+ installed ([https://nodejs.org](https://nodejs.org))

### 2. Install & Start
```bash
cd standalone-api
npm install
npm start
```
The API is now running at `http://localhost:5000`!

---

## 🐳 Option A: Docker Deployment (Recommended for Cloud / Portainer)

### 1-Command Start:
```bash
docker-compose up -d
```
The API will be available on `http://localhost:5000` with data persisted to `./data`.

---

## 🪟 Option B: Windows Server / IIS Deployment

### Method 1: Run as a Native Windows Service (Using NSSM)
1. Download **NSSM** (Non-Sucking Service Manager) from [nssm.cc](https://nssm.cc/).
2. Run in administrative PowerShell / Command Prompt:
   ```cmd
   nssm install TfwTicketApi "C:\Program Files\nodejs\node.exe" "C:\path\to\standalone-api\server.js"
   nssm set TfwTicketApi AppDirectory "C:\path\to\standalone-api"
   nssm set TfwTicketApi AppEnvironmentExtra PORT=5000 API_KEY=tfw-full-access-key-2026
   nssm start TfwTicketApi
   ```
   The API will automatically boot on Windows system startup and auto-restart if interrupted!

### Method 2: Host via IIS (Reverse Proxy or iisnode)
1. In IIS Manager, create a new website pointing to a folder or configure **URL Rewrite + ARR** to reverse proxy `http://localhost:5000`.

---

## 🐧 Option C: Linux Server (Ubuntu / Debian / CentOS with PM2)
```bash
npm install -g pm2
pm2 start server.js --name "tfw-ticket-api"
pm2 save
pm2 startup
```

---

## 🔑 Authentication
Include the API key in the headers of your HTTP requests:
```text
x-api-key: tfw-full-access-key-2026
```
Or via Bearer token:
```text
Authorization: Bearer tfw-full-access-key-2026
```

---

## 🌐 Endpoints Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/ticket-sales/action` | **Master Universal Action Dispatcher** (Record, Set, Refund, Reset, Query) |
| `GET` | `/api/ticket-sales/full-access` | Complete administrative state dump |
| `GET` | `/api/ticket-sales` | Query sales breakdown by date (`?date=YYYY-MM-DD`) |
| `POST` | `/api/ticket-sales` | Record ticket sales (`counterId`, `count`) |
| `PUT` | `/api/ticket-sales/:date/:counterId` | Idempotent count update |
| `DELETE` | `/api/ticket-sales/:date/:counterId` | Reset counter to 0 |
| `POST` | `/api/ticket-sales/refund` | Void / refund tickets |
| `POST` | `/api/ticket-sales/batch` | Batch sales across multiple counters |
| `POST` | `/api/ticket-sales/bulk-replace` | Overwrite daily sales matrix |
| `POST` | `/api/ticket-sales/reconcile` | Reconcile turnstile sensor readings |
| `GET` | `/api/ticket-sales/counters` | List counters with pricing & live counts |
| `GET` | `/api/ticket-sales/history` | Audit log |
| `GET` | `/api/ticket-sales/export?format=csv` | Download `.csv` spreadsheet |
| `GET` | `/api/events` | Live SSE event stream for turnstiles & POS |

# QR Cafe Ordering Platform — MVP

Fast student-project implementation based on the supplied requirements.

## Stack
- Customer + Staff + Owner UI: React + Vite
- API: Node.js + Express
- Database: SQLite (`better-sqlite3`)
- Real-time updates: Socket.IO
- QR codes: `qrcode`
- Authentication: JWT + bcrypt

## What is implemented
- Customer check-in: name, phone, party size
- Table assignment / table selection
- Menu categories, search, dietary filter, modifiers
- Cart and order placement
- Payment screen with **demo payment** and Pay-at-Counter
- Customer live order status
- Staff login/dashboard: orders, bookings, sold-out toggle, table status
- Owner login/dashboard: menu CRUD, tables, staff account creation, reports
- Reception QR generation
- Pre-booking
- Session token tied to table
- SQLite persistence
- Socket.IO real-time order/status refresh

## Demo accounts
- Owner: `owner@qrcafe.local` / `owner123`
- Staff: `staff@qrcafe.local` / `staff123`

## Run
### 1. Server
```bash
cd server
npm install
npm run dev
```

### 2. Client
Open a second terminal:
```bash
cd client
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally:
`http://localhost:5173`

Staff:
`http://localhost:5173/staff`

Owner:
`http://localhost:5173/owner`

## Important
This is a demonstration/MVP implementation. Payment is simulated so the project can be demonstrated without a Razorpay/Cashfree merchant account. For a real deployment, replace the demo payment endpoint with a gateway and verify payment only from the provider webhook.

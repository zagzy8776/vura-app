# Vura - Digital Banking & Crypto

Vura is a modern digital banking solution that combines traditional banking features with cryptocurrency capabilities.

## Features

- **Virtual Accounts**: Create virtual NGN accounts via Monnify
- **Crypto Deposits**: Deposit USDT, BTC, ETH via Busha
- **Instant Transfers**: Send money to Vura tags or bank accounts
- **Virtual Cards**: Create and manage virtual cards
- **QR Payments**: Scan and pay via QR codes
- **Payment Requests**: Request money from other users

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn-ui
- **Backend**: NestJS + Prisma + PostgreSQL
- **Database**: Neon PostgreSQL
- **Hosting**: Vercel (frontend) + Render (backend)

## Getting Started

### Prerequisites

- Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)
- Git

### Installation

```sh
# Step 1: Clone the repository
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory
cd vura-app

# Step 3: Install dependencies
npm i

# Step 4: Start the development server
npm run dev
```

### Backend Setup

```sh
cd vura-backend
npm install
npx prisma generate
npm run start:dev
```

## Environment Variables

See deployment guides for required environment variables.

## Deployment

- **Frontend**: Deploy to Vercel
- **Backend**: Deploy to Render
- **Database**: Neon PostgreSQL

## License

Private - All rights reserved.

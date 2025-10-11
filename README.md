# Scaffolding Rental Management System

A comprehensive web application for managing scaffolding rental operations, built with React, Vite, and Firebase.

## Features

- **Dashboard**: Overview of active rentals, inventory values, and key metrics
- **Master Data Management**: Products, Warehouses, and Customers with sites
- **Inventory Operations**: Purchases, Transfers, Returns, and Sales tracking
- **Rental Management**: Create and track rental orders with fulfillment status
- **Real-time Reporting**: Inventory, rental, and transaction reports with CSV export
- **User Management**: Role-based access control (Admin, User, Viewer)
- **Real-time Updates**: Firebase Firestore for instant data synchronization

## Tech Stack

- **Frontend**: React 18, Ant Design 5
- **Build Tool**: Vite
- **Backend**: Firebase (Authentication, Firestore, Storage)
- **State Management**: React Context API
- **Real-time Data**: Firestore snapshots

## Project Structure

```
├── src/
│   ├── components/        # Reusable components (future)
│   ├── constants/         # Application constants
│   ├── context/           # React contexts (Auth)
│   ├── hooks/             # Custom hooks (useCollection, useInventory)
│   ├── pages/             # Page components
│   ├── services/          # Firebase configuration
│   ├── utils/             # Utility functions
│   ├── App.jsx            # Main app component
│   └── main.jsx           # Entry point
├── index.html
├── vite.config.js
└── package.json
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase project with Firestore enabled

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Update with your Firebase configuration

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser to `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## User Roles

- **Admin**: Full access to all features including user management
- **User**: Can view and create records (no settings access)
- **Viewer**: Read-only access to products, warehouses, customers, and reports

## Firebase Collections

- `users` - User profiles with roles
- `products` - Product catalog
- `warehouses` - Warehouse locations
- `customers` - Customer information with sites
- `purchases` - Purchase records
- `transfers` - Material transfers to customers
- `returns` - Material returns
- `sales` - Sales records
- `rentalOrders` - Rental order management
- `config` - Application configuration

## Key Features Explained

### Inventory Tracking
The system automatically calculates inventory levels:
- **Warehouse Stock** = Purchases - Transfers - Sales (from warehouse)
- **Customer Stock** = Transfers - Returns - Sales (from customer)

### Rental Order Fulfillment
Link transfers to rental orders to track delivery progress against ordered quantities.

### Real-time Updates
All data updates are reflected immediately across all connected clients using Firestore snapshots.

## Security

- Firebase Authentication for user login
- Role-based access control
- Firestore security rules (configure in Firebase Console)
- Environment variables for sensitive configuration

## License

Private - All rights reserved

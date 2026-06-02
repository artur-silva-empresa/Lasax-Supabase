# TexFlow - Textile Production Management

TexFlow is a comprehensive textile production management application designed for tracking orders through various stages of the manufacturing process. It provides real-time visibility into production status, bottleneck analysis, and production capacity planning.

## 🚀 Overview

The application serves as a bridge between ERP data and shop-floor production management. It allows users to import production data from Excel or SQLite, track progress through different sectors, manage delays, and analyze production capacity to identify potential bottlenecks.

## ✨ Key Features

- **Dashboard:** At-a-glance view of KPIs including active documents, late orders, weekly deliveries, and fulfillment rates.
- **Order Management:** Complete list of orders with advanced filtering, priority setting, and status tracking.
- **Sector-Specific Views:** Dedicated interfaces for different production stages:
    - Tecelagem (Weaving)
    - Felpo Cru (Grey Terry)
    - Tinturaria (Dyeing)
    - Confecção (Confection/Sewing)
    - Embalagem/Acabamento (Packing/Finishing)
    - Stock/Expedição (Stock/Shipping)
- **Timeline View:** Visual representation of orders over time.
- **Bottleneck Analysis:** Identifies production constraints based on configured capacities.
- **Production Capacity Planning:** Manage throughput rates (pieces/hour) for different article families and sectors.
- **Stop Reason Tracking:** Categorized reasons for production delays (Quality, Planning, Supply, etc.).
- **Data Persistence:** Uses IndexedDB for local storage, enabling offline capabilities.
- **Authentication & Permissions:** Role-based access control (Admin/Viewer) with granular permissions for each module and sector.
- **PWA Support:** Can be installed as a Progressive Web App for desktop/mobile use.

## 🛠 Technology Stack

- **Frontend:** [React](https://reactjs.org/) (with [Vite](https://vitejs.dev/))
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Charts:** [Recharts](https://recharts.org/)
- **Data Handling:**
    - [SheetJS (xlsx)](https://sheetjs.com/) for Excel import/export.
    - [sql.js](https://sql.js.org/) for SQLite database operations.
- **Persistence:** [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) for browser-side data storage.
- **Language:** [TypeScript](https://www.typescriptlang.org/)

## 📁 Project Structure

```text
├── components/          # React components for views and UI elements
│   ├── Dashboard.tsx    # KPIs and summary charts
│   ├── OrderTable.tsx   # Main order listing with filters
│   ├── SectorOrderTable.tsx # Specialized tables for production sectors
│   ├── BottleneckAnalysis.tsx # Production constraint visualization
│   └── ...              # Other functional components
├── services/
│   └── dataService.ts   # Core logic for DB, Excel/SQLite parsing, and KPIs
├── utils/
│   ├── capacityUtils.ts # Logic for calculating production lead times
│   └── formatters.ts    # Date and number formatting helpers
├── constants.ts         # Global constants (SECTORS, STOP_REASONS)
├── types.ts             # TypeScript interfaces and enums
├── App.tsx              # Main entry point and state management
├── index.tsx            # React DOM mounting
└── scripts/
    └── copy-wasm.mjs    # Script to copy sql-wasm.wasm to public directory
```

## ⚙️ Setup & Development

### Prerequisites

- Node.js (Latest LTS recommended)
- npm or yarn

### Installation

1.  **Clone the repository.**
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Environment Setup:** Create a `.env.local` file and add your Gemini API key if needed (for future AI features):
    ```env
    GEMINI_API_KEY=your_api_key_here
    ```
4.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    *Note: The `predev` script will automatically copy the `sql-wasm.wasm` file to the `public/` folder.*

### Building for Production

```bash
npm run build
```
The build artifacts will be in the `dist/` directory.

## 📊 Data Management

### Import/Export

The application supports two primary data formats:

1.  **ERP Excel Format:** Directly imports the standard production file from the company's ERP.
2.  **App Format (Excel/SQLite):** Exports data including application-specific fields (priorities, observations, stop reasons) for full round-trip capability.

### Round-trip Logic

When importing new data over existing data, TexFlow performs a merge:
- Existing orders are updated with new quantities/dates from the file.
- App-specific metadata (Priorities, Observations, Stop Reasons, Manual flags) is preserved for existing items.

### Local Persistence

All data is stored in the browser's IndexedDB. This ensures that:
- Data persists across page reloads.
- The app works offline.
- Data is private to the user's browser.

## 🚀 Deployment

The project is configured for deployment via GitHub Pages.

```bash
npm run deploy
```

This command runs the build process and uses the `gh-pages` package to push the `dist/` directory to the `gh-pages` branch.

## 🔐 Security & Permissions

- **Authentication:** Local authentication with password hashing (SHA-256 fallback).
- **Default Users:**
    - `Plan` (Admin): Full access to all features and configurations.
    - `Lasa` (Viewer): Read-only access to orders and timeline.
- **Granular Permissions:** Every user can be configured with specific `none`, `read`, or `write` permissions for individual sectors and modules.

## 📈 Technical Details

### Production Capacity Calculation

The application calculates lead times and bottlenecks by:
1.  Mapping orders to capacity rules based on `Article Code`, `Family`, or `Reference`.
2.  Calculating required hours based on `Quantity Requested` and `Pieces Per Hour`.
3.  Aggregating load per sector and comparing it against available `Hours Per Day`.

### Date Propagation

When a predicted date is changed in one sector, the application can optionally propagate that delay/advance to all subsequent sectors in the production chain, helping planners understand the downstream impact of delays.

## 🛠 Troubleshooting

- **Missing `sql-wasm.wasm`:** If you see errors related to the database engine, ensure you have run `npm install`. The `predev` and `prebuild` scripts handle copying the necessary WASM file from `node_modules` to the `public/` directory.
- **Data Not Saving:** Ensure your browser supports IndexedDB and that you are not in a Private/Incognito mode that restricts storage.
- **Import Failures:** Verify that the Excel file follows the expected ERP structure or the exported App structure. The app expects specific column layouts (e.g., Column B for Document Number in ERP format).
- **Theme Issues:** The application stores theme preferences in `localStorage`. If the UI looks inconsistent, try clearing the `texflow-theme` key in your browser's Developer Tools.

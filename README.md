# TicketHub - Ticketing System for Scaler School of TechThis is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).



A modern, full-stack ticketing system built for educational institutions. TicketHub streamlines support request management with role-based access control, real-time analytics, and comprehensive ticket tracking for students, wardens, committees, and administrative staff.## Getting Started



## 📋 Table of ContentsFirst, run the development server:



- [Features](#-features)```bash

- [Tech Stack](#-tech-stack)npm run dev

- [Project Structure](#-project-structure)

- [Installation](#-installation)# or

- [Environment Setup](#-environment-setup)pnpm dev

- [Database Setup](#-database-setup)# or

- [Running the Application](#-running-the-application)bun dev

- [API Documentation](#-api-documentation)```

- [User Roles & Permissions](#-user-roles--permissions)

- [Development Guidelines](#-development-guidelines)Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

- [Deployment](#-deployment)

- [Contributing](#-contributing)You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.



## ✨ FeaturesThis project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.



### Core Functionality## Learn More

- **Smart Ticket Management** - Create, assign, and track tickets with automatic categorization and priority routing

- **Role-Based Access Control (RBAC)** - 5-tier permission system for different user typesTo learn more about Next.js, take a look at the following resources:

- **Real-Time Notifications** - Email and push notifications for ticket updates

- **SLA Tracking** - Automatic monitoring with alerts for timely resolutions- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.

- **Real-Time Analytics** - Comprehensive dashboards and reports- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

- **Enterprise Security** - End-to-end encryption and audit logs

- **Mobile-Responsive Design** - Full functionality on mobile, tablet, and desktopYou can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!



### User Roles## Deploy on Vercel

- **Super Admin** - Full system access and configuration

- **Admin** - Department and user managementThe easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

- **Warden** - Hostel/residential area management

- **Committee** - Committee member operationsCheck out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

- **Student** - Create and track personal support tickets

## 🛠 Tech Stack

### Frontend
- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Utility-first styling
- **Lucide React** - Icon library

### Backend & Database
- **Drizzle ORM** - Type-safe SQL query builder
- **PostgreSQL** - Primary database (via Neon)
- **Neon Serverless** - Serverless Postgres connection
- **Zod** - Runtime schema validation

### Development Tools
- **ESLint** - Code quality
- **tsx** - TypeScript execution
- **pnpm** - Package manager

## 📁 Project Structure

```
ticketing-system/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── layout.tsx            # Root layout
│   │   └── globals.css           # Global styles
│   ├── components/
│   │   └── ui/                   # Reusable UI components
│   ├── conf/
│   │   └── config.ts             # Configuration management
│   ├── db/
│   │   ├── index.ts              # Database client
│   │   ├── schema.ts             # Drizzle schema definitions
│   │   └── migrate.ts            # Migration runner
│   ├── lib/
│   │   └── utils.ts              # Utility functions
│   └── types/
│       └── index.ts              # TypeScript type definitions
├── public/                        # Static assets
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
├── tailwind.config.js             # Tailwind configuration
├── drizzle.config.ts              # Drizzle ORM config
├── next.config.ts                 # Next.js configuration
├── eslint.config.mjs              # ESLint configuration
└── README.md                       # This file
```

## 📋 Database Schema

### Users Table
```sql
- id (PRIMARY KEY): Serial
- name: Text (required)
- age: Integer (required)
- email: Text (unique, required)
- role: Enum ['super_admin', 'admin', 'warden', 'committe', 'student'] (default: 'student')
```

### Posts Table (Tickets)
```sql
- id (PRIMARY KEY): Serial
- title: Text (required)
- content: Text (required)
- userId (FOREIGN KEY): Integer → users_table.id (ON DELETE CASCADE)
- createdAt: Timestamp (default: NOW())
- updatedAt: Timestamp (auto-updated)
```

## 📦 Prerequisites

Ensure you have the following installed:
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **pnpm** 9+ ([Installation Guide](https://pnpm.io/installation))
- **PostgreSQL** 14+ or **Neon Account** ([Create Free Account](https://neon.tech))
- **Git** ([Download](https://git-scm.com/))

## 🚀 Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd ticketing-system
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Verify Installation
```bash
pnpm --version
node --version
```

## 🔧 Environment Setup

### 1. Create Environment File
Create a `.env.local` file in the project root:

```bash
touch .env.local
```

### 2. Configure Environment Variables
Add the following to `.env.local`:

```env
# Database Configuration (Neon PostgreSQL)
DATABASE_URL=postgresql://username:password@region.neon.tech/database_name

# Optional: Add more configuration as needed
NODE_ENV=development
```

### 3. Get Your Database URL
If using **Neon**:
1. Sign up at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string from the dashboard
4. Paste it as `DATABASE_URL` in `.env.local`

## 🗄 Database Setup

### 1. Generate Drizzle Migrations
```bash
pnpm exec drizzle-kit generate
```

### 2. Run Migrations
```bash
pnpm exec drizzle-kit migrate
```

### 3. Verify Database Connection
```bash
pnpm exec tsx src/db/migrate.ts
```

**Note:** If migrations fail, ensure:
- `DATABASE_URL` is correctly set in `.env.local`
- PostgreSQL service is running
- Network connectivity to database is available

## 🎯 Running the Application

### Development Mode
```bash
pnpm dev
```
The application will be available at [http://localhost:3000](http://localhost:3000)

### Production Build
```bash
pnpm build
pnpm start
```

### Linting
```bash
pnpm lint
```

## 📡 API Documentation

### Database Client Export

The database client is centralized in `src/db/index.ts`:

```typescript
import { db } from '@/db';
import { usersTable, postsTable } from '@/db/schema';

// Example query
const users = await db.select().from(usersTable).all();
```

### Schema Exports

All schema types are exported from `src/db/schema.ts`:

```typescript
import {
  usersTable,
  postsTable,
  InsertUser,
  SelectUser,
  InsertPost,
  SelectPost,
  roleEnum,
  userCreateSchema,
  userResponseSchema,
  UserCreateInput,
  UserResponse,
} from '@/db/schema';
```

### Zod Validation

Validate user input using exported Zod schemas:

```typescript
import { userCreateSchema } from '@/db/schema';

const newUser = userCreateSchema.parse({
  name: 'John Doe',
  age: 20,
  email: 'john@example.com',
  role: 'student',
});
```

## 👥 User Roles & Permissions

| Role | Permissions | Access Level |
|------|-----------|---|
| **Super Admin** | Full system access, user management, system configuration | System-wide |
| **Admin** | Department management, user approval, ticket assignment | Department-level |
| **Warden** | Hostel management, resident tracking, issue resolution | Hostel-level |
| **Committee** | Committee operations, event management, approvals | Committee-level |
| **Student** | Create tickets, view personal tickets, community access | Personal + Community |

## 🔨 Development Guidelines

### File Naming Conventions
- Components: `PascalCase` (e.g., `TicketCard.tsx`)
- Utilities: `camelCase` (e.g., `getTicketStatus.ts`)
- Styles: `kebab-case` (e.g., `ticket-card.css`)

### Code Style
- Use TypeScript for type safety
- Leverage Tailwind CSS for styling
- Use Zod schemas for validation
- Follow ESLint rules

### Creating New Pages
1. Create file in `src/app/`
2. Use `'use client'` for client components
3. Export default component
4. Add to layout navigation if needed

### Database Queries
1. Import from `src/db/schema`
2. Use Drizzle ORM methods
3. Always validate input with Zod
4. Handle errors appropriately

## 🚢 Deployment

### Deploy on Vercel (Recommended)

1. **Push to GitHub**
```bash
git push origin main
```

2. **Connect to Vercel**
   - Visit [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Select Next.js framework

3. **Configure Environment**
   - Add `DATABASE_URL` in Vercel project settings
   - Ensure PostgreSQL is accessible from Vercel

4. **Deploy**
   - Vercel will auto-build and deploy on push

### Alternative: Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

## 🤝 Contributing

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, documented code
   - Follow project conventions

3. **Commit with meaningful messages**
   ```bash
   git commit -m "feat: add new feature description"
   ```

4. **Push and create a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

## 📝 License

This project is developed for Scaler School of Tech. All rights reserved.

## 💬 Support & Feedback

For issues, feature requests, or feedback:
- Create an issue in the repository
- Contact the development team
- Check existing documentation

## 🔗 Useful Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Tailwind CSS Guide](https://tailwindcss.com/docs)
- [Zod Documentation](https://zod.dev)
- [Neon PostgreSQL Docs](https://neon.tech/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Last Updated:** December 4, 2024  
**Version:** 0.1.0  
**Status:** In Development

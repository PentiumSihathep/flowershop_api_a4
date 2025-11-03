# Flower Shop API – Technical Documentation

> **Environment:** Node.js + Express + Sequelize + SQLite (ready for MySQL/Postgres)  
> **Purpose:** Backend API for a flower shop – handles customers, staff, orders, reports, and inventory.  
  
  

---

## System Overview

| Component | Description |
|------------|--------------|
| **server.js** | Main entrypoint — initialises middleware, connects DB, mounts routes, bootstraps admin. |
| **models/** | Sequelize models defining Users, Flowers, Customers, Orders, and OrderItems. |
| **routes/** | Express routers handling business logic for each feature area. |
| **middleware/** | Auth guards, role-based access, and (optional) validators. |
| **logger.js** | Winston logger configuration (structured logging). |
| **config/config.js** | Loads environment variables for DB + JWT. |
| **.env** | Contains DB credentials, JWT secret, bootstrap admin credentials. |

---

## Core Features

| Feature | Description |
|----------|-------------|
| **Authentication** | JWT-based login system for customers, staff, and admins. |
| **User Roles** | `customer`, `staff`, `admin` — with specific access levels. |
| **Flower Management** | CRUD operations for inventory (staff/admin only). |
| **Customer Management** | View or deactivate customers (staff/admin only). |
| **Order System** | Customers can place orders; staff/admins can manage them. |
| **Reports** | Sales and stock summary reports (admin only). |
| **Logging** | Morgan + Winston structured logs for debugging and monitoring. |
| **Rate Limiting** | Prevents API abuse (default 200 requests / 15 min). |
| **Security** | Helmet, CORS, JWT, and safe transaction handling. |

---

## Boot Process

1. **Database Connection**
   - Sequelize connects to the configured database.
   - SQLite foreign keys are enabled (`PRAGMA foreign_keys=ON`).

2. **Bootstrap Admin**
   - If no admin exists, one is created automatically using env variables.

3. **Server Start**
   - Express server launches at the configured port (default `3002`).
   - All routes are mounted under `/api/v1`.

---

## Authentication & Authorisation

| Role | Permissions |
|------|--------------|
| **Customer** | View flowers, place orders, view own orders. |
| **Staff** | Manage flowers, view orders, customers, and inventory. |
| **Admin** | Full access — including staff creation and reports. |

---

## API Endpoints

Full details of endpoints, payloads, and expected responses are included in your working codebase and Postman collection.

---

## Suggested Postman Workflow

1. **Login as admin** – `POST /api/v1/auth/login`
2. **Create staff** – `POST /api/v1/staff`
3. **Create flowers** – `POST /api/v1/flowers`
4. **Register customer** – `POST /api/v1/auth/register`
5. **Place order** – `POST /api/v1/shop/orders`
6. **View orders** – `/api/v1/shop/orders` or `/api/v1/orders`
7. **Reports** – `/api/v1/reports/sales`

---

## License & Ownership

© 2025 Flower Shop API  
 
For educational use by **Flower Shop Team**.  

# 🎓 Digital Store Node.js Backend

![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)
![Sequelize](https://img.shields.io/badge/Sequelize-52B0E7?style=for-the-badge&logo=Sequelize&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

A robust, serverless Node.js backend system designed for an educational digital store. Originally migrated from PHP to a modern JavaScript stack to ensure high performance, scalability, and seamless integration with cloud infrastructure.

## 🚀 Features

- **Serverless Architecture**: Fully optimized for deployment on Vercel.
- **Cloud Database**: Integrated with Supabase (PostgreSQL) for reliable data storage.
- **Secure Authentication**: Custom Single Sign-On (SSO) integration using HMAC-SHA256 signatures for seamless cross-platform user login.
- **Role-Based Access Control (RBAC)**: Distinct permissions for `admin`, `doctor`, and `student` roles.
- **Payment Gateway Integration**: Mocked/Ready infrastructure for Paymob integration.
- **Dynamic Views**: Server-side rendering using EJS template engine.

## 🛠️ Tech Stack

- **Backend Framework**: Express.js
- **ORM**: Sequelize
- **Database**: PostgreSQL (hosted on Supabase)
- **Deployment**: Vercel Serverless Functions
- **Security**: bcrypt (password hashing), crypto (SSO signatures)
- **Templating**: EJS

## 📂 Project Structure

```text
├── controllers/       # Business logic for auth, admin, store, and payments
├── models/            # Sequelize ORM database models (User, Item, Purchase, Recharge)
├── routes/            # Express.js routing (web.js)
├── views/             # EJS templates (Admin Dashboard, Login, Store, etc.)
├── public/            # Static assets (CSS, JS, Images)
├── index.js           # Application entry point & Express configuration
├── seed.js            # Database seeding script for initial accounts
└── vercel.json        # Vercel deployment configuration
```

## 🔒 Security Highlights

1. **SQL Injection Prevention**: Completely mitigated through Sequelize ORM parameterized queries.
2. **SSO Protection**: Links are protected via `HMAC-SHA256` hashing and strict `timestamp` expiration (5-minute TTL).
3. **Environment Variables**: Sensitive data (DB URL, Secrets) are strictly loaded via `.env` and kept out of version control.

## 🔗 Single Sign-On (SSO) Integration

This backend accepts secure, stateless SSO requests from the main PHP/WordPress portal. 
When a user clicks "Enter Portal" on the main site, a securely hashed payload containing their `user_id`, `name`, and `role` is sent to the `/sso` endpoint. The Node.js system automatically authenticates them, generates their account if it doesn't exist, and grants them access without requiring a password.

---
*Developed by Abdallah Elshamy*

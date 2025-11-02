// src/seed.js
// Seeds the Flower Shop database with an admin account and sample data.

const bcrypt = require('bcrypt');
const db = require('./models');

async function runSeed() {
  try {
    console.log('🌱 Seeding database...');
    await db.sequelize.sync({ alter: true }); // creates tables if not exist

    // ---------- 1. ADMIN ACCOUNT ----------
    const adminEmail = 'admin@flowershop.test';
    const adminExists = await db.User.findOne({ where: { email: adminEmail } });
    if (!adminExists) {
      const passwordHash = await bcrypt.hash('Admin123!', 11);
      await db.User.create({
        email: adminEmail,
        name: 'Admin',
        passwordHash,
        role: 'admin',
        isActive: true
      });
      console.log(`✅ Created admin user: ${adminEmail} / Admin123!`);
    } else {
      console.log(`ℹ️ Admin user already exists (${adminEmail})`);
    }

    // ---------- 2. STAFF ACCOUNT ----------
    const staffEmail = 'staff@flowershop.test';
    const staffExists = await db.User.findOne({ where: { email: staffEmail } });
    if (!staffExists) {
      const passwordHash = await bcrypt.hash('Staff123!', 11);
      await db.User.create({
        email: staffEmail,
        name: 'Flower Staff',
        passwordHash,
        role: 'staff',
        isActive: true
      });
      console.log(`✅ Created staff user: ${staffEmail} / Staff123!`);
    }

    // ---------- 3. SAMPLE CUSTOMERS ----------
    const customers = [
      { name: 'Jane Doe', email: 'jane@example.com', phone: '0400000000', address: '123 Collins St' },
      { name: 'John Smith', email: 'john@example.com', phone: '0400000001', address: '456 Bourke St' }
    ];

    for (const c of customers) {
      const exists = await db.Customer.findOne({ where: { email: c.email } });
      if (!exists) {
        await db.Customer.create(c);
        console.log(`✅ Added customer: ${c.name}`);
      }
    }

    // ---------- 4. SAMPLE FLOWERS ----------
    const flowers = [
      { name: 'Red Roses', description: 'A dozen red roses bouquet', price: 49.99, stock: 50, category: 'bouquet' },
      { name: 'Tulip Bunch', description: 'Mixed tulip arrangement', price: 39.95, stock: 30, category: 'arrangement' },
      { name: 'Orchid Pot', description: 'Elegant potted orchids', price: 59.90, stock: 15, category: 'plant' }
    ];

    for (const f of flowers) {
      const exists = await db.Flower.findOne({ where: { name: f.name } });
      if (!exists) {
        await db.Flower.create(f);
        console.log(`✅ Added flower: ${f.name}`);
      }
    }

    console.log('🌸 Seed completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

runSeed();
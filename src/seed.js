// scripts/seed.js
// Seed minimal data: 1 admin, 1 staff, 1 customer, flowers, and two demo orders.
// This file is used to create mock up data to the database for testing.
// To run this file use the command " npm run seed "

const db = require('../src/models');
const bcrypt = require('bcrypt');

async function hash(pw) {

  // return (await new db.User()).hashPassword(pw);
  const salt = await bcrypt.genSalt(11);
  return bcrypt.hash(pw, salt);
}

async function createUser({ name, email, role, password }) {
  const [u] = await db.User.findOrCreate({
    where: { email },
    defaults: {
      name,
      email,
      role,
      isActive: true,
      passwordHash: await hash(password),
    },
  });
  return u;
}

async function upsertCustomer({ name, email, phone, address }) {
  const [c] = await db.Customer.unscoped().findOrCreate({
    where: { email },
    defaults: { name, email, phone, address, isActive: true },
  });
  if (!c.isActive) await c.update({ isActive: true });
  return c;
}

async function ensureFlowers() {
  const data = [
    { name: 'Rose Red', description: 'Classic red roses', price: 9.9, stock: 80, category: 'Roses' },
    { name: 'Sunflower', description: 'Bright and bold', price: 7.5, stock: 60, category: 'Seasonal' },
    { name: 'Tulip Pink', description: 'Soft pink tulips', price: 6.0, stock: 70, category: 'Tulips' },
    { name: 'Baby’s Breath', description: 'Filler magic', price: 3.0, stock: 120, category: 'Filler' },
    { name: 'Lily White', description: 'Elegant lilies', price: 8.5, stock: 50, category: 'Lilies' },
    { name: 'Orchid Purple', description: 'Premium orchid stem', price: 12.0, stock: 30, category: 'Orchids' },
  ];

  const created = [];
  for (const f of data) {
    const [row] = await db.Flower.scope('all').findOrCreate({
      where: { name: f.name },
      defaults: f,
    });
    if (!row.isActive) await row.update({ isActive: true });
    created.push(row);
  }
  return created;
}

async function createOrder({ customerId, items, notes }) {
  const t = await db.sequelize.transaction();
  try {
    const order = await db.Order.create(
      { customerId, status: 'paid', total: 0, notes },
      { transaction: t }
    );

    let total = 0;
    for (const { flowerId, quantity } of items) {
      const flower = await db.Flower.findByPk(flowerId, { transaction: t });
      if (!flower || !flower.isActive) throw new Error(`Flower ${flowerId} unavailable`);
      if (flower.stock < quantity) throw new Error(`Insufficient stock for ${flower.name}`);

      const price = Number(flower.price);
      total += price * quantity;

      await db.OrderItem.create({ orderId: order.id, flowerId, quantity, price }, { transaction: t });
      await flower.update({ stock: flower.stock - quantity }, { transaction: t });
    }

    await order.update({ total }, { transaction: t });
    await t.commit();
    return order;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

(async () => {
  try {
    await db.sequelize.authenticate();
    // Make sure SQLite enforces FK
    await db.sequelize.query('PRAGMA foreign_keys = ON');

    // Do NOT drop data; just ensure tables exist
    await db.sequelize.sync({ alter: false });

    const admin = await createUser({
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      password: 'Admin123!',
    });

    const staff = await createUser({
      name: 'Staff',
      email: 'staff@example.com',
      role: 'staff',
      password: 'Staff123!',
    });

    const customerUser = await createUser({
      name: 'Alice Customer',
      email: 'alice@example.com',
      role: 'customer',
      password: 'Customer123!',
    });

    const customer = await upsertCustomer({
      name: 'Alice Customer',
      email: 'alice@example.com',
      phone: '0400 000 000',
      address: '123 Collins St, Melbourne',
    });

    const flowers = await ensureFlowers();

    // Demo orders
    const f = Object.fromEntries(flowers.map(x => [x.name, x]));
    await createOrder({
      customerId: customer.id,
      items: [
        { flowerId: f['Rose Red'].id, quantity: 3 },
        { flowerId: f['Baby’s Breath'].id, quantity: 2 },
      ],
      notes: 'Seed order: birthday bouquet',
    });

    await createOrder({
      customerId: customer.id,
      items: [
        { flowerId: f['Sunflower'].id, quantity: 4 },
        { flowerId: f['Tulip Pink'].id, quantity: 5 },
      ],
      notes: 'Seed order: spring mix',
    });

    console.log('✅ Seed complete:', {
      admin: admin.email,
      staff: staff.email,
      customer: customer.email,
      flowers: flowers.length,
      demoOrders: 2,
    });
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
})();
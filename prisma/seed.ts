import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log('Seeding database...');

  // Create test users
  const adminPassword = await hashPassword('password123');
  const supervisorPassword = await hashPassword('password123');
  const techPassword = await hashPassword('password123');
  const repairPassword = await hashPassword('password123');

  // Admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@breakpoint.local' },
    update: {},
    create: {
      email: 'admin@breakpoint.local',
      passwordHash: adminPassword,
      role: 'admin',
      technicianProfile: {
        create: {
          name: 'Admin User',
          phone: '555-0001',
        },
      },
    },
  });
  console.log('Created admin user:', admin.email);

  // Supervisor user
  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@breakpoint.local' },
    update: {},
    create: {
      email: 'supervisor@breakpoint.local',
      passwordHash: supervisorPassword,
      role: 'supervisor',
      technicianProfile: {
        create: {
          name: 'Supervisor User',
          phone: '555-0002',
        },
      },
    },
  });
  console.log('Created supervisor user:', supervisor.email);

  // Tech user
  const tech = await prisma.user.upsert({
    where: { email: 'tech@breakpoint.local' },
    update: {},
    create: {
      email: 'tech@breakpoint.local',
      passwordHash: techPassword,
      role: 'tech',
      technicianProfile: {
        create: {
          name: 'Tech User',
          phone: '555-0003',
          truckId: 'TRUCK-001',
          active: true,
        },
      },
    },
  });
  console.log('Created tech user:', tech.email);

  // Repair user
  const repair = await prisma.user.upsert({
    where: { email: 'repair@breakpoint.local' },
    update: {},
    create: {
      email: 'repair@breakpoint.local',
      passwordHash: repairPassword,
      role: 'repair',
      technicianProfile: {
        create: {
          name: 'Repair Tech',
          phone: '555-0004',
          truckId: 'TRUCK-002',
          active: true,
        },
      },
    },
  });
  console.log('Created repair user:', repair.email);

  // Create sample properties
  const property1 = await prisma.property.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Sunset Pool Club',
      address: '123 Sunset Blvd, Los Angeles, CA 90028',
      latitude: 34.0928,
      longitude: -118.3287,
      notes: 'Main entrance on the east side',
    },
  });

  const property2 = await prisma.property.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Marina Bay Resort',
      address: '456 Marina Way, Marina del Rey, CA 90292',
      latitude: 33.9802,
      longitude: -118.4517,
      notes: 'Pool located behind main building',
    },
  });

  console.log('Created sample properties:', property1.name, property2.name);

  // Create sample assignments
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const assignment1 = await prisma.assignment.create({
    data: {
      propertyId: property1.id,
      technicianId: tech.id,
      scheduledDate: tomorrow,
      status: 'pending',
      notes: 'Regular maintenance visit',
    },
  });
  console.log('Created sample assignment for:', property1.name);

  // Create sample products
  await prisma.product.upsert({
    where: { sku: 'CL-001' },
    update: {},
    create: {
      sku: 'CL-001',
      name: 'Chlorine Tablets 50lb',
      category: 'Chemicals',
      price: 149.99,
    },
  });

  await prisma.product.upsert({
    where: { sku: 'PH-001' },
    update: {},
    create: {
      sku: 'PH-001',
      name: 'pH Reducer 25lb',
      category: 'Chemicals',
      price: 39.99,
    },
  });

  await prisma.product.upsert({
    where: { sku: 'FL-001' },
    update: {},
    create: {
      sku: 'FL-001',
      name: 'Pool Filter Cartridge',
      category: 'Parts',
      price: 89.99,
    },
  });

  console.log('Created sample products');

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

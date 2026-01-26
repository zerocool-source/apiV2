import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log('Seeding database...');

  // Clear existing data for clean seeding
  await prisma.assignment.deleteMany();
  await prisma.technicianProfile.deleteMany();
  await prisma.property.deleteMany();
  await prisma.user.deleteMany();

  const password = await hashPassword('password123');

  // ===== ADMIN =====
  const admin = await prisma.user.create({
    data: {
      email: 'admin@breakpoint.local',
      passwordHash: password,
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

  // ===== SUPERVISORS (3 regions) =====
  const supervisorNorth = await prisma.user.create({
    data: {
      email: 'supervisor.north@breakpoint.local',
      passwordHash: password,
      role: 'supervisor',
      technicianProfile: {
        create: {
          name: 'North Region Supervisor',
          phone: '555-1001',
          region: 'north',
        },
      },
    },
  });
  console.log('Created supervisor:', supervisorNorth.email);

  const supervisorMid = await prisma.user.create({
    data: {
      email: 'supervisor.mid@breakpoint.local',
      passwordHash: password,
      role: 'supervisor',
      technicianProfile: {
        create: {
          name: 'Mid Region Supervisor',
          phone: '555-1002',
          region: 'mid',
        },
      },
    },
  });
  console.log('Created supervisor:', supervisorMid.email);

  const supervisorSouth = await prisma.user.create({
    data: {
      email: 'supervisor.south@breakpoint.local',
      passwordHash: password,
      role: 'supervisor',
      technicianProfile: {
        create: {
          name: 'South Region Supervisor',
          phone: '555-1003',
          region: 'south',
        },
      },
    },
  });
  console.log('Created supervisor:', supervisorSouth.email);

  // ===== TECHNICIANS (2 per region) =====
  // North Region Techs
  const techNorth1 = await prisma.user.create({
    data: {
      email: 'tech.north1@breakpoint.local',
      passwordHash: password,
      role: 'tech',
      technicianProfile: {
        create: {
          name: 'North Tech 1',
          phone: '555-2001',
          truckId: 'TRUCK-N01',
          supervisorId: supervisorNorth.id,
          region: 'north',
          active: true,
        },
      },
    },
  });

  const techNorth2 = await prisma.user.create({
    data: {
      email: 'tech.north2@breakpoint.local',
      passwordHash: password,
      role: 'tech',
      technicianProfile: {
        create: {
          name: 'North Tech 2',
          phone: '555-2002',
          truckId: 'TRUCK-N02',
          supervisorId: supervisorNorth.id,
          region: 'north',
          active: true,
        },
      },
    },
  });
  console.log('Created north region techs:', techNorth1.email, techNorth2.email);

  // Mid Region Techs
  const techMid1 = await prisma.user.create({
    data: {
      email: 'tech.mid1@breakpoint.local',
      passwordHash: password,
      role: 'tech',
      technicianProfile: {
        create: {
          name: 'Mid Tech 1',
          phone: '555-2003',
          truckId: 'TRUCK-M01',
          supervisorId: supervisorMid.id,
          region: 'mid',
          active: true,
        },
      },
    },
  });

  const techMid2 = await prisma.user.create({
    data: {
      email: 'tech.mid2@breakpoint.local',
      passwordHash: password,
      role: 'tech',
      technicianProfile: {
        create: {
          name: 'Mid Tech 2',
          phone: '555-2004',
          truckId: 'TRUCK-M02',
          supervisorId: supervisorMid.id,
          region: 'mid',
          active: true,
        },
      },
    },
  });
  console.log('Created mid region techs:', techMid1.email, techMid2.email);

  // South Region Techs
  const techSouth1 = await prisma.user.create({
    data: {
      email: 'tech.south1@breakpoint.local',
      passwordHash: password,
      role: 'tech',
      technicianProfile: {
        create: {
          name: 'South Tech 1',
          phone: '555-2005',
          truckId: 'TRUCK-S01',
          supervisorId: supervisorSouth.id,
          region: 'south',
          active: true,
        },
      },
    },
  });

  const techSouth2 = await prisma.user.create({
    data: {
      email: 'tech.south2@breakpoint.local',
      passwordHash: password,
      role: 'tech',
      technicianProfile: {
        create: {
          name: 'South Tech 2',
          phone: '555-2006',
          truckId: 'TRUCK-S02',
          supervisorId: supervisorSouth.id,
          region: 'south',
          active: true,
        },
      },
    },
  });
  console.log('Created south region techs:', techSouth1.email, techSouth2.email);

  // ===== UNASSIGNED TECH (for testing claim functionality) =====
  const unassignedTech = await prisma.user.create({
    data: {
      email: 'tech.unassigned@breakpoint.local',
      passwordHash: password,
      role: 'tech',
      technicianProfile: {
        create: {
          name: 'Unassigned Tech',
          phone: '555-9999',
          truckId: 'TRUCK-X01',
          supervisorId: null,
          region: null,
          active: true,
        },
      },
    },
  });
  console.log('Created unassigned tech:', unassignedTech.email);

  // ===== PROPERTIES (2 per region) =====
  // North Region Properties
  const propNorth1 = await prisma.property.create({
    data: {
      name: 'Northside Community Pool',
      address: '100 North Ave, Los Angeles, CA 90001',
      latitude: 34.15,
      longitude: -118.25,
      region: 'north',
      notes: 'Large community pool, access via north gate',
    },
  });

  const propNorth2 = await prisma.property.create({
    data: {
      name: 'Highland Park Aquatics',
      address: '200 Highland Blvd, Los Angeles, CA 90002',
      latitude: 34.12,
      longitude: -118.22,
      region: 'north',
      notes: 'Olympic size pool',
    },
  });
  console.log('Created north region properties');

  // Mid Region Properties
  const propMid1 = await prisma.property.create({
    data: {
      name: 'Downtown Fitness Center',
      address: '300 Main St, Los Angeles, CA 90010',
      latitude: 34.05,
      longitude: -118.25,
      region: 'mid',
      notes: 'Indoor pool, check in at front desk',
    },
  });

  const propMid2 = await prisma.property.create({
    data: {
      name: 'Central Park Pool',
      address: '400 Central Ave, Los Angeles, CA 90011',
      latitude: 34.03,
      longitude: -118.27,
      region: 'mid',
      notes: 'Two pools - lap and recreational',
    },
  });
  console.log('Created mid region properties');

  // South Region Properties
  const propSouth1 = await prisma.property.create({
    data: {
      name: 'Marina Bay Resort',
      address: '500 Marina Way, Marina del Rey, CA 90292',
      latitude: 33.98,
      longitude: -118.45,
      region: 'south',
      notes: 'Pool located behind main building',
    },
  });

  const propSouth2 = await prisma.property.create({
    data: {
      name: 'Sunset Pool Club',
      address: '600 Sunset Blvd, Los Angeles, CA 90028',
      latitude: 33.95,
      longitude: -118.40,
      region: 'south',
      notes: 'Main entrance on the east side',
    },
  });
  console.log('Created south region properties');

  // ===== ASSIGNMENTS (matching supervisor/team) =====
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  // North Region Assignments
  await prisma.assignment.create({
    data: {
      propertyId: propNorth1.id,
      technicianId: techNorth1.id,
      scheduledDate: tomorrow,
      priority: 'med',
      status: 'pending',
      notes: 'Regular weekly maintenance',
    },
  });

  await prisma.assignment.create({
    data: {
      propertyId: propNorth2.id,
      technicianId: techNorth2.id,
      scheduledDate: tomorrow,
      priority: 'high',
      status: 'pending',
      notes: 'Water quality check - customer complaint',
    },
  });
  console.log('Created north region assignments');

  // Mid Region Assignments
  await prisma.assignment.create({
    data: {
      propertyId: propMid1.id,
      technicianId: techMid1.id,
      scheduledDate: tomorrow,
      priority: 'low',
      status: 'pending',
      notes: 'Routine inspection',
    },
  });

  await prisma.assignment.create({
    data: {
      propertyId: propMid2.id,
      technicianId: techMid2.id,
      scheduledDate: nextWeek,
      priority: 'med',
      status: 'pending',
      notes: 'Filter replacement',
    },
  });
  console.log('Created mid region assignments');

  // South Region Assignments
  await prisma.assignment.create({
    data: {
      propertyId: propSouth1.id,
      technicianId: techSouth1.id,
      scheduledDate: tomorrow,
      priority: 'high',
      status: 'pending',
      notes: 'Emergency repair follow-up',
    },
  });

  await prisma.assignment.create({
    data: {
      propertyId: propSouth2.id,
      technicianId: techSouth2.id,
      scheduledDate: nextWeek,
      priority: 'med',
      status: 'pending',
      notes: 'Monthly maintenance',
    },
  });
  console.log('Created south region assignments');

  // ===== PRODUCTS =====
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

  console.log('');
  console.log('===== SEED COMPLETED =====');
  console.log('');
  console.log('Test Users (password: password123):');
  console.log('');
  console.log('Admin:');
  console.log('  - admin@breakpoint.local');
  console.log('');
  console.log('Supervisors (each sees only their region):');
  console.log('  - supervisor.north@breakpoint.local (North Region)');
  console.log('  - supervisor.mid@breakpoint.local (Mid Region)');
  console.log('  - supervisor.south@breakpoint.local (South Region)');
  console.log('');
  console.log('Technicians:');
  console.log('  North: tech.north1@breakpoint.local, tech.north2@breakpoint.local');
  console.log('  Mid:   tech.mid1@breakpoint.local, tech.mid2@breakpoint.local');
  console.log('  South: tech.south1@breakpoint.local, tech.south2@breakpoint.local');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

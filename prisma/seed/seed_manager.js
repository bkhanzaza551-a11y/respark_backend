import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const defaultManagerPermissions = {
  dashboard: ["view", "edit"],
  appointments: ["view", "create", "edit"],
  services: ["view", "create", "edit"],
  staff: ["view", "create", "edit"],
  staffSchedule: ["view", "create", "edit"],
  customers: ["view", "create", "edit"],
  pos: ["view", "create"],
  invoices: ["view", "create", "edit"],
  payments: ["view", "create", "edit"],
  inventory: ["view", "create", "edit"],
  purchases: ["view", "create", "edit"],
  memberships: ["view", "create", "edit"],
  packages: ["view", "create", "edit"],
  reports: ["view"],
  advancedReports: ["view"],
  catalog: ["view"],
  orders: ["view", "create", "edit"],
  loyalty: ["view", "create", "edit"],
  couponsGiftCards: ["view", "create", "edit"],
  feedback: ["view", "create", "edit"],
  enquiries: ["view", "create", "edit"],
  expenses: ["view", "create", "edit", "approve"],
  attendance: ["view", "create", "edit"],
  notifications: ["view", "create", "edit"],
  auditLogs: ["view"],
  myDashboard: ["view"],
  myAppointments: ["view", "edit"],
  mySchedule: ["view"],
  myProfile: ["view", "edit"],
  myAttendance: ["view", "create", "edit"]
};

async function main() {
  console.log("=== CREATING / UPDATING MANAGER ROLE & STAFF ACCOUNT ===");

  // 1. Find Salon Skillify
  const salon = await prisma.salon.findFirst({
    where: { OR: [{ slug: "skillify" }, { name: "Skillify" }] }
  });

  if (!salon) {
    throw new Error("Salon Skillify not found!");
  }
  console.log("Found Salon:", salon.name, salon.id);

  // 2. Find active branch (Indore or first active)
  let branch = await prisma.branch.findFirst({
    where: { salonId: salon.id, isActive: true },
    orderBy: { createdAt: "desc" }
  });

  if (!branch) {
    branch = await prisma.branch.findFirst({
      where: { salonId: salon.id }
    });
  }
  console.log("Found Branch:", branch?.name, branch?.id);

  // 3. Find or create Manager CustomRole
  let managerRole = await prisma.customRole.findFirst({
    where: { salonId: salon.id, name: "Manager" }
  });

  if (!managerRole) {
    managerRole = await prisma.customRole.create({
      data: {
        salonId: salon.id,
        name: "Manager",
        description: "Default operational manager with permissions for POS, appointments, inventory, staff, and reports",
        permissions: defaultManagerPermissions,
        isSystemPreset: true
      }
    });
    console.log("Created CustomRole Manager:", managerRole.id);
  } else {
    managerRole = await prisma.customRole.update({
      where: { id: managerRole.id },
      data: {
        description: "Default operational manager with permissions for POS, appointments, inventory, staff, and reports",
        permissions: defaultManagerPermissions
      }
    });
    console.log("Updated CustomRole Manager permissions:", managerRole.id);
  }

  // 4. Create Manager User
  const managerEmail = "manager@ashokagroup.org";
  const managerPasswordRaw = "Manager@123";
  const passwordHash = await bcrypt.hash(managerPasswordRaw, 10);

  let managerUser = await prisma.user.findUnique({
    where: { email: managerEmail }
  });

  if (managerUser) {
    managerUser = await prisma.user.update({
      where: { id: managerUser.id },
      data: {
        name: "Salon Manager",
        passwordHash,
        systemRole: "SALON_USER",
        isActive: true,
        passwordSetupRequired: false,
        isDemoAccount: false
      }
    });
    console.log("Updated Manager User:", managerUser.id, managerUser.email);
  } else {
    managerUser = await prisma.user.create({
      data: {
        email: managerEmail,
        name: "Salon Manager",
        systemRole: "SALON_USER",
        passwordHash,
        isActive: true,
        passwordSetupRequired: false,
        isDemoAccount: false
      }
    });
    console.log("Created Manager User:", managerUser.id, managerUser.email);
  }

  // 5. Connect UserSalon
  let userSalon = await prisma.userSalon.findFirst({
    where: { userId: managerUser.id, salonId: salon.id }
  });

  if (userSalon) {
    userSalon = await prisma.userSalon.update({
      where: { id: userSalon.id },
      data: {
        salonRole: "MANAGER",
        roleTitle: "Manager",
        branchId: branch ? branch.id : null,
        customRoleId: managerRole.id,
        permissions: defaultManagerPermissions,
        attendanceEnabled: true,
        showInCatalog: true,
        isArchived: false
      }
    });
    console.log("Updated Manager UserSalon:", userSalon.id);
  } else {
    userSalon = await prisma.userSalon.create({
      data: {
        userId: managerUser.id,
        salonId: salon.id,
        salonRole: "MANAGER",
        roleTitle: "Manager",
        branchId: branch ? branch.id : null,
        customRoleId: managerRole.id,
        permissions: defaultManagerPermissions,
        attendanceEnabled: true,
        showInCatalog: true,
        isArchived: false,
        phone: "+919000442443"
      }
    });
    console.log("Created Manager UserSalon:", userSalon.id);
  }

  // 6. Verification
  const verify = await prisma.user.findUnique({
    where: { email: managerEmail },
    include: {
      memberships: {
        include: {
          salon: true,
          branch: true,
          customRole: true
        }
      }
    }
  });

  const isPasswordValid = await bcrypt.compare(managerPasswordRaw, verify.passwordHash);

  console.log("\n=== VERIFICATION SUMMARY ===");
  console.log("Email:", verify.email);
  console.log("Password:", managerPasswordRaw);
  console.log("Password Valid:", isPasswordValid);
  console.log("System Role:", verify.systemRole);
  console.log("Salon Name:", verify.memberships[0]?.salon?.name);
  console.log("Branch:", verify.memberships[0]?.branch?.name);
  console.log("Salon Role:", verify.memberships[0]?.salonRole);
  console.log("Role Title:", verify.memberships[0]?.roleTitle);
  console.log("Custom Role:", verify.memberships[0]?.customRole?.name);
  console.log("Custom Role ID:", verify.memberships[0]?.customRoleId);
  console.log("Attendance Enabled:", verify.memberships[0]?.attendanceEnabled);
  console.log("=== MANAGER SETUP COMPLETE ===");
}

main()
  .catch((e) => {
    console.error("Error creating manager:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

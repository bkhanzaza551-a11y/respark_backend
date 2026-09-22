import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { defaultOwnerPermissions } from "../../src/lib/permissions.js";

const prisma = new PrismaClient();

async function main() {
  console.log("=== STARTING DATABASE CLEANUP & RESET ===");

  // Helper to safely truncate/delete tables
  const clearTable = async (table) => {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
      console.log(`Truncated table ${table}`);
    } catch {
      try {
        if (prisma[table]?.deleteMany) {
          await prisma[table].deleteMany({});
          console.log(`Deleted all rows from ${table}`);
        }
      } catch (err2) {
        console.warn(`Could not clear table ${table}: ${err2.message}`);
      }
    }
  };

  // Operational tables to clear (child to parent)
  const tablesToClear = [
    "AttendanceRecord",
    "LeaveRequest",
    "StaffSchedule",
    "StaffBreak",
    "StaffServiceAssignment",
    "AppointmentServiceStaff",
    "AppointmentService",
    "AppointmentLog",
    "Appointment",
    "InvoiceItem",
    "Payment",
    "Invoice",
    "CustomerTimeline",
    "CustomerMembership",
    "CustomerPackage",
    "MembershipUsage",
    "PackageUsage",
    "CustomerFeedback",
    "CustomerReward",
    "RewardTransaction",
    "LoyaltyTransaction",
    "Customer",
    "ServiceConsumable",
    "ServiceTax",
    "Service",
    "ServiceCategory",
    "StockMovement",
    "StockTransferItem",
    "StockTransfer",
    "StockReconciliationItem",
    "StockReconciliation",
    "PurchaseOrderItem",
    "PurchaseOrder",
    "VendorItem",
    "Vendor",
    "Product",
    "ProductCategory",
    "PackageService",
    "Package",
    "MembershipPlanService",
    "MembershipPlan",
    "CouponUsage",
    "Coupon",
    "GiftCardTransaction",
    "GiftCard",
    "Expense",
    "EnquiryFollowUp",
    "Enquiry",
    "Notification",
    "AuditLog",
    "WhatsAppLog",
    "WhatsAppMessage",
    "SmsLog",
    "EmailLog",
    "SupportTicketMessage",
    "SupportTicket",
    "OnlineOrderItem",
    "OnlineOrder",
    "CatalogAnalyticsEvent",
    "CatalogOffer",
    "CatalogBanner",
    "PasswordSetupToken",
    "DemoLead",
    "UserSalon",
    "User"
  ];

  for (const tbl of tablesToClear) {
    await clearTable(tbl);
  }

  console.log("\n=== ALL DUMMY DATA AND PREVIOUS USERS CLEARED ===");

  // 1. Ensure Salon "Skillify" exists and is active
  let salon = await prisma.salon.findFirst({
    where: { OR: [{ slug: "skillify" }, { name: "Skillify" }] }
  });

  if (!salon) {
    salon = await prisma.salon.create({
      data: {
        name: "Skillify",
        slug: "skillify",
        businessType: "Salon",
        currency: "INR",
        taxRate: 18,
        status: "ACTIVE",
        featureFlags: {
          pos: true,
          appointments: true,
          inventory: true,
          reports: true,
          crm: true,
          catalog: true,
          publicCatalog: true,
          digitalCatalog: true,
          customerPortal: true,
          ecommerce: true,
          onlineOrders: true,
          campaigns: true,
          messageTemplates: true,
          catalogAnalytics: true,
          attendance: true
        }
      }
    });
    console.log("Created Salon Skillify:", salon.id);
  } else {
    salon = await prisma.salon.update({
      where: { id: salon.id },
      data: {
        name: "Skillify",
        slug: "skillify",
        status: "ACTIVE",
        featureFlags: {
          pos: true,
          appointments: true,
          inventory: true,
          reports: true,
          crm: true,
          catalog: true,
          publicCatalog: true,
          digitalCatalog: true,
          customerPortal: true,
          ecommerce: true,
          onlineOrders: true,
          campaigns: true,
          messageTemplates: true,
          catalogAnalytics: true,
          attendance: true
        }
      }
    });
    console.log("Updated Salon Skillify:", salon.id);
  }

  // 2. Ensure an active Main Branch exists for Skillify
  let mainBranch = await prisma.branch.findFirst({
    where: { salonId: salon.id, isActive: true }
  });

  if (!mainBranch) {
    mainBranch = await prisma.branch.create({
      data: {
        salonId: salon.id,
        name: "Main Branch",
        address: "Skillify Salon",
        phone: "+919000442442",
        isActive: true
      }
    });
    console.log("Created Main Branch:", mainBranch.id);
  } else {
    console.log("Found Active Branch:", mainBranch.name, mainBranch.id);
  }

  // 3. Ensure an active plan and subscription exist with high limits
  let plan = await prisma.plan.findFirst({
    where: { name: "Free Trial" }
  });

  if (!plan) {
    plan = await prisma.plan.create({
      data: {
        name: "Free Trial",
        monthlyPrice: 0,
        yearlyPrice: 0,
        trialDays: 365,
        branchLimit: 9999,
        userLimit: 999,
        customerLimit: 99999,
        invoiceLimit: 999999,
        featureFlags: {
          pos: true,
          crm: true,
          reports: true,
          publicCatalog: true,
          digitalCatalog: true,
          customerPortal: true,
          ecommerce: true,
          onlineOrders: true,
          campaigns: true,
          messageTemplates: true,
          catalogAnalytics: true,
          attendance: true
        }
      }
    });
  }

  let sub = await prisma.subscription.findFirst({
    where: { salonId: salon.id }
  });

  if (!sub) {
    sub = await prisma.subscription.create({
      data: {
        salonId: salon.id,
        planId: plan.id,
        status: "ACTIVE",
        paymentStatus: "PAID",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });
    console.log("Created Subscription:", sub.id);
  } else {
    sub = await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        paymentStatus: "PAID",
        endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });
    console.log("Updated Subscription:", sub.id);
  }

  // 4. Create the requested Super Admin / Salon Owner user
  const adminEmail = "vipin@ashokagroup.org";
  const adminPasswordRaw = "9000442442";
  const passwordHash = await bcrypt.hash(adminPasswordRaw, 10);

  const adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Vipin",
      systemRole: "SUPER_ADMIN",
      passwordHash,
      isActive: true,
      passwordSetupRequired: false,
      isDemoAccount: false
    }
  });

  console.log("Created Super Admin User:", adminUser.id, adminUser.email);

  // 5. Connect user to Skillify salon as SALON_OWNER
  const userSalon = await prisma.userSalon.create({
    data: {
      userId: adminUser.id,
      salonId: salon.id,
      salonRole: "SALON_OWNER",
      roleTitle: "Super Admin",
      branchId: mainBranch.id,
      permissions: defaultOwnerPermissions,
      isArchived: false,
      attendanceEnabled: true
    }
  });

  console.log("Connected User to Salon Skillify as SALON_OWNER:", userSalon.id);

  // 6. Ensure default Manager role and Manager staff user
  const defaultManagerPermissions = {
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
  } else {
    managerRole = await prisma.customRole.update({
      where: { id: managerRole.id },
      data: {
        description: "Default operational manager with permissions for POS, appointments, inventory, staff, and reports",
        permissions: defaultManagerPermissions
      }
    });
  }

  const managerEmail = "manager@ashokagroup.org";
  const managerPasswordRaw = "Manager@123";
  const managerPasswordHash = await bcrypt.hash(managerPasswordRaw, 10);

  let managerUser = await prisma.user.findUnique({
    where: { email: managerEmail }
  });

  if (managerUser) {
    managerUser = await prisma.user.update({
      where: { id: managerUser.id },
      data: {
        name: "Salon Manager",
        passwordHash: managerPasswordHash,
        systemRole: "SALON_USER",
        isActive: true,
        passwordSetupRequired: false,
        isDemoAccount: false
      }
    });
  } else {
    managerUser = await prisma.user.create({
      data: {
        email: managerEmail,
        name: "Salon Manager",
        systemRole: "SALON_USER",
        passwordHash: managerPasswordHash,
        isActive: true,
        passwordSetupRequired: false,
        isDemoAccount: false
      }
    });
  }

  let managerMembership = await prisma.userSalon.findFirst({
    where: { userId: managerUser.id, salonId: salon.id }
  });

  if (managerMembership) {
    managerMembership = await prisma.userSalon.update({
      where: { id: managerMembership.id },
      data: {
        salonRole: "MANAGER",
        roleTitle: "Manager",
        branchId: mainBranch.id,
        customRoleId: managerRole.id,
        permissions: defaultManagerPermissions,
        attendanceEnabled: true,
        showInCatalog: true,
        isArchived: false
      }
    });
  } else {
    managerMembership = await prisma.userSalon.create({
      data: {
        userId: managerUser.id,
        salonId: salon.id,
        salonRole: "MANAGER",
        roleTitle: "Manager",
        branchId: mainBranch.id,
        customRoleId: managerRole.id,
        permissions: defaultManagerPermissions,
        attendanceEnabled: true,
        showInCatalog: true,
        isArchived: false,
        phone: "+919000442443"
      }
    });
  }

  console.log("Created/Updated Manager User & Membership:", managerUser.email, managerMembership.id);

  // 7. Verification test
  const verifyUser = await prisma.user.findUnique({
    where: { email: adminEmail },
    include: { memberships: { include: { salon: true } } }
  });

  const isPasswordValid = await bcrypt.compare(adminPasswordRaw, verifyUser.passwordHash);

  console.log("\n=== VERIFICATION SUMMARY ===");
  console.log("Admin Email:", verifyUser.email);
  console.log("System Role:", verifyUser.systemRole);
  console.log("Password Valid:", isPasswordValid);
  console.log("Salon Name:", verifyUser.memberships[0]?.salon?.name);
  console.log("Salon Role:", verifyUser.memberships[0]?.salonRole);
  console.log("Manager Email:", managerEmail);
  console.log("Manager Password:", managerPasswordRaw);
  console.log("=== DATABASE RESET COMPLETE ===");
}

main()
  .catch((e) => {
    console.error("Error during database reset:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

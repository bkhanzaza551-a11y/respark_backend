import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { defaultOwnerPermissions } from "../../src/lib/permissions.js";

const prisma = new PrismaClient();

const defaultManagerPermissions = { ...defaultOwnerPermissions };
delete defaultManagerPermissions.branches;

async function main() {
  console.log("=== STARTING DATABASE CLEANUP & RESET (ZERO BRANCHES) ===");

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
    "CatalogSetting",
    "SalonSetting",
    "LoyaltyRule",
    "PasswordSetupToken",
    "DemoLead",
    "UserSalon",
    "User",
    "CustomRole",
    "Branch"
  ];

  for (const tbl of tablesToClear) {
    await clearTable(tbl);
  }

  console.log("\n=== ALL DUMMY DATA, BRANCHES, AND OLD USERS CLEARED ===");

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

  // 2. Ensure an active plan and subscription exist with high limits
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

  // 3. Create the Super Admin / Salon Owner user (NO BRANCH)
  const adminEmail = "vipin@ashokagroup.org";
  const adminPasswordRaw = "9000442442";
  const passwordHash = await bcrypt.hash(adminPasswordRaw, 10);

  const adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Vipin",
      systemRole: "SALON_USER",
      passwordHash,
      isActive: true,
      passwordSetupRequired: false,
      isDemoAccount: false
    }
  });

  console.log("Created Super Admin User:", adminUser.id, adminUser.email);

  const adminUserSalon = await prisma.userSalon.create({
    data: {
      userId: adminUser.id,
      salonId: salon.id,
      salonRole: "SALON_OWNER",
      roleTitle: "Super Admin",
      branchId: null,
      customRoleId: null,
      permissions: defaultOwnerPermissions,
      isArchived: false,
      attendanceEnabled: true
    }
  });

  console.log("Connected User to Salon Skillify as SALON_OWNER (branchId: null):", adminUserSalon.id);

  // 4. Create default CustomRoles: Manager & Senior Stylist
  const managerRole = await prisma.customRole.create({
    data: {
      salonId: salon.id,
      name: "Manager",
      description: "Default operational manager with permissions for POS, appointments, inventory, staff, and reports",
      permissions: defaultManagerPermissions,
      isSystemPreset: true
    }
  });
  console.log("Created Manager CustomRole:", managerRole.id);

  const stylistRole = await prisma.customRole.create({
    data: {
      salonId: salon.id,
      name: "Senior Stylist",
      description: "Default staff role for salon stylists with appointments, services, and attendance access",
      permissions: {
        dashboard: ["view"],
        appointments: ["view", "create", "edit"],
        services: ["view"],
        customers: ["view", "create", "edit"],
        pos: ["view"],
        attendance: ["view", "create"],
        myDashboard: ["view"],
        myAppointments: ["view", "edit"],
        mySchedule: ["view"],
        myProfile: ["view", "edit"],
        myAttendance: ["view", "create", "edit"]
      },
      isSystemPreset: true
    }
  });
  console.log("Created Senior Stylist CustomRole:", stylistRole.id);

  // 5. Create 1 Staff as Manager (NO BRANCH)
  const managerEmail = "das@ashokagroup.org.in";
  const managerPasswordRaw = "Ashoka#1969";
  const managerPasswordHash = await bcrypt.hash(managerPasswordRaw, 10);

  const managerUser = await prisma.user.create({
    data: {
      email: managerEmail,
      name: "Das",
      systemRole: "SALON_USER",
      passwordHash: managerPasswordHash,
      isActive: true,
      passwordSetupRequired: false,
      isDemoAccount: false
    }
  });

  const managerMembership = await prisma.userSalon.create({
    data: {
      userId: managerUser.id,
      salonId: salon.id,
      salonRole: "MANAGER",
      roleTitle: "Manager",
      branchId: null,
      customRoleId: managerRole.id,
      permissions: defaultManagerPermissions,
      attendanceEnabled: true,
      showInCatalog: true,
      isArchived: false
    }
  });

  console.log("Created Manager User & Membership (branchId: null):", managerUser.email, managerMembership.id);

  // 6. Verification
  const branchCount = await prisma.branch.count();
  const userCount = await prisma.user.count();
  const roleCount = await prisma.customRole.count();

  console.log("\n=== VERIFICATION SUMMARY ===");
  console.log("Total Branches in DB:", branchCount);
  console.log("Total Users in DB:", userCount);
  console.log("Total Custom Roles in DB:", roleCount);
  console.log("Super Admin Email:", adminEmail, "Password:", adminPasswordRaw);
  console.log("Manager Email:", managerEmail, "Password:", managerPasswordRaw);
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

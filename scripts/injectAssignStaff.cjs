const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/modules/owner/phase2/appointments.js');
let content = fs.readFileSync(filePath, 'utf8');

const routeCode = `
  ownerRouter.patch("/appointments/:id/assign-staff", requireFeatureEnabled("appointments"), requireSalonPermission("appointments", "edit"), async (req, res) => {
    try {
      const { staffId, startAt, endAt } = req.body;
      const appointment = await fetchAppointment(req.salonId, req.params.id);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });

      await prisma.$transaction(async (tx) => {
        // Update appointment times
        await tx.appointment.update({
          where: { id: appointment.id },
          data: { 
            startAt: new Date(startAt), 
            endAt: new Date(endAt),
            status: "CONFIRMED"
          }
        });

        // Update services and staff
        for (const item of appointment.items) {
          await tx.appointmentService.update({
            where: { id: item.id },
            data: { startAt: new Date(startAt), endAt: new Date(endAt) }
          });
          
          await tx.appointmentServiceStaff.deleteMany({
            where: { appointmentServiceId: item.id }
          });

          if (staffId) {
            await tx.appointmentServiceStaff.create({
              data: {
                appointmentServiceId: item.id,
                userSalonId: staffId
              }
            });
          }
        }

        await logAppointmentChange(tx, appointment.id, req.user?.id, "UPDATED", appointment.status, "CONFIRMED", "Staff assigned and scheduled");
      });

      // Send notification to the newly assigned staff
      if (staffId) {
        const { createStaffNotification } = await import("../phase4/communications.js").catch(() => ({}));
        if (createStaffNotification) {
          createStaffNotification({
            salonId: req.salonId,
            userSalonId: staffId,
            title: "New Appointment Assigned",
            message: \`You have been assigned an appointment on \${new Date(startAt).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}.\`,
            type: "APPOINTMENT",
            linkUrl: \`/admin/my-appointments\`
          }).catch(err => console.error("Failed to notify staff:", err));
        }
      }

      res.json(await fetchAppointment(req.salonId, appointment.id));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Could not assign staff" });
    }
  });

`;

const targetText = '  ownerRouter.post("/appointments/:id/cancel"';
if (content.includes(targetText) && !content.includes('/appointments/:id/assign-staff')) {
  content = content.replace(targetText, routeCode + targetText);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log("Injected assign-staff route successfully!");
} else {
  console.log("Could not find target or route already exists.");
}

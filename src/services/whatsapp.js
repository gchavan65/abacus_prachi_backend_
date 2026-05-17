const db = require('../config/db');

// Send WhatsApp via Twilio or log for dev
async function sendWhatsApp(toPhone, message) {
  const phone = toPhone.replace(/\D/g, '');
  const to = `whatsapp:+${phone.startsWith('91') ? phone : '91' + phone}`;

  try {
    if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_WHATSAPP_FROM) {
      const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      const msg = await twilio.messages.create({
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: to,
        body: message,
      });
      await db.query(
        `INSERT INTO whatsapp_logs (to_phone, message, status, provider_id) VALUES ($1,$2,'sent',$3)`,
        [toPhone, message, msg.sid]
      );
      return { success: true, sid: msg.sid };
    } else {
      // Dev mode: just log
      console.log(`[WhatsApp DEV] To: ${to}\nMessage: ${message}\n`);
      await db.query(
        `INSERT INTO whatsapp_logs (to_phone, message, status, provider_id) VALUES ($1,$2,'sent','dev-log')`,
        [toPhone, message]
      );
      return { success: true, sid: 'dev-log' };
    }
  } catch (err) {
    console.error('WhatsApp error:', err.message);
    await db.query(
      `INSERT INTO whatsapp_logs (to_phone, message, status) VALUES ($1,$2,'failed')`,
      [toPhone, message]
    );
    return { success: false, error: err.message };
  }
}

async function sendFeeReminder(student, feePending, feePaid) {
  const clientName = process.env.CLIENT_NAME || 'AbacusPro Academy';
  const msg = `🧮 *${clientName}*\n\nHello ${student.name}! 👋\n\n*Fee Reminder*\n✅ Paid: ₹${feePaid}\n⏳ Pending: ₹${feePending}\n\nPlease clear dues at the earliest. Thank you!\n\n📞 Contact: ${process.env.CLIENT_PHONE}`;
  return sendWhatsApp(student.phone, msg);
}

async function sendApprovalNotification(student) {
  const clientName = process.env.CLIENT_NAME || 'AbacusPro Academy';
  const msg = `🎉 *${clientName}*\n\nCongratulations ${student.name}!\n\nYour registration has been *approved*. You can now login and access your courses.\n\nWelcome aboard! 🧮`;
  return sendWhatsApp(student.phone, msg);
}

module.exports = { sendWhatsApp, sendFeeReminder, sendApprovalNotification };

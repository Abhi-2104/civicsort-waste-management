import { db } from '../db/index.js';

// In a production deployment, replace the `simulateSend` calls below with real
// provider integrations (e.g. SendGrid/SES for email, Twilio/MSG91 for SMS,
// WhatsApp Business API). The template rendering, logging, and trigger logic
// (called automatically on incident approval) stay the same.

function renderTemplate(tpl, vars) {
  return tpl.replace(/{{\s*(\w+)\s*}}/g, (_, key) => (vars[key] ?? ''));
}

function simulateSend(channel, recipient, subject, body) {
  // Placeholder for a real provider call. Always logged to communication_log
  // regardless of channel so admins have a full audit trail.
  return { status: 'Simulated' };
}

export async function sendCommunication({ communityId, incidentId, flat, eventType, categoryName, date, remarks, penalty, warningNumber }) {
  const vars = {
    resident_name: flat.resident_name || flat.owner_name || 'Resident',
    flat_number: flat.flat_number,
    category_name: categoryName,
    date,
    remarks: remarks || '-',
    warning_number: warningNumber || '',
    penalty_amount: penalty ? penalty.penalty_amount : '',
    penalty_number: penalty ? penalty.penalty_number : '',
  };

  const templates = db.prepare(`SELECT * FROM communication_templates
    WHERE community_id=? AND event_type=? AND is_active=1`).all(communityId, eventType);

  const results = [];
  for (const tpl of templates) {
    const subject = tpl.subject_template ? renderTemplate(tpl.subject_template, vars) : null;
    const body = renderTemplate(tpl.body_template, vars);
    const recipient = tpl.channel === 'Email' ? flat.email : flat.mobile_number;

    const outcome = simulateSend(tpl.channel, recipient, subject, body);

    db.prepare(`INSERT INTO communication_log (incident_id, flat_id, channel, recipient, subject, message, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(incidentId, flat.id, tpl.channel, recipient, subject, body, outcome.status);

    results.push({ channel: tpl.channel, recipient, status: outcome.status });
  }
  return results;
}

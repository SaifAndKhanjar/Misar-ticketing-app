import { createClient } from '@supabase/supabase-js';

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const headers = ['phone', 'name', 'first_seen_at', 'last_seen_at', 'join_count'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  }
  return lines.join('\n');
}

async function sendViaResend({ apiKey, from, to, subject, text, filename, content }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      attachments: [
        {
          filename,
          content: Buffer.from(content, 'utf8').toString('base64')
        }
      ]
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const SUPABASE_URL = mustGetEnv('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = mustGetEnv('SUPABASE_SERVICE_ROLE_KEY');
  const RESEND_API_KEY = mustGetEnv('RESEND_API_KEY');
  const REPORT_TO_EMAIL = mustGetEnv('REPORT_TO_EMAIL');

  // Resend requires a verified "from" domain for production use.
  // You can start with onboarding@resend.dev for testing.
  const REPORT_FROM_EMAIL = process.env.REPORT_FROM_EMAIL || 'onboarding@resend.dev';

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: rows, error } = await supabase
    .from('queue_customers')
    .select('phone, name, first_seen_at, last_seen_at, join_count')
    .order('last_seen_at', { ascending: false });

  if (error) throw new Error(`Supabase query failed: ${error.message}`);

  const csv = toCsv(rows || []);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `queue_customers_${date}.csv`;

  const subject = `Misar Queue — Customers report (${date})`;
  const text =
    `Attached is the latest queue_customers export (${rows?.length || 0} rows).\n\n` +
    `Generated at: ${new Date().toISOString()}\n`;

  await sendViaResend({
    apiKey: RESEND_API_KEY,
    from: REPORT_FROM_EMAIL,
    to: REPORT_TO_EMAIL,
    subject,
    text,
    filename,
    content: csv
  });

  console.log(`Sent ${rows?.length || 0} rows to ${REPORT_TO_EMAIL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


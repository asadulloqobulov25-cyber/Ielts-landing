// Vercel serverless funksiya: POST /api/lead
// 1) Meta Conversions API'ga Lead yuboradi (telefon SHA-256 bilan hashlanadi)
// 2) Google Sheets'ga (Apps Script orqali) qator qo'shadi
//
// Vercel Environment Variables:
//   META_PIXEL_ID, META_ACCESS_TOKEN, SHEETS_URL
// Ixtiyoriy: META_TEST_CODE (Events Manager > Test events'dagi kod)

const crypto = require('crypto');

const sha256 = (v) =>
  crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { META_PIXEL_ID, META_ACCESS_TOKEN, SHEETS_URL, META_TEST_CODE } = process.env;
  const pixelId = META_PIXEL_ID;

  // body Vercel tomonidan JSON sifatida parse qilinadi
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const name = String(body.name || '').trim();
  const phoneDigits = String(body.phone || '').replace(/\D/g, '');
  const eventId = String(body.event_id || '');

  // Server tomonida ham tekshiramiz
  if (name.length < 2 || phoneDigits.length !== 12 || !phoneDigits.startsWith('998')) {
    return res.status(400).json({ ok: false, error: 'Noto\'g\'ri ma\'lumot' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '';
  const ua = req.headers['user-agent'] || '';

  const tasks = [];

  // ---- 1) Meta CAPI ----
  if (pixelId && META_ACCESS_TOKEN) {
    const userData = {
      ph: [sha256(phoneDigits)],            // faqat raqamlar, SHA-256
      fn: [sha256(name.split(/\s+/)[0])],   // ism (birinchi so'z)
      country: [sha256('uz')],
      client_ip_address: ip,
      client_user_agent: ua,
    };
    if (body.fbp) userData.fbp = body.fbp;
    if (body.fbc) userData.fbc = body.fbc;

    const payload = {
      data: [
        {
          event_name: 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,                // Pixel'dagi eventID bilan bir xil
          action_source: 'website',
          event_source_url: body.url || '',
          user_data: userData,
        },
      ],
    };
    if (META_TEST_CODE) payload.test_event_code = META_TEST_CODE;

    tasks.push(
      fetch(
        `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(META_ACCESS_TOKEN)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      ).then(async (r) => {
        if (!r.ok) console.error('CAPI xato:', r.status, await r.text());
        return r.ok;
      })
    );
  } else {
    console.warn('META_PIXEL_ID yoki META_ACCESS_TOKEN sozlanmagan');
  }

  // ---- 2) Google Sheets ----
  let sheetOk = false;
  if (SHEETS_URL) {
    tasks.push(
      fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ name, phone: '+' + phoneDigits, event_id: eventId }),
        redirect: 'follow',
      }).then(async (r) => {
        sheetOk = r.ok;
        if (!r.ok) console.error('Sheets xato:', r.status, await r.text());
        return r.ok;
      })
    );
  } else {
    console.warn('SHEETS_URL sozlanmagan');
  }

  await Promise.allSettled(tasks);

  // Foydalanuvchiga muvaffaqiyat qaytaramiz; agar jadval ishlamagan bo'lsa xato beramiz
  if (SHEETS_URL && !sheetOk) {
    return res.status(502).json({ ok: false, error: 'Sheets yozilmadi' });
  }
  return res.status(200).json({ ok: true });
};

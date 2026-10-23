
const crypto = require('crypto');

const sha256 = (value) =>
  crypto.createHash('sha256')
    .update(String(value).trim().toLowerCase())
    .digest('hex');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  }

  try {
    const {
      META_PIXEL_ID,
      META_ACCESS_TOKEN,
      SHEETS_URL,
      META_TEST_CODE
    } = process.env;

    const body = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {});

    const name = String(body.name || '').trim();
    const phoneDigits = String(body.phone || '').replace(/\D/g, '');
    const eventId = String(body.event_id || '');

    if (
      name.length < 2 ||
      phoneDigits.length !== 12 ||
      !phoneDigits.startsWith('998')
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Noto‘g‘ri ma’lumot'
      });
    }

    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress || '';

    const ua = req.headers['user-agent'] || '';
    const tasks = [];

    if (META_PIXEL_ID && META_ACCESS_TOKEN) {
      const userData = {
        ph: [sha256(phoneDigits)],
        fn: [sha256(name.split(/\s+/)[0])],
        country: [sha256('uz')],
        client_ip_address: ip,
        client_user_agent: ua
      };

      if (body.fbp) userData.fbp = body.fbp;
      if (body.fbc) userData.fbc = body.fbc;

      const payload = {
        data: [{
          event_name: 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: 'website',
          event_source_url: body.url || '',
          user_data: userData
        }]
      };

      if (META_TEST_CODE) {
        payload.test_event_code = META_TEST_CODE;
      }

      tasks.push(
        fetch(
          `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(META_ACCESS_TOKEN)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        )
      );
    }

    let sheetOk = false;

    if (SHEETS_URL) {
      tasks.push(
        fetch(SHEETS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify({
            name,
            phone: '+' + phoneDigits,
            event_id: eventId
          }),
          redirect: 'follow'
        }).then(response => {
          sheetOk = response.ok;
          return response;
        })
      );
    }

    await Promise.allSettled(tasks);

    if (SHEETS_URL && !sheetOk) {
      return res.status(502).json({
        ok: false,
        error: 'Sheets yozilmadi'
      });
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Lead xatosi:', error);
    return res.status(500).json({
      ok: false,
      error: 'Server xatosi'
    });
  }
};

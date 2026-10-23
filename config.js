// GET /api/config — Pixel ID'ni brauzerga beradi (Pixel ID maxfiy emas)
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ pixelId: process.env.META_PIXEL_ID || '' });
};

module.exports = (req, res) => {
  const pixelId = process.env.META_PIXEL_ID || "";

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    pixelId: pixelId
  });
};

module.exports = (req, res) => {
  res.status(200).json({ ok: true, url: req.url, time: new Date().toISOString() });
};

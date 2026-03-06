module.exports = (req, res) => {
    res.status(200).json({
        ok: true,
        env_url: !!process.env.TURSO_DATABASE_URL,
        env_token: !!process.env.TURSO_AUTH_TOKEN,
        node: process.version,
        time: new Date().toISOString()
    });
};

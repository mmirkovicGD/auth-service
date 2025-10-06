require('dotenv').config();
const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
    const token = removeTokenPrefix(req?.headers?.cookie);
    if (!token) return res.status(401).json({ message: "UNAUTHORIZED_USER" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ message: "INVALID_TOKEN" });
    }
};

const removeTokenPrefix = (str) => {
    if (str) {
        const prefix = 'token=';
        if (str.startsWith(prefix)) {
            return str.slice(prefix.length);
        }
    }
    return str;
}

module.exports = verifyToken;
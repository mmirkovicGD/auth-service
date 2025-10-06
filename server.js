const express = require("express");
const mongoose = require("mongoose");
const PORT = 5001;
const authRoutes = require("./routes/auth.route");
const cors = require("cors");
const bodyParser = require("body-parser");
const app = express();

const corsOptions = {
  origin: "http://localhost:4200",
  credentials: true, 
};

const { db, AUTH_PORT } = require("../../common/constants");
app.use(cors(corsOptions));
app.use(bodyParser.json());

mongoose.connect(db.url).catch((err) => console.error(err));

app.use("/auth", authRoutes);

app.listen(AUTH_PORT, () => {
  console.log(`Auth Service is running on port ${AUTH_PORT}`);
});

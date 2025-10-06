const mongoose = require("mongoose");

const Schema = mongoose.Schema;
let User = new Schema({
  _id: Object,
  firstName: String,
  lastName: String,
  username: String,
  password: String,
  email: String,
  uniqueCitizenNumber: String,
  profilePhoto: String,
  placeOfBirth: Object,
  placeOfResidence: Object,
  schools: Array,
  departments: Array,
  type: String,
  isVerified: Boolean,
  isApproved: Boolean,
  status: Boolean,
  calendar: Object,
  gradeBook:  Array,
  parent: String,
  children: String,
  verificationCode: String,
  homeroomDepartment: String,
  verificationCodeExpires: { type: Date, index: { expires: "24h" } },
  createdAt: { type: Date, default: Date.now },
});

const user = mongoose.model("User", User, "users");
module.exports = user;

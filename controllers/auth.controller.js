require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User.js");
const MailController = require("../../mail-service/controller/mail.controller");
const {
  baseURL,
  MAIL_PORT,
  SCHOOL_PORT,
  USER_MANAGMENT_PORT,
} = require("../../../common/constants.js");
const fetch = require("node-fetch");
const generator = require("generate-password");
const jwt = require("jsonwebtoken");
const bcrypt = require('bcrypt');

class UserController {
  login = async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await User.findOne({ username });
      if (!user) {
        return res.status(200).json({ message: "INVALID_CREDENTIAL" });
      }
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(200).json({ message: "INVALID_CREDENTIAL" });
      }
      if (!user.isVerified) {
        return res.status(200).json({ message: "USER_NOT_VERIFIED" });
      }
      if (!user.isApproved) {
        return res.status(200).json({ message: "USER_NOT_APPROVED" });
      }
      if (user.type === 'PARENT') {
        user.children = await User.findById(new mongoose.Types.ObjectId(user.children)) || null;
      }
      if (user.type === 'STUDENT') {
        user.parent = await User.findById(new mongoose.Types.ObjectId(user.parent)) || null;
      }
      const token = jwt.sign(
        { id: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: "10h" }
      );
      return res
        .status(200)
        .cookie("token", token, { httpOnly: true })
        .json({ message: "LOGIN_SUCCESS", user });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
    }
  };

  generatePassword = () => {
    return generator.generate({
        length: 16,
        numbers: true,
        symbols: true,
        uppercase: true,
        lowercase: true,
        strict: true,
        exclude: `"'` + "`",
      });
  }

  registration = async (req, res) => {
    try {
      const { isAdminRegistration, user } = req.body;
      const userId = new mongoose.Types.ObjectId();
      const plainPassword = this.generatePassword();
      user.password = await bcrypt.hash(
        plainPassword,
        Number(process.env.SALT_ROUNDS)
      );
      if (user.type === "STUDENT") {
        const response = await fetch(
          `${baseURL}${SCHOOL_PORT}/departments/getDepartmentSubjects?id=${encodeURIComponent(
            user.departments[0]
          )}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );
        const subjects = await response.json();
        const emptyGrades = subjects.map((subject) => ({
          name: subject.subjectName,
          grades: [],
        }));
        user.gradeBook = [emptyGrades, emptyGrades];
        console.log(userId);
        const mailServiceResponse = await fetch(
          `${baseURL}${MAIL_PORT}/mail/sendParentRegistrationMail`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: user.email,
              username: user.username,
              userId: userId,
            }),
          }
        );
        await mailServiceResponse.json();
      }
      const newUser = await User.create({
        ...user,
        isApproved: isAdminRegistration || !!user.children,
        isVerified: true,
        _id: userId,
      });
      if (newUser.type === "PARENT") {
        const children = {
          _id: newUser.children,
          parent: newUser._id.toString(),
        };
        await fetch(
          `${baseURL}${USER_MANAGMENT_PORT}/userManagment/updateUser`,
          {
            method: "POST",
            body: JSON.stringify({
              user: children,
            }),
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      if (user.schools) {
        const schoolServiceResponse = await fetch(
          `${baseURL}${SCHOOL_PORT}/schools/addUser`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              schools: user.schools,
              departments: user.departments,
              userType: user.type,
              userId: userId
            }),
          }
        );
        await schoolServiceResponse.json();
      }
      setTimeout(async () => {
        const mailServiceResponse = await fetch(
          `${baseURL}${MAIL_PORT}/mail/sendTemporaryPasswordMail`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: user.email,
              username: user.username,
              password: plainPassword,
            }),
          }
        );
        const mailMessage = await mailServiceResponse.json();
        return res.status(201).json(mailMessage);
      }, 1000);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
    }
  };

  generateVerificationCode = async (req, res) => {
    try {
      const verificationCode = Math.floor(100000 + Math.random() * 900000);
      const verificationCodeExpires = Date.now() + 10 * 60 * 1000;
      const { email } = req.body;
      const { _id } = await User.findOne({ email }).select("_id");
      const updatedUser = await User.findByIdAndUpdate(
        _id,
        { $set: { verificationCode, verificationCodeExpires } },
        { new: true }
      );
      if (!updatedUser)
        return res.status(500).json({ message: "SERVER_ERROR" });

      const mailServiceResponse = await fetch(
        `${baseURL}${MAIL_PORT}/mail/sendVerificationCodeMail`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email,
            username: updatedUser.username,
            verificationCode: verificationCode,
          }),
        }
      );
      const mailMessage = await mailServiceResponse.json();
      return res.status(200).json(mailMessage);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "SERVER_ERROR" });
    }
  };

  validateVerificationCode = async (req, res) => {
    try {
      const { email, code } = req.body;
      const user = await User.findOne({ email });
      console.log(user.verificationCode.toString());
      if (user.verificationCode.toString() !== code) {
        return res.status(200).json({ message: "VERIFICATION_CODE_INVALID" });
      }
      return res.status(200).json({ message: "VERIFICATION_CODE_VALID" });
    } catch (error) {
      return res.status(500).json({ message: "SERVER_ERROR" });
    }
  };

  resetPassword = async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      user.password = password;
      await user
        .save()
        .then((_) => res.json({ message: "PASSWORD_RESET_SUCCESSFULLY" }))
        .catch((error) => console.log(error));
    } catch (error) {
      return res.status(500).json({ message: "SERVER_ERROR" });
    }
  };

  skipLogin = async (req, res) => {
    const { username } = req.body;
    const user = await User.findOne({ username });
    if (!user || !user.isVerified || !user.isApproved) {
      return res.status(401).json({ message: "UNAUTHORIZED_USER" });
    }
    return res.json({ message: "LOGIN_SUCCESS", user });
  };
}

// refactored
/**
 
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User.js");
const MailController = require("../../mail-service/controller/mail.controller");
const {
  baseURL,
  MAIL_PORT,
  SCHOOL_PORT,
  USER_MANAGMENT_PORT,
} = require("../../../common/constants.js");
const fetch = require("node-fetch");
const generator = require("generate-password");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

class UserController {
  login = async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await User.findOne({ username });
      if (!user) {
        return res.status(200).json({ message: "INVALID_CREDENTIAL" });
      }
      const isPasswordValid = user.password === password;
      if (!isPasswordValid) {
        return res.status(200).json({ message: "INVALID_CREDENTIAL" });
      }
      if (!user.isApproved) {
        return res.status(200).json({ message: "USER_NOT_APPROVED" });
      }
      if (user.type === "PARENT") {
        user.children =
          (await User.findById(new mongoose.Types.ObjectId(user.children))) ||
          null;
      }
      if (user.type === "STUDENT") {
        user.parent =
          (await User.findById(new mongoose.Types.ObjectId(user.parent))) ||
          null;
      }
      const token = jwt.sign(
        { id: user.id, username: user.username, type: user.type },
        process.env.JWT_SECRET,
        { expiresIn: "10h" }
      );
      return res
        .status(200)
        .cookie("token", token, { httpOnly: true })
        .json({ message: "LOGIN_SUCCESS", user });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
    }
  };

  generatePassword = () => {
    return generator.generate({
      length: 16,
      numbers: true,
      symbols: true,
      uppercase: true,
      lowercase: true,
      strict: true,
      exclude: `"'` + "`",
    });
  };

  sendParentRegistrationMail = async (user) => {
    const mailServiceResponse = await fetch(
      `${baseURL}${MAIL_PORT}/mail/sendParentRegistrationMail`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          username: user.username,
          userId: user._id,
        }),
      }
    );
    await mailServiceResponse.json();
  };

  sendTemporaryPasswordMail = async (user) => {
    const mailServiceResponse = await fetch(
      `${baseURL}${MAIL_PORT}/mail/sendTemporaryPasswordMail`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          username: user.username,
          password: user.password,
        }),
      }
    );
    return await mailServiceResponse.json();
  };

  createGradeBook = async (user) => {
    const response = await fetch(
      `${baseURL}${SCHOOL_PORT}/departments/getDepartmentSubjects?id=${encodeURIComponent(
        user.departments[0]
      )}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );
    const subjects = await response.json();
    const emptyGrades = subjects.map((subject) => ({
      name: subject.subjectName,
      grades: [],
    }));
    return [emptyGrades, emptyGrades];
  };

  updateChild = async (child) => {
    await fetch(`${baseURL}${USER_MANAGMENT_PORT}/userManagment/updateUser`, {
      method: "POST",
      body: JSON.stringify({
        user: child,
      }),
      headers: { "Content-Type": "application/json" },
    });
  };

  addUserToSchools = async (user) => {
    const schoolServiceResponse = await fetch(
      `${baseURL}${SCHOOL_PORT}/schools/addUser`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schools: user.schools,
          departments: user.departments,
          userType: user.type,
          userId: userId,
        }),
      }
    );
    await schoolServiceResponse.json();
  };

  registration = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { isAdminRegistration, user } = req.body;
      const userId = new mongoose.Types.ObjectId();
      const plainPassword = this.generatePassword();

      user.password = await bcrypt.hash(
        plainPassword,
        Number(process.env.SALT_ROUNDS)
      );

      if (user.type === "STUDENT") {
        user.gradeBook = await this.createGradeBook(user);
        await this.sendParentRegistrationMail(user);
      }

      const newUser = await User.create(
        [
          {
            ...user,
            isApproved: isAdminRegistration || !!user.children,
            isVerified: true,
            _id: userId,
          },
        ],
        { session }
      );

      if (newUser[0].type === "PARENT") {
        await this.updateChild(
          { _id: newUser[0].children, parent: newUser[0]._id.toString() },
          session
        );
      }

      if (user.schools) await this.addUserToSchools(user, session);
      const mailMessage = await this.sendTemporaryPasswordMail(user);
      await session.commitTransaction();
      session.endSession();

      return res.status(201).json(mailMessage);
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error(error);
      return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
    }
  };

  generateVerificationCode = async (req, res) => {
    try {
      const verificationCode = Math.floor(100000 + Math.random() * 900000);
      const verificationCodeExpires = Date.now() + 10 * 60 * 1000;
      const { email } = req.body;
      const { _id } = await User.findOne({ email }).select("_id");
      const updatedUser = await User.findByIdAndUpdate(
        _id,
        { $set: { verificationCode, verificationCodeExpires } },
        { new: true }
      );
      if (!updatedUser)
        return res.status(500).json({ message: "SERVER_ERROR" });

      const mailServiceResponse = await fetch(
        `${baseURL}${MAIL_PORT}/mail/sendVerificationCodeMail`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email,
            username: updatedUser.username,
            verificationCode: verificationCode,
          }),
        }
      );
      const mailMessage = await mailServiceResponse.json();
      return res.status(200).json(mailMessage);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "SERVER_ERROR" });
    }
  };

  validateVerificationCode = async (req, res) => {
    try {
      const { email, code } = req.body;
      const user = await User.findOne({ email });
      console.log(user.verificationCode.toString());
      if (user.verificationCode.toString() !== code) {
        return res.status(200).json({ message: "VERIFICATION_CODE_INVALID" });
      }
      return res.status(200).json({ message: "VERIFICATION_CODE_VALID" });
    } catch (error) {
      return res.status(500).json({ message: "SERVER_ERROR" });
    }
  };

  resetPassword = async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      user.password = password;
      await user
        .save()
        .then((_) => res.json({ message: "PASSWORD_RESET_SUCCESSFULLY" }))
        .catch((error) => console.log(error));
    } catch (error) {
      return res.status(500).json({ message: "SERVER_ERROR" });
    }
  };

  skipLogin = async (req, res) => {
    const { username } = req.body;
    const user = await User.findOne({ username });
    if (!user || !user.isVerified || !user.isApproved) {
      return res.status(401).json({ message: "UNAUTHORIZED_USER" });
    }
    return res.json({ message: "LOGIN_SUCCESS", user });
  };
}

module.exports = UserController;


*/

module.exports = UserController;

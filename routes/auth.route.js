const express = require("express");
const UserController = require("../controllers/auth.controller");
const userRouter = express.Router();

userRouter
  .route("/login")
  .post((req, res) => new UserController().login(req, res));

userRouter
  .route("/signup")
  .post((req, res) => new UserController().signup(req, res));

userRouter
  .route("/generateVerificationCode")
  .post((req, res) => new UserController().generateVerificationCode(req, res));

userRouter
  .route("/validateVerificationCode")
  .post((req, res) => new UserController().validateVerificationCode(req, res));

userRouter
  .route("/resetPassword")
  .post((req, res) => new UserController().resetPassword(req, res));

userRouter
  .route("/createUser")
  .post((req, res) => new UserController().registration(req, res));

userRouter
  .route("/skipLogin")
  .post((req, res) => new UserController().skipLogin(req, res));

module.exports = userRouter;

const fs = require("fs");
const express = require("express");
const multer = require("multer");
const path = require("path");
const { google } = require("googleapis");

const port = 5000;
const app = express();

var name;
var pic;
var authorized = false;

const GOOGLE_CLIENT_ID =
  "434044807901-rmrri0k1kqspigdgqp49q84r7buo83ue.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "-rtfWGRO7qtvimMS5z4nnroS";
const GOOGLE_REDIRECT_URL = "http://localhost:5000/google/callback";

const oAuth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URL
);

const GOOGLE_SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile";

app.get("/", (req, res) => {
  if (!authorized) {
    var url = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: GOOGLE_SCOPES,
    });
    console.log(url);
    res.render("index", { url: url });
  } else {
    var oauth2 = google.oauth2({
      auth: oAuth2Client,
      version: "v2",
    });
    oauth2.userinfo.get(function (err, response) {
      if (err) {
        console.log(err);
      } else {
        console.log(response.data);
        name = response.data.name;
        pic = response.data.picture;
        res.render("fileUpload", {
          name: response.data.name,
          pic: response.data.picture,
          success: false,
        });
      }
    });
  }
});

app.get("/google/callback", function (req, res) {
  const code = req.query.code;
  if (code) {
    oAuth2Client.getToken(code, function (err, tokens) {
      if (err) {
        console.log("Error authenticating");
        console.log(err);
      } else {
        console.log("Successfully authenticated");
        console.log(tokens);
        oAuth2Client.setCredentials(tokens);
        authorized = true;
        res.redirect("/");
      }
    });
  }
});

app.get("/google/logout", (req, res) => {
  authorized = false;
  res.redirect("/");
});

var Storage = multer.diskStorage({
  destination: function (req, file, callback) {
    callback(null, "./images");
  },
  filename: function (req, file, callback) {
    callback(null, file.fieldname + "_" + Date.now() + "_" + file.originalname);
  },
});

var upload = multer({
  storage: Storage,
}).single("file");

app.post("/upload", (req, res) => {
  upload(req, res, function (err) {
    if (err) {
      console.log(err);
      return res.end("Something went wrong");
    } else {
      console.log(req.file.path);
      const drive = google.drive({ version: "v3", auth: oAuth2Client });
      const fileMetadata = {
        name: req.file.filename,
      };
      const media = {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(req.file.path),
      };
      drive.files.create(
        {
          resource: fileMetadata,
          media: media,
          fields: "id",
        },
        (err, file) => {
          if (err) {
            console.error(err);
          } else {
            fs.unlinkSync(req.file.path);
            res.render("fileUpload", { name: name, pic: pic, success: true });
          }
        }
      );
    }
  });
});

// app run on port 5000
app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
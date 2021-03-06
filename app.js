const fs = require("fs");
const express = require("express");
const multer = require("multer");
const path = require("path");
const { google } = require("googleapis");

const passport = require("passport");
const session = require("express-session");
const OAuth2Data = require("./credentials.json");
const User = require("./models/User");

const facebookStrategy = require("passport-facebook").Strategy;

const port = 5000;
const app = express();

app.use(session({ secret: OAuth2Data.web_facebook.secret }));
app.use(passport.initialize());
app.use(passport.session());

var name;
var pic;
var authorized = false;

/*
  Google oAuth authorization
*/
const GOOGLE_CLIENT_ID = OAuth2Data.web.client_id;
const GOOGLE_CLIENT_SECRET = OAuth2Data.web.client_secret;
const GOOGLE_REDIRECT_URL = OAuth2Data.web.redirect_uris[0];

const oAuth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URL
);

// web client scopes
const GOOGLE_SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile";

app.set("views", path.join(__dirname, "/frontend/views"));
app.use(express.static(path.join(__dirname, "frontend")));
app.set("view engine", "ejs");

// google user authorization
app.get("/", (req, res) => {
  if (!authorized) {
    // generate authorization url
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
    // get authorized user informations
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

// get access token
// callback
app.get("/google/callback", function (req, res) {
  const code = req.query.code;
  if (code) {
    // get access token
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

// google logout
app.get("/google/logout", (req, res) => {
  authorized = false;
  res.redirect("/");
});

// set upload image store path
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

// upload file to google drive
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

passport.use(
  new facebookStrategy(
    {
      clientID: OAuth2Data.web_facebook.client_id,
      clientSecret: OAuth2Data.web_facebook.client_secret,
      callbackURL: OAuth2Data.web_facebook.redirect_uris,
      profileFields: [
        "id",
        "displayName",
        "name",
        "gender",
        "picture.type(large)",
        "email",
      ],
    },

    function (token, refreshToken, profile, done) {
      process.nextTick(function () {
        User.findOne({ uid: profile.id }, function (err, facebook_user) {
          if (err) return done(err);
          if (facebook_user) {
            console.log("facebook user found");
            console.log(facebook_user);
            return done(null, facebook_user);
          } else {
            var newFacebookUser = new User();
            newFacebookUser.uid = profile.id;
            newFacebookUser.token = token;
            newFacebookUser.name =
              profile.name.givenName + " " + profile.name.familyName;
            newFacebookUser.email = profile.emails[0].value;
            newFacebookUser.gender = profile.gender;
            newFacebookUser.pic = profile.photos[0].value;
            newFacebookUser.save(function (err) {
              if (err) throw err;
              return done(null, newFacebookUser);
            });
          }
        });
      });
    }
  )
);

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

app.get("/facebook/profile", isLoggedIn, function (req, res) {
  console.log(req.user);
  res.render("facebookProfile", {
    user: req.user,
  });
});

app.get("/facebook/logout", function (req, res) {
  req.logout();
  res.redirect("/");
});

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/facebook");
}

app.get(
  "/auth/facebook",
  passport.authenticate("facebook", { scope: "email" })
);

app.get(
  "/facebook/callback",
  passport.authenticate("facebook", {
    successRedirect: "/facebook/profile",
    failureRedirect: "/",
  })
);

app.get("/", (req, res) => {
  res.render("index");
});

// app run on port 5000
app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});

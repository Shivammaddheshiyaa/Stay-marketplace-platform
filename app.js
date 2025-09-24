require('dotenv').config();

const express = require("express");
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const session = require("express-session");
const MongoStore = require('connect-mongo');
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");


const listingRouter = require("./routes/listing.js");
const reviewsRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");

const dbUrl = process.env.ATLASDB_URL;
mongoose.connect(dbUrl, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log("Connected to MongoDB");
})
.catch(err => {
  console.error("DB connection error:", err);
});

const app = express();

app.engine('ejs', ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));

// session & flash
const store = MongoStore.create({
  mongoUrl: dbUrl,
  crypto: { secret: process.env.SECRET },
  touchAfter: 24*3600
});
store.on("error", err => {
  console.log("Session store error:", err);
});
const sessionOptions = {
  store,
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    maxAge: 7*24*60*60*1000, // 7 days
    expires: Date.now() + 7*24*60*60*1000
  }
};
app.use(session(sessionOptions));
app.use(flash());

// passport setup
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
});

// Razorpay setup
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Routes

// home route
app.get("/", (req, res) => {
  res.redirect("/listings");
});

// show booking page
app.get("/booking", (req, res) => {
  // you might send extra data needed (e.g., room prices etc)
  res.render("booking");  
});

// create order (called from client via fetch)
app.post("/create-order", async (req, res) => {
  try {
    const amountINR = Number(req.body.amount);
    if (!amountINR || amountINR <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    const options = {
      amount: Math.round(amountINR * 100), // paise
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
      payment_capture: 1
    };
    const order = await razorpay.orders.create(options);
    // send order info + key id
    res.json({ order, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error("Error in /create-order:", err);
    res.status(500).json({ error: "Could not create order" });
  }
});

// verify payment (called from client after payment completes)
app.post("/verify-payment", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ status: "failure", error: "Missing payment info" });
  }
  const generated_signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest('hex');

  if (generated_signature === razorpay_signature) {
    // Payment verified successfully
    return res.json({ status: "success" });
  } else {
    return res.status(400).json({ status: "failure", error: "Invalid signature" });
  }
});

//  other routers
app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewsRouter);
app.use("/", userRouter);

// error handling
app.use((err, req, res, next) => {
  const { statusCode = 500, message = "Oh no, something went wrong!" } = err;
  res.status(statusCode).render("error", { message });
});

const port = process.env.PORT || 8080;
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});

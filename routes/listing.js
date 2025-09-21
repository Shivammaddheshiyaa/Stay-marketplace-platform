const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { listingSchema } = require("../schema.js")
const ExpressError = require("../utils/ExpressError.js")
const Listing = require("../models/listing.js");
const {isLoggedIn, isOwner} = require("../middleware.js");
const multer = require('multer')
const {storage} = require("../cloudConfig.js");
const upload = multer({storage})
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken});


const validateListing = (req, res, next) => {
    let { error } = listingSchema.validate(req.body);

    if (error) {
        throw new ExpressError(404, error);
    } else {
        next();
    }
};

router.get("/", async (req, res) => {
 let {q} = req.query;
  if(q){
   let searchListings = await Listing.find({ location: { $regex: q, $options: "i" } });

   if(searchListings.length>0){
     res.render("listings/index.ejs" , {allListings : searchListings});
   }
   else{
    let allListings = await Listing.find();
   res.render("listings/index.ejs" , {allListings})
   }
  }
  else{
   let allListings = await Listing.find();
   res.render("listings/index.ejs" , {allListings})
  }
});

router.get('/booking',isLoggedIn, async(req, res) => {
 res.render("listings/booking.ejs");
});

//new route

router.get("/new", isLoggedIn, (req, res) => {
   
    res.render("listings/new.ejs");
});




//showroute
router.get("/:id", async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id).populate({ path:"reviews", populate:{path:"author",},}).populate("owner");
    // if(!listing){
    // req.flash("error", "listing you requested does not exist!");
    //   res.redirect("/listings");
    // }
    console.log(listing);
    
    res.render("listings/show.ejs", { listing });

});

//creating 

router.post("/",isLoggedIn, upload.single('listing[image]'), wrapAsync(async (req, res, next) => {
    // let {title, description, image, price, country, location} = req.body;

    if (!req.body.listing) {
        throw new ExpressError(400, "send valid data");
    }

    let response = await geocodingClient.forwardGeocode({
    query: req.body.listing.location,
    limit: 1,
  })
    .send();

    let url = req.file.path;
    let filename = req.file.filename;
    const newListing = new Listing(req.body.listing);
    req.flash("success", "New Listing Created");
    newListing.owner = req.user._id;
    newListing.image = {url, filename};

    newListing.geometry =response.body.features[0].geometry;
     let savedListing = await newListing.save();
     console.log(savedListing);
     
    res.redirect("/listings");
})
);


//edit    

router.get("/:id/edit",isLoggedIn,isOwner, wrapAsync(async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    res.render("listings/edit.ejs", { listing });
}));

//update

router.put("/:id", isLoggedIn, isOwner, upload.single('listing[image]'), wrapAsync(async (req, res) => {
    if (!req.body.listing) {
        throw new ExpressError(400, "send valid data");
    }

    let { id } = req.params;
    let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing }, { new: true });


    if (req.body.listing.location) {
        let response = await geocodingClient.forwardGeocode({
            query: req.body.listing.location,
            limit: 1,
        }).send();

        listing.geometry = response.body.features[0].geometry;
    }

    if (typeof req.file !== "undefined") {
        let url = req.file.path;
        let filename = req.file.filename;
        listing.image = { url, filename };
    }

    await listing.save();
    req.flash("success", "Listing updated successfully!");
    res.redirect(`/listings/${id}`);
}));



//delete
router.delete("/:id",isLoggedIn,isOwner, wrapAsync(async (req, res) => {
    let { id } = req.params;
    let deleteListing = await Listing.findByIdAndDelete(id);
    
    req.flash("success", "Listing Deleted!!");

    res.redirect("/listings");
}));

module.exports = router;
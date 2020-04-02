const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');


// Imports the Google Cloud client library and create the client
const vision = require('@google-cloud/vision');
const gcp_client = new vision.ImageAnnotatorClient();

// Import the Firestore library and initialize the object
const Firestore = require('@google-cloud/firestore');
const db = new Firestore({
  projectId: config.gcp_project_id,
  keyFilename: config.gcp_key_file_path
});

const app = express();
// define expres middleware
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// define the static folder route for our css and image files
app.use(express.static('static'));

// Set the cors proxy middleware for express
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});


// ###########################################################################
// ---------------------------------------------------------------------------
// ##################### APPLICATION ROUTES AND LOGIC ########################
// ---------------------------------------------------------------------------
// ###########################################################################


app.get('/', (req, res) => {
  // generate the token and render the response to the user first
  let unique_token = uuid.v4();
  let gen_time = new Date();
  res.render('pages/home', {token: unique_token});
  // now store the token in firestore
  let docRef = db.collection('api_tokens').doc(unique_token);
  let insert_token = docRef.set({
    date: gen_time,
    timestamp: gen_time.getTime(),
    max_age: config.api_token_ttl * 60000,
    usage: 0
  });
})


app.get('/get_video/:video_id', async (req, res) => {
  // first we make the get_info api request to get the various streaming links
  // define an anonymus function that will wrap the request call in a promise
  get_video_info = (video_id) => {
    return new Promise((resolve, reject) => {
      request(
        { url: "https://www.youtube.com/get_video_info?video_id=" + video_id },
        (error, response, body) => {
          if (error || response.statusCode !== 200) {
            reject("info api call failed")
          } else {
            resolve(body);
          }
        })
    })
  }

  // call the function with the given video id and send a status 500 if the promise got rejected
  var vid_info;
  try {
    vid_info = await get_video_info(req.params.video_id);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ type: 'error', message: error.message });
  }
  
  vid_info = new URLSearchParams(vid_info);
  let vid_streams = JSON.parse(vid_info.get("player_response"));
  let def_stream = vid_streams.streamingData.formats[1].url;

  // we  make the call for the video using the double pipe so that its basically
  // the same as calling the original but w/o the CORS
  const x = request(def_stream);
  req.pipe(x);
  x.pipe(res);
})


app.post('/reverse_search', async (req, res) => {
  read_image_from_req = () => {
    return new Promise((resolve, reject) => {
      var image_chunks = [];
      req.on('readable', function () {
        let image_src = req.read();
        if (image_src === null) {
          resolve(image_chunks);
        } else {
          image_chunks.push(image_src);
        }
      })
    })
  }

  // wait on the function that will read the img from the request and resolve with an array of buffers
  let img_buffers = await read_image_from_req();
  let img_src = Buffer.concat(img_buffers);

  // Set the request object to get the info we need from cloud vision
  const request = {
    image: {
      content: img_src
    },
    features: [
      {
        type: "WEB_DETECTION"
      },
      {
        type: "LABEL_DETECTION"
      }
    ]
  };

  // call the cloud vision api
  const [result] = await gcp_client.annotateImage(request);
  // return the vision api call straight to the browser
  res.send(result);
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`listening on ${PORT}`));

/**
 * security 1:=  generate a unique key for each get on '/' and set that as the query param for image search api call. validate the incoming key param on image search route against the generated set of keys
 *
 * caching 1:=  video id: streaming link -> to prevent making the get infor api call repeatedly. will work for the same user skipping ahead or multiple users uaing same video
 * caching 2:=  implement the persistent key storage from secutity 1 ;; this will also need a cache expiration so the same key cant be used many times
 *
 * optimization 1:=  DONE - replaced with URLsearchparams  lines 65:76 copied from online to parse bodies, but should not be needed now that we have body parser enabled in express
 * optimization 2:=  line 79 remove the harcoded values/json paths and make it acutally based on response values and stream quality */

 // export GOOGLE_APPLICATION_CREDENTIALS="/mnt/c/Users/Saad/Desktop/projects/youtube_lu/my_server/key.json"
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const uuid = require('uuid')

const config = {
  gcp_project_id: 'plasma-buckeye-268306',
  gcp_key_file_path: '/mnt/c/Users/Saad/Desktop/projects/youtube_lu/my_server/key.json',
  api_token_ttl_secs: 30 * 60, // 30 mins * 60 secs/min
  api_token_limit: 3
}

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
  res.render('pages/home', { token: unique_token });
  // now store the token in firestore
  let docRef = db.collection('api_tokens').add({
    token: unique_token,
    creation_time: Firestore.Timestamp.now(),
    expiry_seconds: config.api_token_ttl_secs,
    usage: 0,
    valid: true
  });
})

function retrieve_video_link(video_id) {
  return new Promise((resolve, reject) => {
    request(
      { url: "https://www.youtube.com/get_video_info?video_id=" + video_id },
      (error, response, body) => {
        if (error || response.statusCode !== 200) {
          reject({ status: 500, message: "info api call failed" });
        } else {
          // the api call was successfull so now we can parse the response
          let vid_info = new URLSearchParams(body);
          let vid_streams = JSON.parse(vid_info.get("player_response"));
          result = {
            video_id: video_id,
            stream_link: vid_streams.streamingData.formats[1].url,
            // -10 to leave some room for the time between origin server expires field creation vs when mine
            expires_in_seconds: vid_streams.streamingData.expiresInSeconds - 10
          }
          resolve(result);
        }
      })
  })
}

function get_video_link(video_id) {
  return new Promise((resolve, reject) => {
    let video_coll = db.collection('video_links').where('video_id', '==', video_id).where('valid', "==", true);
    video_coll.get()
      .then((snapshot) => {
        // check if the query returned a document and if it didnt then it was we need to make api call
        if (snapshot.empty) {
          resolve({ vid_info: retrieve_video_link(video_id), doc_ref: null, cached: false });
        } else {
          // if the request is valid then we will keep the document reference and update its values to reflect this request
          snapshot.forEach(document => {
            // validate this document TODO possible take out of loop / design choice?
            if (document.data().expiry_seconds * 1000 + document.data().creation_time.toMillis() <= Date.now()) { // TODO FIX EXPIRY CHECK
              resolve({ vid_info: retrieve_video_link(video_id), doc_ref: document.ref, cached: true, cache_valid: false });
            } else {
              resolve({ vid_info: document.data(), doc_ref: document.ref, cached: true, cache_valid: true });
            }
          });
        }
      })
  })
}

app.get('/get_video', async (req, res) => {
  // TODO deal wit hrejection values of the rpmimses
  let stream_info = await get_video_link(req.query.video_id);
  let def_stream = await stream_info.vid_info;

  // we  make the call for the video using the double pipe so that its basically
  // the same as calling the original but w/o the CORS
  const x = request(def_stream.stream_link);
  req.pipe(x);
  x.pipe(res);

  // after we make whatever request we need, update the database caches
  if (!stream_info.cached || !stream_info.cache_valid) {
    // if this was the case of an expired cache we need to set that to invalid
    if (stream_info.doc_ref != null) {
      stream_info.doc_ref.update({
        valid: false,
      })
    }
    // the cache was invalidated so we need to add this new data to our database
    db.collection('video_links').add({
      video_id: req.query.video_id,
      stream_link: def_stream.stream_link,
      creation_time: Firestore.Timestamp.now(),
      expiry_seconds: def_stream.expires_in_seconds,
      associated_tokens: [
        req.query.token
      ],
      valid: true
    })
  } else {
    // there is a valid existing cache for this video's streaming link
    // all i need to do is add this token to the list of tokens on the preexisting document
    let token_union = stream_info.doc_ref.update({
      associated_tokens: Firestore.FieldValue.arrayUnion(req.query.token)
    });
  }
})


function validate_user_token(user_token) {
  // this function uses a returned promise that is waited on by the caller because db call operation is asynchronous
  return new Promise((resolve, reject) => {
    // try to retrieve a document of the given id but if it fails respond with status 500
    let tokens = db.collection('api_tokens').where('token', '==', user_token).where('valid', "==", true);
    tokens.get()
      .then((snapshot) => {
        // check if the query returned a document and if it didnt then it was an invalid token
        if (snapshot.empty) {
          reject({ status: 403, message: "invalid request" });
        } else {
          // if the request is valid then we will keep the document reference and update its values to reflect this request
          snapshot.forEach(document => {
            // once i get document then i check if it is valid or not
            let update_obj = {};
            let doc_data = document.data();
            let reject = false;

            // after evaluating this request if the time has expired or we hit the rate limit then we set validity of token to false
            if (doc_data.expiry_seconds * 1000 + doc_data.creation_time.toMillis() <= Date.now() || doc_data.usage === config.api_token_limit) {
              update_obj['valid'] = false;
              reject = true;
            } else {
              update_obj['usage'] = Firestore.FieldValue.increment(1)
              // if the current value is one less than limit then we can label it invalid ahead of time to save a db read and write
              if (doc_data.usage - 1 === config.api_token_limit) {
                update_obj['valid'] = false
              }
            }
            document.ref.update(update_obj);

            if (reject) {
              reject({ status: 403, message: "expired credentials" });
            } else {
              // i can return in the foreach because the field i fetched on is a uuid
              resolve(document);  // TODO possibly finish the loop before returning although this could be a design choice 
            }
          });
        }
      })
      .catch((error) => {
        reject({ status: 500, message: error.message });
      })
  })
}

app.post('/analyze_image', async (req, res) => {
  read_image_from_req = () => {
    // this function uses a returned promise that the caller waits on because we need to deal with the data that should
    // be accessed via the callback once the event fires
    return new Promise((resolve, reject) => {
      var image_chunks = [];
      // the callback is automatically called any number of times untill all the data has been read so i dont need a loop
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

  let doc = null;
  // call the function to validate the token that was sent before doing anything else
  try {
    doc = await validate_user_token(req.query.token);
  } catch (error) {
    console.error(error);
    return res.status(error.status).json({ type: 'error', message: error.message });
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

  // call the cloud vision api and return the vision api call straight to the browser
  try {
    const [result] = await gcp_client.annotateImage(request);
    res.send(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ type: 'error', message: error.message });
  }

  // TODO now update the screenshot_analyses collection

})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`listening on ${PORT}`));

/**
 * security 1:= DONE generate a unique key for each get on '/' and set that as the query param for image search api call. validate the incoming key param on image search route against the generated set of keys
 *
 * caching 1:=  video id: streaming link -> to prevent making the get infor api call repeatedly. will work for the same user skipping ahead or multiple users uaing same video
 * caching 2:= DONE implement the persistent key storage from secutity 1 ;; this will also need a cache expiration so the same key cant be used many times
 *
 * optimization 1:=  DONE - replaced with URLsearchparams  lines 65:76 copied from online to parse bodies, but should not be needed now that we have body parser enabled in express
 * optimization 2:=  line 79 remove the harcoded values/json paths and make it acutally based on response values and stream quality
 * optimization 3:=  extract nested function definitions to global scope*/

 // export GOOGLE_APPLICATION_CREDENTIALS="/mnt/c/Users/Saad/Desktop/projects/youtube_lu/my_server/key.json"
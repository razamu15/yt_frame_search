const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const uuid = require('uuid')

const config = {
  gcp_project_id: 'plasma-buckeye-268306',
  gcp_key_file_path: '/mnt/c/Users/Saad/Desktop/projects/youtube_lu/my_server/key.json',
  api_token_ttl: 30,
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
  let gen_time = new Date();
  res.render('pages/home', { token: unique_token });
  // now store the token in firestore
  let docRef = db.collection('api_tokens').add({
    token: unique_token,
    date: gen_time,
    expiry: gen_time.getTime() + config.api_token_ttl * 60000,
    usage: 0,
    valid: true
  });
})


app.get('/get_video', async (req, res) => {
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

  // TODO: look at firestore before making api call

  // call the function with the given video id and send a status 500 if the promise got rejected
  var vid_info;
  try {
    vid_info = await get_video_info(req.query.video_id);
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

  // TODO add the streaming data to video_links collection
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
          // i can return in the foreach because the field i fetched on is a uuid
          resolve(document);  // TODO possibly finish the loop before returning although this could be a design choice
        });
      }
    })
    .catch((error) => {
      reject({status: 500, message:error.message});
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

  // call the cloud vision api  TODO -> surround with try catch
  const [result] = await gcp_client.annotateImage(request);
  // return the vision api call straight to the browser
  res.send(result);

  // after we send the response back, we will update our database to reflect this request
  update_obj = {
    'usage': Firestore.FieldValue.increment(1),
  };
  // after evaluating this request if the time has expired or we hit the rate limit then we set validity of token to false
  if (doc.data().expiry <= Date.now() || doc.data().usage == config.api_token_limit - 1) {
    update_obj['valid'] = false
  }
  doc.ref.update(update_obj);
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
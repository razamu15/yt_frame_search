const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const uuid = require('uuid')

const config = {
  //gcp_project_id: 'plasma-buckeye-268306',
  //gcp_key_file_path: '/mnt/c/Users/Saad/Desktop/projects/youtube_lu/my_server/key.json',
  api_token_ttl_secs: 30 * 60, // 30 mins * 60 secs/min
  api_token_limit: 25
}

// Imports the Google Cloud client library and create the client
const vision = require('@google-cloud/vision');
const gcp_client = new vision.ImageAnnotatorClient();

// Import the Firestore library and initialize the object
const Firestore = require('@google-cloud/firestore');
const db = new Firestore();
//  projectId: config.gcp_project_id,
//  keyFilename: config.gcp_key_file_path
//});

const app = express();
// define expres middleware
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// define the static folder route for our css and image files
app.use(express.static('static'));

// app engine deployment setting: https://cloud.google.com/appengine/docs/standard/nodejs/runtime#https_and_forwarding_proxies
app.set('trust proxy', true);

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
  res.render('pages/main', { t: unique_token });
  // now store the token in firestore
  let docRef = db.collection('api_tokens').add({
    token: unique_token,
    creation_time: Firestore.Timestamp.now(),
    expiry_seconds: config.api_token_ttl_secs,
    usage: 0,
    valid: true
  });
})

app.post('/contact_submit', (req, res) => {
  // get the info from the body and pop it into firestore
  let docRef = db.collection('contact_submissions').add({
    token: req.query.token,
    creation_time: Firestore.Timestamp.now(),
    contact_email: req.body.contact_email,
    contact_name: req.body.contact_name,
    contact_text: req.body.contact_text
  });
  res.sendStatus(200);
})

function retrieve_video_link(video_id) {
  return new Promise((resolve, reject) => {
    request(
      { url: "https://www.youtube.com/get_video_info?video_id=" + video_id },
      (error, response, body) => {
        if (error || response.statusCode !== 200) {
          reject({ status: response.statusCode, message: "info api call failed" });
        } else {
          // the api call was successfull so now we can parse the response
          let vid_info = new URLSearchParams(body);

          // we also have to explictly check status inside the response here because invalid params still send 200
          if (vid_info.get("status") === "fail") {
            reject({ status: 422, message: "invalid youtube video id" });
          } else {
            let vid_streams = JSON.parse(vid_info.get("player_response"));

            if (vid_streams.playabilityStatus.status === 'UNPLAYABLE') {
              reject({ status: 415, message: "youtube video not supported" });
            } else {
            
              let link = null;
              // loop through the formats array and get the link
              vid_streams.streamingData.formats.forEach( format_obj => {
                if (format_obj.qualityLabel === "720p" || link === null) {
                  
                  link = format_obj.url;
                  console.log(format_obj.url);
                  // now the format obj can sometimes contain a cipher property which then needs to be parsed again
                  if (format_obj.cipher) {
                    let cipher_obj = new URLSearchParams(format_obj.cipher);
                    link = cipher_obj.get('url') ;
                  }
                }
              })
              
              result = {
                video_id: video_id,
                stream_link: link,
                // -10 to leave some room for the time between origin server expires field creation vs when mine
                expires_in_seconds: vid_streams.streamingData.expiresInSeconds - 10
              }
              resolve(result);
            }
          }
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
            // validate this document          --------TODOP ossible take out of loop / design choice?
            if (document.data().expiry_seconds * 1000 + document.data().creation_time.toMillis() <= Date.now()) {
              resolve({ vid_info: retrieve_video_link(video_id), doc_ref: document.ref, cached: true, cache_valid: false });
            } else {
              resolve({ vid_info: document.data(), doc_ref: document.ref, cached: true, cache_valid: true });
            }
          });
        }
      })
      .catch((error) => {
        reject({ status: 500, message: error.message });
      })
  })
}

app.get('/get_video', async (req, res) => {
  // assert that we have the required query params for this request
  if (!req.query.hasOwnProperty("token") || !req.query.hasOwnProperty("video_id")) {
    return res.sendStatus(400);//.json({ type: 'error', message: "missing required params" });
  }
  // wrap both awaits in the same try catch
  let stream_info;
  let def_stream;
  try {
    stream_info = await get_video_link(req.query.video_id);
    def_stream = await stream_info.vid_info;
    // double check here if for any reason the stream link is null then throw
    if (def_stream.stream_link === null) {
      throw({ status: 415, message: "youtube video not supported" });
    }
  } catch (error) {
    console.error(error);
    return res.sendStatus(error.status);//.json({ type: 'error', message: error.message });
  }

  // we  make the call for the video using the double pipe so that its basically
  // the same as calling the original but w/o the CORS
  const x = request(def_stream.stream_link);
  req.pipe(x)
    .on('response', function(response) {
      console.log("piped response status:", response.statusCode, ", piped response content_length:", response.headers['content-length']);
  });
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
            let expired = false;

            // after evaluating this request if the time has expired or we hit the rate limit then we set validity of token to false
            if (doc_data.expiry_seconds * 1000 + doc_data.creation_time.toMillis() <= Date.now() || doc_data.usage === config.api_token_limit) {
              update_obj['valid'] = false;
              expired = true;
            } else {
              update_obj['usage'] = Firestore.FieldValue.increment(1)
              // if the current value is one less than limit then we can label it invalid ahead of time to save a db read and write
              if (doc_data.usage + 1 === config.api_token_limit) {
                update_obj['valid'] = false;
              }
            }
            document.ref.update(update_obj);

            if (expired) {
              reject({ status: 403, message: "expired credentials" });
            } else {
              // i can return in the foreach because the field i fetched on is a uuid
              resolve(document);  // TODOP possibly finish the loop before returning although this could be a design choice 
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
  // assert that we have the required query params for this request
  if (!req.query.hasOwnProperty("token")) {
    return res.status(400).json({ type: 'error', message: "missing required params" });
  }

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
      },
      {
        type: "LANDMARK_DETECTION"
      },
      {
       type: "OBJECT_LOCALIZATION"
      },
      {
        type: "TEXT_DETECTION"
      },
      {
        type: "LOGO_DETECTION"
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

  // first check if the additional params were given
  if (req.query.hasOwnProperty("video_id") && req.query.hasOwnProperty("screen_ts")) {
    // query the document for the current 
    db.collection("screen_grabs");
    let screen_grabs = db.collection('screen_grabs');
    screen_grabs.where('token', '==', req.query.token).where('video_id', "==", req.query.video_id).get()
      .then((snapshot) => {
        // there is no such document then create it
        if (snapshot.empty) {
          screen_grabs.add({
            token: req.query.token,
            video_id: req.query.video_id,
            time_stamps: [
              req.query.screen_ts
            ]
          });
        } else {
          // ow just update the array with the new timestamp
          snapshot.forEach(document => {
            // validate this document
            document.ref.update({
              time_stamps: Firestore.FieldValue.arrayUnion(req.query.screen_ts)
            });
          });
        }
      })
  }

})

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`listening on ${PORT}`));

 // export GOOGLE_APPLICATION_CREDENTIALS="/mnt/c/Users/Saad/Desktop/projects/youtube_lu/my_server/key.json"
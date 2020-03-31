const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');


// Imports the Google Cloud client library and create the client
const vision = require('@google-cloud/vision');
const gcp_client = new vision.ImageAnnotatorClient();


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
  res.render('pages/home');
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
    console.log(error);
    return res.status(500).json({ type: 'error', message: error.message });
  }
  
  vid_info = new URLSearchParams(vid_info);
  let vid_streams = JSON.parse(vid_info.get("player_response"));

  // define the default stream that will be sent as the video source to our page
  let def_stream = vid_streams.streamingData.formats[1].url;
  console.log(def_stream);

  // now make the CORS proxy request for the video and pipe it to the response
  request(def_stream)
    .on('error', function (error) {
      console.error(error)
    })
    .on('response', function (response) {
      //console.log("\n" + response.statusCode) // 200
      //console.log(response.headers) // 'image/png'
    })
    .pipe(res);
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

  console.log(result);
  console.log("\n");

  // google starter code for printing web annotations
  if (false) {
    const webDetection = result.webDetection;
    if (webDetection.fullMatchingImages.length) {
      console.log(
        `Full matches found: ${webDetection.fullMatchingImages.length}`
      );
      webDetection.fullMatchingImages.forEach(image => {
        console.log(`  URL: ${image.url}`);
        console.log(`  Score: ${image.score}`);
      });
    }

    if (webDetection.partialMatchingImages.length) {
      console.log(
        `Partial matches found: ${webDetection.partialMatchingImages.length}`
      );
      webDetection.partialMatchingImages.forEach(image => {
        console.log(`  URL: ${image.url}`);
        console.log(`  Score: ${image.score}`);
      });
    }

    if (webDetection.webEntities.length) {
      console.log(`Web entities found: ${webDetection.webEntities.length}`);
      webDetection.webEntities.forEach(webEntity => {
        console.log(`  Description: ${webEntity.description}`);
        console.log(`  Score: ${webEntity.score}`);
      });
    }

    if (webDetection.bestGuessLabels.length) {
      console.log(
        `Best guess labels found: ${webDetection.bestGuessLabels.length}`
      );
      webDetection.bestGuessLabels.forEach(label => {
        console.log(`  Label: ${label.label}`);
      });
    }
  }

})

app.get('/vid', (req, res) => {
  const x = request('https://r4---sn-gvbxgn-tt1e7.googlevideo.com/videoplayback?expire=1585718912&ei=H9KDXrSaO4bRwQGhspuYAg&ip=99.227.111.12&id=o-AEjHm5iE7Z-PsWdp3l6OFbpU2ElC2ooycmaha8gA7C9v&itag=22&source=youtube&requiressl=yes&mh=Xa&mm=31%2C26&mn=sn-gvbxgn-tt1e7%2Csn-vgqsrnll&ms=au%2Conr&mv=m&mvi=3&pl=16&initcwndbps=1908750&vprv=1&mime=video%2Fmp4&ratebypass=yes&dur=234.893&lmt=1574983179340582&mt=1585697193&fvip=4&fexp=23882514&c=WEB&txp=5535432&sparams=expire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cvprv%2Cmime%2Cratebypass%2Cdur%2Clmt&sig=ADKhkGMwRQIhAL7x1KHU0DlTDVMIpRiLrJzSSgKoYnP1EYRy_ljsiyoZAiBl6zlDSUc_GW17ctJ_u5KtuP_J-MgvhXbdE1vh9GPmKQ%3D%3D&lsparams=mh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpl%2Cinitcwndbps&lsig=ABSNjpQwRgIhALzoEVssNK1u6RcnjNfLA9R3kSQPPGA6QZuJq8YUY-NSAiEA-myqPJRkl9BZXUKjE5iLXOllFGQSXmJ0_uEG3GpaBds%3D');
  req.pipe(x);
  x.pipe(resp);
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
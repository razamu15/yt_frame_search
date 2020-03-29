const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');

// Imports the Google Cloud client library
const vision = require('@google-cloud/vision');
// Creates a client
const gcp_client = new vision.ImageAnnotatorClient();



const app = express();
// define expres middleware
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// cors proxy middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});



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

  // now define an anonmous funcion that will parse the body of the api response and call it
  parse_body = (body) => {
    var key, keyValPair, keyValPairs, r, val, _i, _len;
    r = {};
    keyValPairs = body.split("&");
    for (_i = 0, _len = keyValPairs.length; _i < _len; _i++) {
      keyValPair = keyValPairs[_i];
      key = decodeURIComponent(keyValPair.split("=")[0]);
      val = decodeURIComponent(keyValPair.split("=")[1] || "");
      r[key] = val;
    }
    return r;
  }
  vid_info = parse_body(vid_info);
  // define the default stream that will be sent as the video source to our page
  let def_stream = JSON.parse(vid_info.player_response).streamingData.formats[1].url;

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


app.get('/reverse_search', async (req, res) => {
  // Set the request object to get the info we need from cloud vision
  const request = {
    image: {
      source: {
        filename: "./demo.png",
      },
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

app.post('/image', (req, res) => {
  // we need to wait for the req to be readable before getting file data
  req.on('readable', function () {
    image_src = req.read();
    console.log(image_src);

    console.log(typeof image_src);

    console.log("\n=====\n");

    console.log(req.body);
    console.log(req.headers);
    //console.log(req.image);
  })

  // res.sendStatus(200);
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`listening on ${PORT}`));






//const fs = require('fs');
// var fild;

    // fs.open("./from_page.png", 'w+', function (err, fd) {
    //   fild = fd;
    //   if (err) {
    //     throw 'could not open file: ' + err;
    //   }
    // });

    // // write the contents of the buffer, from position 0 to the end, to the file descriptor returned in opening our file
    // fs.write(fild, image_src, 0, image_src.length, null, function (err) {
    //   if (err) throw 'error writing file: ' + err;
    //   fs.close(fd, function () {
    //     console.log('wrote the file successfully');
    //   });
    // });
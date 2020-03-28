const express = require('express');
const request = require('request');
const util = require('util');

const app = express();
app.set('view engine', 'ejs');

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
            reject("info api call failes")
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
    console.log(error.message);
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
      console.log("\n" + response.statusCode) // 200
      console.log(response.headers) // 'image/png'
    })
    .pipe(res);
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`listening on ${PORT}`));

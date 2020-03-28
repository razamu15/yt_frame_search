const express = require('express');
const request = require('request');

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


app.get('/cors_proxy/:video_id', async (req, res) => {
  request(
    { url: "https://www.youtube.com/get_video_info?video_id=" + req.params.video_id },
    (error, response, body) => {
      if (error || response.statusCode !== 200) {
        return res.status(500).json({ type: 'error', message: error.message });
      } else {
        //console.log(body);
        res.send(body);
        //return body;
      }

      //console.log(body);
      //console.log("\n@#$@#$@%@#%#%@#%@#%#@%\n@#%$@#%$%##%$#%#$%#%$\n#%$#@%#$%#$%#$%#$%#$%#$%\n");

    })
  return;

});

app.get('/get_video/:video_id', (req, res) => {
  // request(
  //   { url: "https://www.youtube.com/get_video_info?video_id=" + req.params.video_id },
  //   (error, response, body) => {
  //     // get the stream url from the ting
  //     resp = function (body) {
  //       var key, keyValPair, keyValPairs, r, val, _i, _len;
  //       r = {};
  //       keyValPairs = body.split("&");
  //       for (_i = 0, _len = keyValPairs.length; _i < _len; _i++) {
  //         keyValPair = keyValPairs[_i];
  //         key = decodeURIComponent(keyValPair.split("=")[0]);
  //         val = decodeURIComponent(keyValPair.split("=")[1] || "");
  //         r[key] = val;
  //       }
  //       return r;
  //     }
  //     result = resp(body);
  //     let def_stream = JSON.parse(result.player_response).streamingData.formats[1].url;
  //     //request.get(def_stream).pipe(res);
  //   })

  // now make the request for the video
  request("https://r3---sn-gvbxgn-tt1y.googlevideo.com/videoplayback?expire=1585380421&ei=5ad-XrfFFr6Hir4Pl6yx2Ao&ip=99.227.111.12&id=o-APjwxuLmPu0cdsE7dHGLElwCej2PsovtqNfAp1Uk-5Dd&itag=22&source=youtube&requiressl=yes&mh=Bj&mm=31%2C26&mn=sn-gvbxgn-tt1y%2Csn-vgqs7nes&ms=au%2Conr&mv=m&mvi=2&pcm2cms=yes&pl=16&initcwndbps=1656250&vprv=1&mime=video%2Fmp4&ratebypass=yes&dur=397.363&lmt=1585349720037205&mt=1585358726&fvip=3&c=WEB&txp=5432432&sparams=expire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cvprv%2Cmime%2Cratebypass%2Cdur%2Clmt&sig=ADKhkGMwRQIhANjTeBXvEaRBp7w4lA0Ui7owt0apHE4PAGC2c0KSmL0FAiBI64AD0pozs-pC8oNIF-7n1WMJhKmNt5kBJ35tJtW-wg%3D%3D&lsparams=mh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpcm2cms%2Cpl%2Cinitcwndbps&lsig=ABSNjpQwRQIgWT04M86bjxysUKJPpzGIpYE00v9l3DapUfDud--nkZ0CIQD_s3zCb44j0meU4bVgTcCFwqOWxs_s3DmexYftaki9nw%3D%3D")
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

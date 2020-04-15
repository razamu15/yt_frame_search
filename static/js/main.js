// initialize materialize css components
M.AutoInit();

var video_id = null;
var img_blob = null;
var img_ts = null;
var processing = false;
var play_duration = 0;
var vid_duration = 0;
var download_counter = 0;

// if this returns false then your good to go, if it returns true then stop
function check_set_processing() {
    let busy_status = processing;
    processing = true;
    return busy_status;
}

$("#video_form").submit(function (event) {
    // we prevent the form from making a post request
    event.preventDefault();

    if (check_set_processing()) {
        alert("Please wait untill previous action is finished.");
        return;
    }

    // empty the divs and canvas in case content from a previous user action is there
    let canvas = document.getElementById('canvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    $("#analysis_parent_cont").hide();
    $("#canvas_actions").hide();
    $(".analysis_category").empty();

    // get the youtube_url from the form
    let form_data = $(this).serializeArray();
    // the form will only contain one item at index 0
    let url = form_data[0].value
    let video_id = null;
    // the first index after the split will always be domain so we know the second is query params
    dot_be = url.indexOf("youtu.be/");
    if (dot_be != -1) {
        // add 9 to get to the end of the substring youtu.be/ and then 11 for the actual vid id after that
        dot_be += 9;
        video_id = url.substring(dot_be, dot_be + 11);
    } else {
        query_params = new URLSearchParams(url.split("watch?")[1]);
        video_id = query_params.get("v");
    }

    // call the add_video function with the video id parameter retreived from the url
    add_video(video_id);
})

function add_video(youtubeID) {
    // first empty the container in case if there is already a video there
    $("#video_cont").empty();
    // add a video container
    let vid_route_params = new URLSearchParams();
    vid_route_params.set("video_id", youtubeID);
    vid_route_params.set("token", $("#t").data("t"));
    $("#video_cont").append(
        `<video id="video" width="100%" class="responsive-video" src="/get_video?${vid_route_params.toString()}" controls> 
        This browser does not support the HTML5 video element.
    </video>`
    );

    // show the div containing the video element and scroll it into view
    $("#video_cont_parent").show();
    document.getElementById("video").scrollIntoView({behavior: "smooth", block: "start", inline: "nearest"});

    // set an error events listener that will send an alert to the user if something goes wrong
    $("#video").on("error", function (event) {
        alert("Sorry, this video is not supported for playback.");
        $(this).get(0).pause();
    })
    // set event listener to execute on timeupdate. This gets invoked every ~250ms or so
    // use this to accumulate a value and make sure the user is not watching the entire video on the page
    $('#video').on('timeupdate',function() {
        play_duration++;
        if (play_duration === 480) { // 240 for 1 min
            alert("You have been watching for 2 mins. Please note that this app is not intended for watching Youtube videos. If you continue watching you will be redirected in 1 min.");
        } else if (play_duration === 720) {
            alert("You have been watching for 3 mins. Please note that this app is not intended for watching Youtube videos. You will redirected to YouTube now.");
            window.location.replace(`https://youtube.com/watch?v=${video_id}`);
        }
    })

    // set global variable
    video_id = youtubeID;
    // show the capture screenshot controls
    $("#screen_capture_ctrls").show();
    
    processing = false;
}

$("#screen_capture_form").submit(function (event) {
    // stop the form from making a post request
    event.preventDefault();

    if (check_set_processing()) {
        alert("Please wait untill previous action is finished.");
        return;
    }

    // pause the video before we do anything so that the scene doesnt shift
    let video = document.getElementById('video');
    video.pause();

    // empty the analysis div in case content from a previous user action is there
    $("#analysis_parent_cont").hide();
    $(".analysis_category").empty();
    // hide the canvas(in case theres already a canvas there) and show loading for canvas
    $("#canvas_actions").hide();
    $("#loading").show();
    document.getElementById("loading").scrollIntoView({behavior: "smooth", block: "start", inline: "nearest"});

    // get the form input and see which option user picked
    let form_data = $(this).serializeArray();

    let frame_src = form_data.find(function (obj) {
        return obj.name === "frame_source";
    }).value;

    let ts = null;
    // if the capture is by timestamp we need to seek the video to that time
    if (frame_src === "timestamp") {
        // get the timestamp value from the from
        ts = form_data.find(function (obj) {
            return obj.name === "time_stamp";
        }).value;
        // calculate the seconds from the timestamp
        let times = ts.split(":");
        // the parseint calls are safe because of the regex pattern on the timestamp input field
        let total_seconds = 60 * parseInt(times[0]) + parseInt(times[1]);
        // make sure the seek time is the valid range
        if (total_seconds < 0 || total_seconds > video.duration) {
            // alert the user saying timestamp is not valid
            $("#loading").hide();
            alert("Timestamp not valid");
            processing = false;
            return;
        }
        ts = total_seconds;
        video.currentTime = total_seconds;
        // when we capture by timestamp, we need to set an event lsitener that will make the call to draw frame 
        // so we draw the correct frame when the data after the seek has been loaded in the video
        video.addEventListener('canplay', function drawing_event(event) {
            // remove the event listener immediately because we only want to do this once
            video.removeEventListener('canplay', drawing_event);
            draw_frame();
        });
    } else {
        // frame_src === "current"
        draw_frame();
        ts = video.currentTime;
    }
    // set the global timestamp variable
    img_ts = ts;
})

function draw_frame() {
    // get the video and draw its current frame onto the canvas
    let canvas = document.getElementById('canvas');
    let video = document.getElementById('video');
    //let video = document.getElementById('video');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    // convert the image from the canvas to a blob
    canvas.toBlob((blob) => {
        img_blob = blob;
        link = (window.URL ? URL : webkitURL).createObjectURL(blob);
        $("#down_link").attr('href', link);
    });
    // show the download screenshot and reverse search buttons once we have the image drawn
    $("#loading").hide();
    $("#canvas_actions").show();
    document.getElementById("canvas").scrollIntoView({behavior: "smooth", block: "start", inline: "nearest"});

    processing = false;
}

$(".search_btns").click(function (event) {
    if (check_set_processing()) {
        alert("Please wait untill previous action is finished.");
        return;
    }

    // first we check to make sure the image blob in not null
    if (img_blob === null || img_ts === null) {
        alert("You need to capture an image first before analyzing it");
        processing = false;
        return;
    }
    // hide the previous analysis and show the loading sign
    $("#analysis_parent_cont").hide();
    $("#loading").show();
    document.getElementById("loading").scrollIntoView({behavior: "smooth", block: "start", inline: "nearest"});

    // build the query params for the post route
    let analysis_params = new URLSearchParams();
    analysis_params.set("screen_ts", img_ts);
    analysis_params.set("video_id", video_id);
    analysis_params.set("token", $("#t").data("t"));

    // create and send the HTTP request with the image data
    var req = new XMLHttpRequest();
    req.open("POST", "/analyze_image?" + analysis_params.toString(), true);
    req.onload = function (event) {
        // check the response status and if its good pass the results to a function that will show them on the webpage
        if (this.status != 200) {
            alert("Search & Analysis failed. Please reload the page and try again");
            console.error("analysis failed");
            $("#loading").hide();
            processing = false;

        } else {
            render_vision_results(JSON.parse(this.response));
        }
    };
    req.send(img_blob);
})

function show_siblings(btn_elem) {
    $(btn_elem).siblings().show();
}

function add_list_to_markup(elem, obj_array, data_prop, initial_amount) {
    // declare an append counter
    let append_counter = 0;
    let hyperlink;

    if (data_prop === "url") {
        hyperlink = true;
    } else {
        hyperlink = false;
    }

    // for each obj in the array 
    obj_array.forEach(obj => {
        let data = obj[data_prop];
        // if the data is not blank/empty, append the data_prop value from the obj on the dom element
        if (data != "") {
            // show the first n items up to initial amount
            elem.append(`<p ${((append_counter > initial_amount) ? "hidden" : '')}> 
                ${(hyperlink ? `<a href="${data}" target="_blank"> ${data} </a>` : `${data}`)} </p>`);

            // increment the counter
            append_counter++;
        }
    })

    // if append counter > initial_amount then add a show more button that will turn all of the elem's children to show
    if (append_counter > initial_amount) {
        elem.append('<a class="waves-effect waves-teal btn-flat" onclick="show_siblings(this)">show more</a>');
    }
}

function render_vision_results(vision_resp) {
    console.log(vision_resp);
    // first empty the div from any content that may be previously
    $(".analysis_category").empty();
    // show divs that may have been hidden from a previous analysis
    $("#analysis ul li").show();

    // loop over all the properties of the vision response object
    for (var prop in vision_resp) {
        if (Object.prototype.hasOwnProperty.call(vision_resp, prop)) {

            // check if the current property has a div associated to it in the markup

            let elem = $(`li.${prop}`);
            if (elem.length != 0) {

                // if it does then we populate div with data ow hide the div
                if (vision_resp[prop].length === 0) {
                    // hide the div
                    console.log(elem, "should be hidden");
                    elem.hide();
                } else {
                    // populate with data
                    elem = $(`div.${prop}`);
                    // this is the default key for getting data from any category array inside the vision resposne
                    let data_prop = "description";

                    // the element of the same id exists so we can populate it with the data
                    if (prop === "webDetection") {
                        // deal with web detection specially - loop through the 4 subcategories
                        let web_catgs = ["bestGuessLabels", "webEntities", "pagesWithMatchingImages", "visuallySimilarImages"]; // full/partial/MatchingImages
                        let web_catgs_text = {
                            bestGuessLabels: "Best Guess Labels",
                            webEntities: "Web Entities",
                            pagesWithMatchingImages: "Pages With Matching Images",
                            visuallySimilarImages: "Visually Similar Images"
                        };
                        web_catgs.forEach(web_category => {
                            // define speacial data prop
                            if (web_category === "bestGuessLabels") {
                                data_prop = "label";
                            } else if (web_category.includes("Images")) { // the actual images linking things
                                data_prop = "url";
                            } else if (web_category === "webEntities") {
                                data_prop = "description";
                            }

                            // if the subcategory is length 0 then dont do anything
                            if (vision_resp[prop][web_category].length != 0) {
                                elem.append('<h5>' + web_catgs_text[web_category] + '</h5>');
                                let category_div = $("<div>", { id: `${web_category}_cont`, "class": "analysis_subcategory" });
                                elem.append(category_div);
                                // call the function to put the list content into the dom element
                                add_list_to_markup(category_div, vision_resp[prop][web_category], data_prop, 5);
                                // also check to make sure we dont put the devider if this is the last subcategory
                                if (web_catgs.indexOf(web_category) < web_catgs.length - 1) {
                                    elem.append('<div class="divider"></div>');
                                }
                            }
                        })
                    } else {
                        add_list_to_markup(elem, vision_resp[prop], data_prop, 5);
                    }

                }
            }
        }
    }

    // show all the neccessary divs once the info has been loaded
    $("#loading").hide();
    $("#analysis_parent_cont").show();
    document.getElementById("analysis").scrollIntoView({behavior: "smooth", block: "center", inline: "nearest"});
    processing = false;
}

function toggle_ts(radio_ele) {
    if (radio_ele.value === "current" && radio_ele.checked) {
        // clear and disable the time stamp text input field
        $('#time_stamp').val('');
        $('#time_stamp').attr('disabled', true);
    } else if (radio_ele.value === "timestamp" && radio_ele.checked) {
        // enable the time stamp text input field
        $('#time_stamp').attr('disabled', false);
        $('#time_stamp').attr('required', true);
    }
}

$("#contact_form").submit(function (event) {
    // prevent the form from making a post request
    event.preventDefault();
    // get form data and prepare ajax request with it
    let form_data = $(this).serialize();
    console.log(form_data);
    $.post(`/contact_submit?token=${$("#t").data("t")}`, $(this).serialize())
        .done(function (data) {
            // show toast to user
            M.toast({ html: 'Message Delivered' })
        })
})

$("#down_link").on('click', function (event) {
    download_counter++;
    if (download_counter > 10) {
        event.preventDefault();
        $(this).attr("href", "#");
        $(this).removeAttr('download');
        $(this).hide();
        alert("You cannot download more than 10 video frames");
        $(this).off("click");
    }    
})

function scroll_to_features() {
    document.getElementById("features").scrollIntoView({behavior: "smooth", block: "start", inline: "nearest"});
}

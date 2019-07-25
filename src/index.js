
import adapter from "webrtc-adapter";
import Janus from "./janus";
import { useVP8 } from "../config";

const inOutlook = false;

const janusPort = window.location.protocol === "https:" ? "8089" : "8088"
const janusServer = window.location.protocol + "//" + window.location.hostname + ":" + janusPort + "/janus";

const vp9StreamId = 1;
const h264StreamId = 4;
const streamId = useVP8 ? vp9StreamId: h264StreamId;

const selectTimestamp = document.querySelector("#select-timestamp");
const downloadLink = document.querySelector("#download-link");
const videoContainer = document.querySelector("#video-container");

const apiUrl = "/api";

// Last camera selection (front/left/right)
let cameraSelection = "front";

// Handle to Janus connection
let janus = null;

// Handle to streaming plugin
let streaming = null;


//Get list of timestamps available
fetch(apiUrl + "/list").then(async (response) => {
    let timestamps = await response.json();
    timestamps.forEach(timestamp => {
        let option = document.createElement("option");
        option.value = timestamp;
        option.innerHTML = timestamp;
        selectTimestamp.appendChild(option);
    });
}).catch(err => console.log(err));

//Change feed
async function setFeed(timestamp, camera){
    //camera is front, left, or right
    console.log("Setting feed to " + timestamp + " " + camera);
    let videoUrl = "/video/" + timestamp + "/" + camera + "/download.mp4";
    if(inOutlook){
        videoContainer.firstChild.setAttribute("src", videoUrl);
        videoContainer.firstChild.play();
        console.log("Set video source to ".concat(videoUrl));
    }else{
        try{
            await fetch(apiUrl + "/set", {
                method: "post",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({timestamp: timestamp, camera: camera})
            });
        }catch(err){
            console.log("Error when setting feed:");
            console.log(err);
        }
    }
    downloadLink.href = videoUrl;
}

selectTimestamp.addEventListener("change", function(event){
    setFeed(selectTimestamp.value, cameraSelection);
})

document.querySelectorAll("button.set-camera").forEach(button => {
    button.addEventListener("click", function(event){
        cameraSelection = button.value;
        setFeed(selectTimestamp.value, button.value);
        console.log("/video/" + selectTimestamp.value + "/" + button.value + "/download.mp4");
    })
})


// - - - - - - - J A N U S  I N I T I A L I Z A T I O N - - - - - - //
if(!inOutlook){
    Janus.init({
        debug: true,
        dependencies: Janus.useDefaultDependencies({adapter: adapter}),
        callback: function(){
            janus = new Janus({
                server: janusServer,
                success: function(){
                    onSuccess();
                },
                error: function(cause){
                    console.log("Error!");
                    console.log(cause);
                },
                destroyed: function(){
                    console.log("Destroyed!");
                }
            })
        }
    });

    // Request Stream from Janus
    function requestStream(id){
        console.log("Requesting stream with ID " + id)
        var watchBody = {
            request: "watch",
            id: id
        }
        streaming.send({message: watchBody});
    }

    function onSuccess(){
        janus.attach({
            plugin: "janus.plugin.streaming",
            success: function(pluginHandle){
                console.log("Connected to streaming plugin.")

                streaming = pluginHandle;

            requestStream(streamId);
            },
            error: function(cause){

            },
            consentDialog: function(on){

            },
            onmessage: function(msg, jsep){
                console.log("Received message");
                console.log(msg);
                
                if(jsep !== undefined && jsep !== null){
                    console.log("JSEP:");
                    console.log(jsep);
                    let answer = streaming.createAnswer({
                        jsep: jsep,
                        media: {audioSend: false, videoSend: false},
                        success: function(ourjsep){
                            var body = {request: "start"};
                            console.log("Our JSEP:");
                            console.log(ourjsep);
                            streaming.send({message: body, jsep: ourjsep});
                        }
                    });
                }
            },
            onlocalstream: function(stream){
                console.log("LOCAL STREAM");
            },
            onremotestream: function(stream){
                console.log("REMOTE STREAM! Type:");
                console.log(stream);
                let video = document.createElement("video");
                video.autoplay = true;
                video.srcObject = stream;
                video.muted = true;
                video.addEventListener("canplay", () => {
                    videoContainer.removeChild(videoContainer.firstChild);
                    videoContainer.appendChild(video);
                })
            },
            oncleanup: function(){

            },
            detatched: function(){

            }
        })
    }
}
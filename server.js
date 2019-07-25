const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const process = require("process");
const {useVP8, cert, key, useTls} = require("./config");
const https = require("https");

// Handle to child process running gstream
let gstreamProc = null;

// Commands to use when starting gstream process
const h264cmd = "gst-launch-1.0 -v filesrc location = $1 ! decodebin ! x264enc ! rtph264pay config-interval = 1 pt = 96 ! udpsink host=127.0.0.1 port=5006";
const vp8cmd = "gst-launch-1.0 -v filesrc location = $1 ! video/x-raw-yuv,width=480,height=360 ! decodebin ! videoconvert ! vp8enc target-bitrate=1000 threads=4 resize-allowed=true min_quantizer=13 cpu-used=5 ! rtpvp8pay ! udpsink host=127.0.0.1 port=5004";
const streamcmd = useVP8 ? vp8cmd : h264cmd;

const footageDir = './footage';

// Maps timestamps to file paths
let pathMap = {};

const extensions = {
    "front": "-front.mp4",
    "right": "-right_repeater.mp4",
    "left": "-left_repeater.mp4"
}

const getPath = (timestamp, camera) => pathMap[timestamp] + extensions[camera];

let app = express();
let apiRouter = express.Router();

function setFeed(path){
    console.log("setting to " + path);
    if(gstreamProc !== null){
        console.log("killing")
        console.log(gstreamProc.pid);
        gstreamProc.kill();
    }

    let cmdsplit = streamcmd.replace("$1", path).split(" ");
    gstreamProc = spawn(cmdsplit[0], cmdsplit.slice(1), {
        setsid: true
    });
    console.log(gstreamProc.pid)
    gstreamProc.stdout.on("data", (data) => {
        //console.log(data.toString());
    });
    gstreamProc.stderr.on("data", (data) => {
        //console.log(data.toString());
    });
    
}

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
});

app.use(express.json());

app.use(express.urlencoded({extended: true}));

app.use(express.static("./dist"))

function readDirAsync(dir){
    return new Promise((resolve, reject) => {
        fs.readdir(dir, function(err, items){
            resolve(items);
        });
    });
}

async function forEachAsync(arr, func){
    for(var i = 0; i < arr.length; i++){
        await func(arr[i], i, arr);
    }
}

async function refreshDirectory(){
    pathMap = {};

    let recentClips = await readDirAsync(footageDir + "/RecentClips");

    let savedClipsDirs = await readDirAsync(footageDir + "/SavedClips");
    let savedClips = await Promise.all(savedClipsDirs.map(savedClipsDir => readDirAsync(footageDir + "/SavedClips/" + savedClipsDir)));

    recentClips.forEach(recentClip => {
        let timestamp = recentClip.substring(0, recentClip.lastIndexOf("-"));
        pathMap[timestamp] = footageDir + "/RecentClips/" + timestamp;
    });

    await forEachAsync(savedClipsDirs, async (savedClipsDir) => {
        let savedClips = await readDirAsync(footageDir + "/SavedClips/" + savedClipsDir);
        savedClips.forEach(savedClip => {
            let timestamp = savedClip.substring(0, savedClip.lastIndexOf("-"));
            pathMap[timestamp] = footageDir + "/SavedClips/" + savedClipsDir + "/" + timestamp;
        })
    });


}

apiRouter.get('/list', async (req, res) => {
    await refreshDirectory();
    res.status(200);
    res.write(JSON.stringify(Object.keys(pathMap).sort()))
    res.end();
});




// Set feed of Janus stream
apiRouter.post('/set', async (req, res) => {
    console.log("Body:");
    console.log(req.body);
    let timestamp = req.body.timestamp;
    let camera = req.body.camera;

    let path = getPath(timestamp, camera);
    setFeed(path);
    res.status(200);
    res.end();
});

// Download link for video
app.get('/video/:timestamp/:camera/download.mp4', async (req, res, next) => {
    console.log("Parameters:");
    console.log(req.params);
    let path = getPath(req.params.timestamp, req.params.camera);
    var stat = fs.statSync(path);
    res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size
    })
    let readStream = fs.createReadStream(path);
    readStream.pipe(res);
});

refreshDirectory();

app.use('/api', apiRouter);

app.listen(80);

if(useTls){
    https.createServer({
        key: fs.readFileSync(key),
        cert: fs.readFileSync(cert)
    }, app).listen(443);
}
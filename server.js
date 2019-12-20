// 
// is highway 80 open?
//
// @author: Ido Green | @greenido
// @date: March 2018
// @last update: March 2018
//
// @see:
// source for date: http://www.dot.ca.gov/hq/roadinfo/display.php?page=i80
//
// https://github.com/greenido/bitcoin-info-action
// http://expressjs.com/en/starter/static-files.html
// http://www.datejs.com/
//
//
// init project pkgs
const express = require('express');
const ApiAiAssistant = require('actions-on-google').ApiAiAssistant;
const bodyParser = require('body-parser');

const request = require('request'); // TODO: replace all of these calls with GOT (the line below)
const got = require('got');

const app = express();
const Map = require('es6-map');
const dateJS = require('./dateLib.js');

// Pretty JSON output for logs
const prettyjson = require('prettyjson');
const toSentence = require('underscore.string/toSentence');

var admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert('.data/highway-80-california-firebase-adminsdk-key.json'),
  databaseURL: 'https://highway-80-california.firebaseio.com'
});
const db = admin.database();
const ref = db.ref('i80-AoG/Calls');

app.use(bodyParser.json({type: 'application/json'}));
app.use(express.static('public'));

//
// Main entry points
//
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/views/index.html');
});

// Add a health check route in express
app.get('/_health', (req, res) => {
  res.status(200).send('ok 🥇');
})

//
//
//
app.get("/getText", function (req, res) {
  //console.log('** Handling getText/' );
  request.post({url: 'https://roads.dot.ca.gov/roadscell.php' , form: {roadnumber: '80', submit: 'Search'} }, function (error, response, body) {
    if (error) throw new Error(error);

    //console.log("🚀 RES: " + JSON.stringify(response ));
    try {  
    let html = response.body; 
    //console.log("===From Web Page ====" + html + "\n\n");

    let inx1 = html.indexOf('IN THE SAN FRANCISCO BAY ARE') + 2;
    let inx2 = html.indexOf('</p>', inx1) + 1;
    let inx22 = html.indexOf('</p>', inx2) + 1; 
    let inx3 = html.indexOf('</p>', inx22); 
    let roadConditionsStr = '<strong>' + html.substring(inx1 , inx3).trim();
     roadConditionsStr = roadConditionsStr.replace(/\[/g, '');
     roadConditionsStr = roadConditionsStr.replace(/\]/g, ': ');
    // roadConditionsStr = roadConditionsStr.replace(/solano co/gi, 'Solano county:');
    // roadConditionsStr = roadConditionsStr.replace(/placer co/gi, 'Placer county');
    // roadConditionsStr = roadConditionsStr.toLowerCase();
    // roadConditionsStr = roadConditionsStr.replace(/in the/g, '<br><br>In the');
    // roadConditionsStr = roadConditionsStr.replace(/closed/g, ' 🛑<b>closed</b>');
    // roadConditionsStr = roadConditionsStr.replace(/\*\*for /g, '<br>🚗 For ');
    console.log("== roadConditionsStr: " + roadConditionsStr);

    if (roadConditionsStr == null || roadConditionsStr.length < 3) {
      res.send("<b>Could not get the road conditions.</b><br>You can check with the Caltrans Highway Information Network at phone 800-427-7623.<br>Have safe trip!");
      return;
    }

    let resText = "🛣 The current road conditions (" + getCurrentDateTime() + ") " + roadConditionsStr;
    res.send(resText);
  }
  catch(error) {
    console.log("🧐 getText Error: " + error + " json: "+ JSON.stringify(error));
  }
  });
});

        
// Calling GA to make sure how many invocations we had on this skill
const GAurl = "https://ga-beacon.appspot.com/UA-65622529-1/highway-80-california-server/?pixel=0";
request.get(GAurl, (error, response, body) => {
  console.log(" - Called the GA - " + new Date());
});

//
// Handle webhook requests
//
app.post('/', function(req, res, next) {
  //logObject("-- req: " , req);
  //logObject("-- res: " , res);
  
  // Instantiate a new API.AI assistant object.
  const assistant = new ApiAiAssistant({request: req, response: res});
  const KEYWORD_ACTION = 'input.welcome'; 
  
  //
  // trim words so we won't talk for more than 2 minutes.
  //
  function trimToWordsLimit(limit, text) {
    if (text == null) {
      return "";
    }
    
    var words = text.match(/\S+/g).length;
    var trimmed = text;
    if (words > limit) {
        // Split the string on first X words and rejoin on spaces
        trimmed = text.split(/\s+/, limit).join(" ");
    }
    return trimmed;
  }
  
  //
  // Clean the text we are getting from the API so it will work great with voice only
  //
  function getOnlyAsciiChars(str) {
    let cleanStr = str.replace(/[^\x00-\x7F]/g, "");
    //&#8217;
    cleanStr = cleanStr.replace(/&#\d\d\d\d;/g, "");
    cleanStr = cleanStr.replace(/\\u\w+/g, "");
    cleanStr = cleanStr.replace(/\\n/g, "");
    return cleanStr;
  }
  
  //
  // Coz some APIs return some data fields not inside tags :/
  //
  function cleanHTMLTags(html) {
    if (html != null && html.length > 1) {
      let text = html.replace(/<(?:.|\n)*?>/gm, '');
      let inx1 = 0;
      let foundDataField = text.indexOf("data-");
      while (inx1 < text.length && foundDataField > 0) {
        let inx2 = text.indexOf(">", inx1) + 1;
        if (inx2 < inx1) {
          inx2 = text.indexOf("\"", inx1) + 1;
          inx2 = text.indexOf("\"", inx2) + 2;
        }
        text = text.substring(0,inx1) + text.substring(inx2, text.length);
        inx1 = inx2 + 1;
        foundDataField = text.indexOf("data-", inx1);
      } 
      return text;  
    }
    //
    return html;
  }
  
  //
  // Save to Firebase
  //
  function saveToDB(str) {
    var now = new Date().getTime();
    const usersRef = ref.child(now);
    usersRef.set({
      roadStr: str,
      date: new Date().toISOString()
    });
  }
  
  //
  // Create functions to handle intents here
  //
  function getRoadConditions(assistant) {
    console.log('** Handling action: ' + KEYWORD_ACTION );
    request.post({url: 'https://roads.dot.ca.gov/roadscell.php' , form: {roadnumber: '80', submit: 'Search'} }, function (error, response, body) {
    if (error) throw new Error(error);

    //console.log("🚀 RES: " + JSON.stringify(response ));
    try {  
    let html = response.body; 
    //console.log("===From G-Action ====" + html + "\n\n");

    let inx1 = html.indexOf('IN THE SAN FRANCISCO BAY ARE') + 2;
    let inx2 = html.indexOf('</p>', inx1) + 1;
    let inx3 = html.indexOf('</p>', inx2); 
    let roadConditionsStr = html.substring(inx1 , inx3).trim();
    roadConditionsStr = roadConditionsStr.replace(/\[/g, '');
    roadConditionsStr = roadConditionsStr.replace(/\]/g, ': ');
    roadConditionsStr = cleanHTMLTags(roadConditionsStr);
    console.log("== roadConditionsStr: " + roadConditionsStr);

    if (roadConditionsStr == null || roadConditionsStr.length < 3) {
      assistant.ask("Could not get the road conditions. You can check with the Caltrans Highway Information Network at phone 800-427-7623. Have safe trip!");
      // 😮 saveToDB("ERROR - could not get the road conditions");
      return;
    }

    let res = "Hey! The current road conditions on " + roadConditionsStr + " -- Wish me to say it again?";
     // 'tell' (and not 'ask') as we don't wish to finish the conversation
    assistant.ask(res);
    saveToDB(roadConditionsStr);
      
  }
  catch(error) {
    console.log("🧐 getText Error: " + error + " json: "+ JSON.stringify(error));
  }
  });
  }
  
  //
  // Add handler functions to the action router.
  //
  let actionRouter = new Map();
  actionRouter.set(KEYWORD_ACTION, getRoadConditions);
  
  // Route requests to the proper handler functions via the action router.
  assistant.handleRequest(actionRouter);
});

//
// Handle errors
//
app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).send('Oppss... Something is not working. Please let @greenido know about it.');
})

//
// Pretty print objects for logging
//
function logObject(message, object, options) {
  console.log(message);
  //console.log(prettyjson.render(object, options));
}

//
//
//
function getCurrentDateTime() {
  let currentdate = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  // let datetime = " " + currentdate.getDate() + "/"
  //               + (currentdate.getMonth()+1)  + "/" 
  //               + currentdate.getFullYear() + " @ "  
  //               + currentdate.getHours() + ":"  
  //               + currentdate.getMinutes() + ":" 
  //               + currentdate.getSeconds();
  return currentdate;
}

//
// Listen for requests -- Start the party
//
let server = app.listen(process.env.PORT, function () {
  console.log('--> Our Webhook is listening on ' + JSON.stringify(server.address()));
});
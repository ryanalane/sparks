var configPath = './secrets.env'
var fs = require('fs')
if(fs.existsSync(configPath)) {
  require('dotenv').config({path: configPath})
}
// Load environment variables

var express = require('express')
var session = require('express-session')
var passport = require('passport')
var Evernote = require('evernote')
var EvernoteStrategy = require('passport-evernote').Strategy
var twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)
var app = express()

passport.use(new EvernoteStrategy({
      requestTokenURL: 'https://sandbox.evernote.com/oauth',
      accessTokenURL: 'https://sandbox.evernote.com/oauth',
      userAuthorizationURL: 'https://sandbox.evernote.com/OAuth.action',
      consumerKey: process.env.EVERNOTE_CONSUMER_KEY,
      consumerSecret: process.env.EVERNOTE_CONSUMER_SECRET,
      callbackURL: "http://localhost:3000/authorized"
    },
    function(token, tokenSecret, profile, cb) {
      cb(null, {oauthToken: token, oauthTokenSecret: tokenSecret, profile: profile})		
    }
  )
)

passport.serializeUser(function(user, cb) {
  cb(null, user)
})

passport.deserializeUser(function(obj, cb) {
  cb(null, obj)
})

app.use(passport.initialize())
app.use(passport.session())
app.use(session({ secret: 'keyboard cat', resave: true, saveUninitialized: true }))

app.get('/setup', 
  passport.authenticate('evernote', { failureRedirect: '/setup' }),
  function(req, res) {
    console.log('starting up')
    res.status(200).send({});
  }
)

app.get('/authorized', 
  passport.authenticate('evernote', { failureRedirect: '/setup' }),
  function(req, res) {
    var oauthToken = req.user.oauthToken
    // oauthAccessToken is the token you need;
    var authenticatedClient = new Evernote.Client({
      token: oauthToken,
      sandbox: true,
      china: false,
    });
    var userStore = authenticatedClient.getUserStore();
    var noteStore = authenticatedClient.getNoteStore();
    userStore.getUser().then(function(user) {
      if(user.errorCode) {
        console.log('error', user)
      } else {
        var filter = {}
        filter.tagGuids = [process.env.TAG_GUID]
        noteStore.findNotesMetadata(filter, 0, 100, {includeTitle: true}).then(function(notes) {
          // Randomize a note here!
          var noteGuid = notes.notes[0].guid
          noteStore.shareNote(noteGuid).then(function(shareKey) {
            if (shareKey.errorCode) {
              console.log("Error sharing note:");
              console.log(shareKey);
            } else {
              var link = 'https://sandbox.evernote.com' + "/shard/" + user.shardId + "/sh/" + noteGuid + "/" + shareKey
              twilio.messages.create({
                body: link,
                to: process.env.MY_NUMBER,
                from: process.env.TWILIO_NUMBER
              },function(err, data) {
                if(err) {
                  console.log('couldn\'t send the text', err)
                } else {
                  console.log('link sent!')
                }
              })
              res.status(200).send({
                'link': link
              })
            }
          })
        }).catch(function(err) {
          console.log(err) 
        });
      }
    })
  }
)

app.listen(3000)

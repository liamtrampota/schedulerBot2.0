const { RTMClient, WebClient } = require('@slack/client');
const {google} = require('googleapis');
const express = require('express')
const bodyParser = require('body-parser')
const mongoose = require('mongoose');
const fetch = require('node-fetch-polyfill')
import {User} from './models.js';

//connect to mongoose
mongoose.connect(process.env.MONGODB_URI);

//dialogflow
const dialogflow = require('dialogflow');

//calender API function
function  makeCalendarAPICall(token, conversationId, type, event, user) {
  console.log('CALENDAR API CALL')
  console.log('makeCalender called with token:', token)

 //sets OAuth2
 const oauth2Client = new google.auth.OAuth2(
     process.env.CLIENT_ID,
     process.env.CLIENT_SECRET,
     process.env.REDIRECT_URL
  )
  oauth2Client.setCredentials(token)

  //listens for refresh tokens.. not sure how to use exactly
  oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      // store the refresh_token in my database!
      User.findOneAndUpdate({user: user}, {token:tokens}, function(err, user){
        if(user){
          console.log('updated users tokens')
        } else {
          console.log('did not update users tokens')
        }
      })
      oauth2Client.setCredentials(tokens)
      console.log(tokens.refresh_token);
    }
  console.log(tokens.access_token);
  });

  //connects to users calendar
  const calendar = google.calendar({version: 'v3', auth: oauth2Client})

  console.log('type:', type);
  console.log('event:', event);

  //checks if calendar call is for reminder
  if(type=='reminder'){
    var correctDate = event.date.slice(0,10)
    calendar.events.insert({
        calendarId: 'primary', // Go to setting on your calendar to get Id
        'resource': {
          'summary': event.subject,
          'end': {
            'date':correctDate
          },
          'start': {
            'date':correctDate
          }
        }

      }, (err, data) => {
        if (err) return console.log('The API returned an error: ' + err);
        else {
          var a=new Date(data.data.start.date);
          console.log("a :",a)
          var b=Number(a)
          console.log('b:', b)
          var num1 = b-(1000*60*60*7)
          var num2= b+(1000*60*60*9)
          console.log("num1:", num1, new Date(num1))
          console.log("num2:", num2, new Date(num2))
          web.reminders.add({
            text:data.data.summary,
            time:num1,
            user:user,
            token:process.env.SLACK_USER_TOKEN
          })
          .then((res) => {
            console.log(res)
          })
          .catch(console.error)

          web.reminders.add({
            text:data.data.summary,
            time:num2,
            user:user,
            token:process.env.SLACK_USER_TOKEN
          })
          .then((res) => {
            console.log(res)
          })
          .catch(console.error)

          rtm.sendMessage(('successfully scheduled a reminder to '+data.data.summary +' on ' + data.data.start.date), conversationId)}
      }
    )
  }

  if(type=='list'){
    calendar.events.list({
       calendarId: 'primary', // Go to setting on your calendar to get Id
       timeMin: (new Date()).toISOString(),
       maxResults: 10,
       singleEvents: true,
       orderBy: 'startTime',
     }, (err, res) => {
       if (err) return console.log('The API returned an error: ' + err);
       const events = res.data.items;
       if (events.length) {
         console.log('Upcoming 10 events:', events.length);
          var eventsMessage = []
          events.map((event) => {
           console.log(event)
           const start = event.start.dateTime || event.start.date;
           console.log(`${start} - ${event.summary}`);
           rtm.sendMessage(`${start} - ${event.summary}`, conversationId)
         })
       } else {
         console.log('No upcoming events found.');
       }
     })
   }

}




//Generating an authentication URL for user
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URL
);

const scopes = 'https://www.googleapis.com/auth/calendar';


//Slackbot
const token = process.env.SLACK_TOKEN

const rtm = new RTMClient(token);
const web = new WebClient(token)
rtm.start()


// rtm.sendMessage('Hi there! Im the scheduler bot! My purpose is to schedule meetings and add todos to your Google Calender',)
//   .then((res) => {
//     // `res` contains information about the posted message
//     console.log('Message sent: ', res.ts);
//   })
//   .catch(console.error);

rtm.on('message', function (event) {
  console.log("RECEIVED USER MESSAGE")
  const conversationId = event.channel;
  console.log('event:', event)
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    state: event.user,
    scope: scopes
  })
  User.find({user:event.user}, function(err, user){
    console.log('FOUND USER')
    console.log('user:', user)
    if(user.length == 0){
      if(event.bot_id === undefined){
        rtm.sendMessage(url, conversationId)
      }
    } else{
      console.log('user exists:', user[0])
      const sessionClient = new dialogflow.SessionsClient();
      const sessionId = event.user;
      const sessionPath = sessionClient.sessionPath(process.env.DIALOGFLOW_PROJECT_ID, sessionId);

      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: event.text,
            languageCode: 'en-US',
          },
        },
      };

      sessionClient.detectIntent(request)
        .then(responses => {
          console.log('DIALOGFLOW RESPONSE')
          //Get information about result
          const result = responses[0].queryResult;
          console.log('result params from dialogflow:', result.parameters)
          console.log(`  Response: ${result.fulfillmentText}`);
          console.log('requireParams present:', result.allRequiredParamsPresent)
          if (result.intent) {
            console.log(`  Intent: ${result.intent.displayName}`);
          }

          //check if user info is complete request
          if(!result.allRequiredParamsPresent){
            //requests user for more info
            console.log('require more user info:', result.fulfillmentText)
            rtm.sendMessage(result.fulfillmentText, conversationId)
          } else {
            //checking which intent was matched - makes corresponding calendar api call
              if(result.intent.displayName == 'reminders.add'){
                  makeCalendarAPICall(user[0].token, conversationId, 'reminder', {subject:result.parameters.fields.name.stringValue, date: result.parameters.fields['date-time'].stringValue}, event.user)
              } else {
                rtm.sendMessage(result.fulfillmentText, conversationId)
              }
            }
        })
        .catch(err => {
          console.error('ERROR:', err);
        });
    }
  })
})

//setup express
const app = express()

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())


// Google OAuth2 callback
app.get('/oauthcallback', (req, res) => {
  console.log('oauthcallback')
  oauth2Client.getToken(req.query.code, function (err, token) {
    if (err) return console.error(err.message)
    else { var newUser = new User({
      user: req.query.state,
      token: token
      });
      newUser.save(function(err){
        if (err) {console.log(error)}
        else {console.log('successfully saved')}
      });
    };
    console.log('token', token, 'state', req.query.state)
    res.send('ok')
  })
})

console.log('listening on port 3000')
app.listen(5000)

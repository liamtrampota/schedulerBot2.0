const { RTMClient, WebClient } = require('@slack/client');
const {google} = require('googleapis');
const express = require('express')
const bodyParser = require('body-parser')
const mongoose = require('mongoose');
import {User} from './models.js';
const fetch = require('node-fetch-polyfill')






//connect to mongoose
mongoose.connect(process.env.MONGODB_URI);

//dialogflow
const dialogflow = require('dialogflow');

//calender API function
function  makeCalendarAPICall(user, conversationId, type, event) {
 console.log("CALENDER API CALLED", )
 console.log("USER:", user);

 //sets OAuth2
 const oauth2Client = new google.auth.OAuth2(
     process.env.CLIENT_ID,
     process.env.CLIENT_SECRET,
     process.env.REDIRECT_URL
  )
  oauth2Client.setCredentials(user.token)

  //listens for refresh tokens.. not sure how to use exactly
  oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      // store the refresh_token in my database!
      console.log(tokens.refresh_token);
    }
  console.log(tokens.access_token);
  });

  //connects to users calendar
  const calendar = google.calendar({version: 'v3', auth: oauth2Client})

  console.log('type:', type);
  console.log('event:', event);


  //updater
  if(type==='update'){
    calendar.events.get({calendarId:user.email, eventId:event.eventId},(err,data)=>{
      if(err) return console.log('The API(get) returned an error: ' + err)
      else{
        console.log('attendees:', data.data.attendees)
        data.data.attendees[0].responseStatus='accepted'
        console.log('attendees update:', data.data.attendees)
        console.log('data',data.data)
        var calendarObject={calendarId:'primary', eventId:event.eventId ,resource:data.data}
        console.log('calendar Object', calendarObject)
        calendar.events.update({calendarId:'primary', eventId:event.eventId ,resource:data.data},(err,data)=>{
          if(err) return console.log('The API(update) returned an error: ' + err)
          else{
            console.log('successfully updated', data)
            rtm.sendMessage('Meeting confirmed :)', conversationId)
          }
        })
      }
    })
  }

  //checks if calendar call is for reminder

  if(type=='scheduler'){
    var startDateTime = new Date(event.dateTime)
    var startDateTimeNum = Number(startDateTime)
    var endDateTimeNum = startDateTimeNum + (1000*60*30)
    var endDateTime = new Date(endDateTimeNum)

    if(event.attendees.length>0){

      User.find({user: {$in: [event.attendees]}}, function(err, users){

        if(err){
          console.log(err)
        }

        else if(users.length>0){
          console.log('FOUND ATTENDEES:', users)
          var attendeeArray=users.map((user)=>({displayName:user.name, email:user.email}))

          calendar.events.insert({
              calendarId: 'primary', // Go to setting on your calendar to get Id
              'resource': {
                'attendees':attendeeArray,
                'summary': event.subject,
                'end': {
                  'dateTime': endDateTime,
                  //'timeZone':
                },
                'start': {
                  'dateTime':startDateTime,
                  //'timeZone':
                }
              }

            }, (err, data) => {
              if (err) return console.log('The API returned an error: ' + err);
              else {
                //console.log('successfully added meeting,', data)
                rtm.sendMessage('Successfully scheduled the meeting!', conversationId)
                console.log('CALENDAR MEETING INSERTED')
                console.log('CALENDER DATA:', data.data.id)
                event.attendees.forEach(function(id){
                  web.conversations.open({
                    token: process.env.SLACK_TOKEN,
                    users: id,
                    return_im: false
                  }).then((response)=>{
                    web.chat.postMessage({
                      channel: response.channel.id,
                      // as_user: true,
                      "text": user.name + " has invited you to a meeting to " + event.subject + ' at ' + startDateTime,
                      "attachments": [
                          {
                              "text": "Can you attend?",
                              "fallback": "You are unable to choose a game",
                              "callback_id": data.data.id,
                              "color": "#3AA3E3",
                              "attachment_type": "default",
                              "actions": [
                                  {
                                      "name": "yes",
                                      "text": "Yes",
                                      "type": "button",
                                      "value": "yes"
                                  },
                                  {
                                      "name": "no",
                                      "text": "No",
                  					          "style": "danger",
                                      "type": "button",
                                      "value": "no"
                                  },
                                  {
                                      "name": "reschedule",
                                      "text": "Reschedule",
                                      "type": "button",
                                      "value": "reschedule",
                                      "confirm": {
                                          "title": "Are you sure?",
                                          "text": "Are you sure?",
                                          "ok_text": "Yes",
                                          "dismiss_text": "No"
                                      }
                                  }
                              ]
                          }
                      ]

                    })
                      .then((res) => {
                        // `res` contains information about the posted message
                        console.log('Message sent: ', res.ts)
                      })
                      .catch(console.error)
                    })



                    //
                    // rtm.sendMessage(user.name +' scheduled a meeting with you at ' + startDateTime, response.channel.id)})
                })
              }
            })
          }

          else{
            console.log('ATTENDEES NOT AUTHORIZED')
            rtm.sendMessage('Successfully added the meeting to your calendar! We will notify the invitees about the meeting', conversationId)
            event.attendees.forEach(function(id){
              const url = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                approval_prompt: 'force',
                state: id,
                scope: scopes
              })
              web.conversations.open({
                token: process.env.SLACK_TOKEN,
                users: id,
                return_im: false
              }).then((response)=>{rtm.sendMessage(user.name + ' invited you to a meeting at ' + startDateTime + '. To add it to your calender or decline the event through Scheduler 2.0, please grant me access to your google calendar by clicking on the link: ' + url, response.channel.id)})
            })
          }

        })
      } else {
        console.log('NO ATTENDEES:', users)
        calendar.events.insert({
            calendarId: 'primary', // Go to setting on your calendar to get Id
            'resource': {
              'summary': event.subject,
              'end': {
                'dateTime': endDateTime,
                //'timeZone':
              },
              'start': {
                'dateTime':startDateTime,
                //'timeZone':
              }
            }

          }, (err, data) => {
            if (err) return console.log('The API returned an error: ' + err);
            else {
              //console.log('successfully added meeting,', data)
              rtm.sendMessage('Successfully scheduled the meeting!', conversationId)
            }
          })
      }
    }

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
            user:user.user,
            token:process.env.SLACK_USER_TOKEN
          })
          .then((res) => {
            console.log(res)
          })
          .catch(console.error)

          web.reminders.add({
            text:data.data.summary,
            time:num2,
            user:user.user,
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

const scopes = ['https://www.googleapis.com/auth/calendar','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/userinfo.email'];


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
  const conversationId = event.channel;
  console.log('event:', event)
  // const url = oauth2Client.generateAuthUrl({
  //   access_type: 'offline',
  //   approval_prompt: 'force',
  //   state: event.user,
  //   scope: scopes
  // })
  User.find({user:event.user}, function(err, user){
    console.log('user:', user)
    if(user.length == 0){
      if(!event.bot_id){
      rtm.sendMessage('http://ed3377e8.ngrok.io/authorize?user=' + event.user, conversationId)
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
            if(result.intent){
              if(result.intent.displayName == 'reminders.add'){
                  makeCalendarAPICall(user[0], conversationId, 'reminder', {subject:result.parameters.fields.name.stringValue, date: result.parameters.fields['date-time'].stringValue}, )
              }
              else if(result.intent.displayName == 'Meeting'){
                var attendees = result.parameters.fields.any.listValue.values.map(function(item){
                  return item.stringValue
                })
                console.log('attendees:', attendees)
                var dateTime = result.parameters.fields.date.stringValue.slice(0,10)+'T'+result.parameters.fields.time.stringValue.slice(11,19);
                makeCalendarAPICall(user[0], conversationId, 'scheduler', {subject:result.parameters.fields.subject.stringValue, dateTime:dateTime, attendees:attendees}, )
              } else {
                rtm.sendMessage(result.fulfillmentText, conversationId)
              }
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
  console.log('req:', req)
  console.log('req.body:', req.body)
  oauth2Client.getToken(req.query.code, function (err, token) {
    console.log('token:', token)
    if (err) return console.error(err.message)
    else {
      fetch('https://www.googleapis.com/oauth2/v1/userinfo?access_token='+token.access_token)
      .then((res)=>res.json())
      .then((obj)=>{
        console.log('obj:', obj)
        var newUser = new User({
        user: req.query.state,
        token: token,
        email:obj.email,
        name: obj.name

        });
        newUser.save(function(err){
          if (err) {console.log(error)}
          else {console.log('successfully saved')}
        });
      })
    };
    console.log('token', token, 'state', req.query.state)
    console.log('req.query:',req.query)
    res.send('ok')
  })
})

app.get('/authorize', (req, res) => {
  console.log('user:', req.query.user)
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    approval_prompt: 'force',
    state: req.query.user,
    scope: scopes
  })
  res.redirect(url)
})

app.post('/button', (req, res) => {
  console.log('button pressed')
  var payload = JSON.parse(req.body.payload)
  console.log(payload)
  if(payload.actions[0].value=='yes'){
    User.find({user:payload.user.id}, (err, user)=>{
      if (err) {console.log(err)}
      else {
        console.log("FOUND USER:", user)
        makeCalendarAPICall(user[0], payload.channel.id,'update',{eventId:payload.callback_id})
      }
    })
  } else {
    rtm.sendMessage('Meeting declined :)', payload.channel.id)
  }
  res.status(200).json()

})

console.log('listening on port 5000')
app.listen(5000)

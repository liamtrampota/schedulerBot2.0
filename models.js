const mongoose = require('mongoose');

var userSchema = new mongoose.Schema({
  user: String,
  token: Object,
  email:String
})

var User = mongoose.model('user', userSchema)

export {User}

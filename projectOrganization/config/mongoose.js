var mongoose = require('mongoose');
var config = require('./config');

module.exports = function() {
    var db = mongoose.connect(config.mongdb);

    require('../app/models/news.server.model');

    return db;
}

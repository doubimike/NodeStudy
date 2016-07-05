var express = require('express');
var morgan = require('morgan');
var app = express();

// app.use(morgan());

app.get('/', function(req, res) {
    res.end('hello');
});

app.listen(3000);

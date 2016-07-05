var redis = require('redis');

var client = redis.createClient(6379, 'localhost');

client.set('hello', 'this is a value');

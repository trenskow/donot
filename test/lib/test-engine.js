var EventEmitter = require('events').EventEmitter;
var util =require('util');

function TestEngine() {
  if (!(this instanceof TestEngine)) return new TestEngine();
  EventEmitter.call(this);
};

util.inherits(TestEngine, EventEmitter);

TestEngine.prototype.map = {
  '.txt': '.test'
};

TestEngine.prototype.compile = function(file, data, encoding, cb) {
  this.emit('compile', file);
  cb(null, data);
};

TestEngine.prototype.render = function(url, data, encoding, cb) {
  this.emit('render', url);
  cb(null, data);
};

exports = module.exports = TestEngine;

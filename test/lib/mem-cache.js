var EventEmitter = require('events').EventEmitter;
var util = require('util');

function MemCache() {
  if (!(this instanceof MemCache)) return new MemCache();

  EventEmitter.call(this);

  this.cache = {};

  return this;

}

util.inherits(MemCache, EventEmitter);

MemCache.prototype.get = function(file, cb) {
  cb(null, this.cache[file]);
};

MemCache.prototype.set = function(file, data, cb) {
  this.cache[file] = data;
  // Emit update on cache update
  this.emit('update', file);
  cb();
};

MemCache.prototype.invalidate = function(created) {
  for (key in this.cache) {
    this.cache[key].created = created;
  };
  this.emit('invalidated');
};

exports = module.exports = MemCache;

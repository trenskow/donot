'use strict';

var cache = {};

exports = module.exports = {
  get: function(file, cb) {
    cb(null, cache[file]);
  },
  set: function(file, data, cb) {
    cache[file] = data;
    cb();
  },
  invalidate: function(modified) {
    for (var key in cache) {
      cache[key].modified = modified;
    }
  }
};

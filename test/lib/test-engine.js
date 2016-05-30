'use strict';

var fs = require('fs');

/// Simple engine for testing
/// Removes prefixed 'test ' at compile
/// Appends 'test' at render
exports = module.exports = {
  map: {
    'txt': 'test'
  },
  compile: function(file, data, opt, cb) {
    fs.readFile(file, { encoding: 'utf8' }, function(err, data) {
      if (err) return cb(err);
      cb(null, data.substr(5));
    });
  },
  render: function(url, data, opt, cb) {
    cb(null, data + 'test');
  }
};

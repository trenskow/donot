'use strict';

var Donot = require('./lib/donot');

// We expose a route instead of the actual class.
exports = module.exports = function(root, opt) {
  var donot = new Donot(root, opt);
  return donot.route.bind(donot);
};

// Expose class as well
exports.Donot = Donot;

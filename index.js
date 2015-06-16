var SmartStatic = require('./lib/smart-static');

// We expose a route instead of the actual class.
exports = module.exports = function(root, opt) {
  var smartStatic = new SmartStatic(root, opt);
  return smartStatic.route.bind(smartStatic);
};

// Expose class as well
exports.SmartStatic = SmartStatic;

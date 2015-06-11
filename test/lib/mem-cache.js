var cache = {};

exports = module.exports = {
  get: function(file, cb) {
    cb(null, cache[file]);
  },
  set: function(file, data, cb) {
    cache[file] = data;
    cb();
  },
  invalidate: function(created) {
    for (key in cache) {
      cache[key].created = created;
    };
  }
};

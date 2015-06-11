var c;

exports = module.exports = {
  map: {
    '.txt': '.test'
  },
  compile: function(file, data, opt, cb) {
    cb(null, data);
  },
  render: function(url, data, opt, cb) {
    c = opt.ctx;
    cb(null, data);
  },
  ctx: function() {
    return c;
  }
};

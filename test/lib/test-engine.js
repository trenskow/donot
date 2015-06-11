exports = module.exports = {
  map: {
    '.txt': '.test'
  },
  compile: function(file, data, encoding, cb) {
    cb(null, data);
  },
  render: function(url, data, encoding, cb) {
    cb(null, data);
  }
};

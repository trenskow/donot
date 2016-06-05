'use strict';

var path = require('path');

module.exports = exports = {};

var escapeRegExp = function(str) {
	return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
};

exports.escapeRegExp = escapeRegExp;

var isKindOf = function(lhs, rhs) {
	var prototype = Object.getPrototypeOf(lhs);
	if (!prototype) return false;
	if (prototype.constructor.name === rhs.name) return true;
	return isKindOf(prototype, rhs);
};

exports.isKindOf = isKindOf;

exports.remoteToLocalFilename = function(filename, root, serveDir) {

	var tester = new RegExp('^' + escapeRegExp(serveDir), 'i');

	// Make sure pathname is in our serveDir
	if (!tester.test(filename)) return;

	// Map to local file
	return path.normalize(root + '/' + filename.substr(serveDir.length, filename.length - serveDir.length));

};

exports.localToRemoteFilename = function(filename, root, serveDir) {
	return path.normalize(serveDir + '/' + filename.substr(root.length));
};

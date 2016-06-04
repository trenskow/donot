'use strict';

module.exports = exports = {};

exports.escapeRegExp = function(str) {
	return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
};

var isKindOf = function(lhs, rhs) {
	var prototype = Object.getPrototypeOf(lhs);
	if (!prototype) return false;
	if (prototype.constructor.name === rhs.name) return true;
	return isKindOf(prototype, rhs);
};

exports.isKindOf = isKindOf;

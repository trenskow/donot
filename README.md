smart-static
==========

An http, connect, express middleware that resembles the default express static route - but with the addition of template engine support and template render cache.

----

Example usage with **express.js**
    
    var express = require('express');
    var app = express();
    var smartStatic = require('smart-static');
    
    app.use('/', smartStatic(__dirname + '/public'));

----

# Template Engines

So far not so big a difference from regular static, but **smart-static** also supports template engines.

Currently these template engines are supported:

- [smart-static-jade](http://github.com/trenskow/smart-static-jade.js)
- [smart-static-stylus](http://github.com/trenskow/smart-static-stylus.js)

> See the readme of the individual repositories for more information.


# Usage

Consider the directory structure below.

    /public
    /public/index.jade
    /public/css/main.styl
    /public/images/image.png

These can be served using http, connect or express.js like this.

    var express = require('express');
    var app = express();
    
    var smartStatic = require('smart-static');
    var jade = require('smart-static-jade');
    var stylus = require('smart-static-stylus');
    
    app.use('/', smartStatic(__dirname + '/public'));
    
    smartStatic.engine(jade());
    smartStatic.engine(stylus());
    
    app.listen(process.env.PORT || 3000);

This maps the structure as follows.

    /public/index.jade => /public/index.html
    /public/css/main.styl => /public/main.css
    /public/images/image.png => /public/images/image.png (same)

----

# Caching

**smart-static** does not utilize build-in caching. Templates are just rebuild on every render. 

## Cache Engines

If you want to use caching, these caching engines are currently available:

- [smart-static-mem-cache](http://github.com/trenskow/smart-static-mem-cache.js)
- [smart-static-fs-cache](http://github.com/trenskow/smart-static-fs-cache.js)
- smart-static-redis-cache (work in progress)

Below is an example of how to configure the memory cache engine.

    var smartStatic = require('smart-static');
    var memCache = require('smart-static-sf-cache');
    
    app.use('/', smartStatic(__dirname + '/public', {
        cache: memCache()
    }));

> See the readme of the individual cache plug-ins for usage.

# Options

**smart-static** accepts some options.

`Usage: smartStatic(servePath, options)`

## allowHidden
Default value: `false`.

Tells smart-static to allow access to hidden (dot) files.

## index
Default value: `['index.html']`

An array of default file names.

## engines
Default value: `[]`

An array of engines to use. Alternative to using the `smartStatic.engine()` method.

## cache
Default value: internal build-in memory cache

A cache engine to use for caching - see above.
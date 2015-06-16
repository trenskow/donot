
smart-static
============

A middleware inspired by [static-serve](https://github.com/expressjs/serve-static), but with support for automatic template rendering and caching.

*Can be used as Express or Connect middleware - or with just plain `http`*.

# How it Works

Smart Static is an engine. Build-in is the ability to serve static files,just like static files - being able to serve a local directory as the root of an http server.

But being smart, it also support plug-ins for rendering templates - which means it automatically renders local templates.

## Usage

Smart Static is created like this.

    var smartStatic = require('smart-static');
    
    smartStatic(root, options)

Returns a route to be used with Express, Connect or `http`.

## Example

Consider the following example.

    var http = require('http');
    
    var smartStatic = require('smart-static');
        
    var jade = require('smart-static-jade'); // Jade rendering engine.
    var stylus = require('smart-static-stylus'); // Stylus rendering engine.
	
	var server = http.createServer(smartStatic(__dirname + '/public', {
		engines: [ jade(), stylus() ]
	}));
	
	server.listen(8000);

Now an http server is listening on port 8000 with the content of local directory `/public` being served at `http://localhost:8000/`.

But beyond serving static files it will automatically render templates when requested, so the above example will map the local file structure like below.

    /public/index.html      as     http://localhost:8000/index.html
    /public/images/my.png   as     http://localhost:8000/images/my.png
    ----
    /public/about.jade      as     http://localhost:8000/about.html
    /public/style/my.styl   as     http://localhost:8000/style/my.css

`index.html` and `images/my.png` are served as-is, but `about.jade` and `style/my.styl` are served as their rendered content - all automatically because of the engines added above.

### Rendering engines

Currently [Jade](https://github.com/trenskow/smart-static-jade) and [Stylus](https://github.com/trenskow/smart-static-stylus) rendering engines are available.

> See section "Customizing" below on how to implement your own engines.

## Caching

The build-in default of Smart Static is to just re-render the templates whenever they are requested. This might work with small websites with relative small amounts of users, but rendering can be a cumbersome task - so caching them is a good idea.

As with engines - Smart Static also supports cache plug-ins.

### Example

Below we have extended the above example with caching.

    var http = require('http');
    
    var smartStatic = require('smart-static');
    
    var jade = require('smart-static-jade'); // Jade rendering engine.
    var stylus = require('smart-static-stylus'); // Stylus rendering engine.
    
    var memCache = require('smart-static-mem-cache'); // Memory cache
	
	var server = http.createServer(smartStatic(__dirname + '/public', {
		engines: [ jade(), stylus() ],
		cache: memCache()
	}));
	
	server.listen(8000);

Now all template renderings will be cached in memory and served from there - if the originating templates has not been modified.

Currently a [memory](https://github.com/trenskow/smart-static-mem-cache) and [file system](https://github.com/trenskow/smart-static-fs-cache) cache plug-in are available - and a Redis plug-in is in progress.

> See the "Customizing" section below on how to implement your own cache plug-ins.

## Options

Smart Static supports some options when creating - some of them you've already seen practiced above - more specifically the `engines` and `cache` option.

Currently these options are available.

| Option           | Type      | Dafault          | Description |
|:-----------------|:----------|:-----------------|:------------|
| `engine`         | `Array`   | None             | An array of template engines. |
| `cache`          | `Object`  | None             | A cache plug-in to provide caching |
| `index`          | `Array`   | `['index.html']` | An array of file names to be tested for and used - in prefered order - when directories are requested. |
| `allowHidden`    | `Boolean` | `false`          | Allow acces to hidden (dot) files |
| `allowTemplates` | `Boolean` | `false`          | Allow access to template files |

## Customizing

The plugin architecture of Smart Static makes it fairly easy to extend. See the below projects for more information.

[smart-static-template-engine-template](https://github.com/trenskow/smart-static-engine-plugin-template) on how to implement template engines plug-ins.  
[smart-static-cache-template](https://github.com/trenskow/smart-static-cache-template) on how to implement cache plug-ins.

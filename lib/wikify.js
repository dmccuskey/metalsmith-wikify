var
	each = require('lodash.forEach'),
	extname = require('path').extname,
	includes = require('lodash.includes'),
	swig = require('swig'),
	shortcode = require('shortcode-parser');

var
	removeExtension,
	msMetadata;


swig.setFilter('extension', function(input) {
	if (removeExtension) {
		input = input.replace( /\.[^/.]+$/, '');
	}
	return input;
});


swig.setFilter('prepend', function(input, str) {
	return str+input;
});
swig.setFilter('append', function(input, str) {
	return input+str;
});
swig.setFilter('truncate', function(input, num) {
	return input(1,num);
});
swig.setFilter('strip_newlines', function(input, num) {
	return input(1,num);
});

// swig.setFilter('getChildren', function(element, idx) {
// 	// console.log( idx );
// 	var list = [];
// 	var children = element.children;
// 	for (var name in children ) {
// 		var child = children[name];
// 		// console.log( name );
// 		list.push( { title: child.title, file: child.file } );
// 	}
// 	return list;
// });


var processParents = function(wikiNode, list) {
	if (!wikiNode) { return; }
	var me=wikiNode.me, parent=wikiNode.parent;
	if (parent===null) {
		list.push({title:wikiNode.title,file:wikiNode.file});
	} else {
		processParents( parent._wikiNode, list );
		list.push({title:wikiNode.title,file:wikiNode.file})
	}
}

swig.setFilter('getParents', function(element) {
	var list = [];
	processParents( element, list );
	return list;
});



/*
list of children, in order, with indent
[ {}, {}, {} ]
{ indent=2, title='Hello', file='hello.html' }
*/
var processChildren = function(wikiNode, list, indent) {

	var children = wikiNode.children;
	for (var name in children ) {
		var child = children[name];
		list.push( { title: child.title, file: child.file, indent: indent } );
		processChildren( child, list, indent+'--' );
	}
	return list;

}

// called with wiki node
swig.setFilter('getAllChildren', function(element, idx) {
	var list = [];
	processChildren( element, list, '' )
	return list;
});


var menuTop = swig.compile('<ul class="nav">{{ children|safe }}</ul>');
var menuNode = swig.compile('<li><span class="tree-toggle glyphicon {% if isActive %}glyphicon-triangle-bottom{% else %}glyphicon-triangle-right{% endif %}"></span><label label-default="" class=" nav-header"><a href="/{{ file|extension }}">{{ title }}</a></label><ul class="nav tree{% if isActive %} active{% endif %}">{{ children|safe }}</ul></li>');
var menuLeaf = swig.compile('<li><a href="/{{ file|extension }}">{{ title }}</a></li>');

var processNode = function(wikiNode, parents, isRoot, exclude ) {
	var list=[], hasChildren=false;
	var children = wikiNode.children;
	var parent = parents.length ? parents[0] : {};
	var isParent = (wikiNode.file==parent.file);
	var pList = (isParent) ? parents.slice(1) : [] ;
	for (var name in children ) {
		if (includes(exclude, name)) { continue; }
		hasChildren=true;
		var child = children[name];
		var str = processNode( child, pList, false, exclude );
		list.push(str);
	}
	var childStr = list.join('');
	var str = '';
	if ( isRoot ) {
		str = menuTop({title:wikiNode.title,children:childStr});
	} else if (hasChildren) {
		str = menuNode({isActive:isParent,title:wikiNode.title,file:wikiNode.file,children:childStr});
	} else {
		str = menuLeaf({isActive:isParent,title:wikiNode.title,file:wikiNode.file});
	}
	return str;
}

// called with top-level wiki node
swig.setFilter('getMenu', function( wikiNode, parents, exclude ) {
	exclude = exclude || [];
	return processNode( wikiNode, parents, true, exclude )
});


/**
 * Check whether a file/path is HTML.
 *
 * @param {String} path
 * @return {Boolean}
 */
function html( path ) {
	return /.html/.test(extname(path));
}


/*
	shortcode: children
*/

/*
params includes:
level
topTmpl
nodeTmpl
leafTmpl
depth
style
excerpt
*/
var processChildNode = function( wikiNode, level, params ) {
	if ( level>params.depth ) { return ''; }
	var
		list=[],
		hasChildren=false,
		str,
		childStr;

	each(wikiNode.children, (function(child, name) {
		hasChildren=true;
		var cStr = processChildNode( child, level+1, params );
		list.push(cStr);
	}));

	childStr = list.join('');
	if ( level==0 ) {
		str = params.topTmpl({title:wikiNode.title, url:wikiNode.file, children:childStr });
	} else if ( level==1 ) {
		str = params.nodeTmpl({style:params.style, title:wikiNode.title, url:wikiNode.file, children:childStr, excerpt:wikiNode.me.excerpt, doExcerpt:params.excerpt });
	} else {
		str = params.leafTmpl({title:wikiNode.title, url:wikiNode.file, children:childStr, doExcerpt:params.excerpt, excerpt:wikiNode.me.excerpt });
	}
	return str;
}


var childrenTop = swig.compile('{{ children|safe }}');
var childNode = swig.compile('<{{ style }}><a href="/{{ url|extension }}">{{ title }}</a></{{ style }}>\n{% if doExcerpt && (excerpt!="") %}<p>{{ excerpt|safe }}</p>\n{% endif %}{% if children %}<ul>{{ children|safe }}</ul>\n{% endif %}');
var childLeaf = swig.compile('<li><a href="/{{ url|extension }}">{{ title }}</a>{% if doExcerpt && (excerpt!="") %} &mdash; <span class="smalltext">{{ excerpt|safe }}</span>\n{% endif %}{% if children %}<ul>{{ children|safe }}</ul>\n{% endif %}</li>');

var childrenShortcode = {
	tag: 'children',
	fn: function( file, path, templates ) {
		return function( str, params ) {
			params = params || {};
			params.depth = params.depth ? params.depth : 1;
			params.depth = params.all ? 99 : params.depth;
			params.excerpt = params.excerpt ? params.excerpt : false;
			params.style = params.style ? params.style : 'h3';

			str = processChildNode( file._wikiNode, 0, {
				topTmpl: childrenTop,
				nodeTmpl: childNode,
				leafTmpl: childLeaf,
				depth: params.depth,
				style: params.style,
				excerpt: params.excerpt
			});
			return str;
		}
	}
};


/* ******
	Link
*/

var pageInfoPath = swig.compile('/{{ path|extension }}');
var pageInfoTitle = swig.compile('{{ title }}');
var pageInfoExcerpt = swig.compile('{{ excerpt }}');

var pageInfoShortcode = {
	tag: 'pageInfo',
	fn: function( file, path, templates ) {
		return function( str, params ) {
			var path, attr, file;
			each(params, (function(value,key) {
				if (html(key)) {
					path=key;
				} else {
					attr=key;
				}
			}));
			if (path==undefined) {
				console.error( "ERROR: hmmm, something wrong with [pageInfo] tag in " + path);
				return '';
			}
			file = msMetadata.wikifyFiles[ path ];
			if (!file) { return '!! file not found !!'; }
			switch( attr ) {
				case 'excerpt':
						return pageInfoExcerpt( file );
					break;
				case 'path':
						return pageInfoPath( {path: path} );
					break;
				case 'title':
				default:
						return pageInfoTitle( file );
					break;
			}
		}
	}
}


/* ******
	Link
*/

var linkToTmpl = swig.compile('<a href="/{{ path|extension }}">{{ title }}</a>');

var linkToShortcode = {
	tag: 'linkTo',
	fn: function( file, path, templates ) {
		return function( str, params ) {
			var path, file, str;
			each(params, (function(value,key) {
				path=key;
			}));
			file = msMetadata.wikifyFiles[ path ];
			if (!file) { return '!! file not found !!'; }
			return linkToTmpl({ path: path, title: file.title });
		}
	}
}



/* ******
	Quote
*/

var quoteBlockTmpl = swig.compile('<blockquote><p>{{ content | safe }}</p></blockquote>');

var quoteShortcode = {
	tag: 'quote',
	fn: function( file, path, templates ) {
		return function( str, params ) {
			return quoteBlockTmpl({content: str});
		}
	}
}



/* ******
	Panels
*/

var tipPanel = swig.compile('<div class="panel panel-success"><div class="panel-heading"><span class="glyphicon glyphicon-thumbs-up" aria-hidden="true"></span> {{ title|safe }}</div><div class="panel-body">{{ content|safe }}</div></div>');
var tipAlert = swig.compile('<div class="alert alert-success"><span class="glyphicon glyphicon-thumbs-up" aria-hidden="true"></span> {{ content|safe }}</div>');

var tipShortcode = {
	tag: 'tip',
	fn: function( file, path, templates ) {
		return function( str, params ) {
			if (params.title) {
				return tipPanel({content: str, title: params.title});
			} else {
				return tipAlert({content: str});
			}
		}
	}
}


var notePanel = swig.compile('<div class="panel panel-info"><div class="panel-heading"><span class="glyphicon glyphicon-info-sign" aria-hidden="true"></span> {{ title|safe }}</div><div class="panel-body">{{ content|safe }}</div></div>');
var noteAlert = swig.compile('<div class="alert alert-info"><span class="glyphicon glyphicon-info-sign" aria-hidden="true"></span> {{ content|safe }}</div>');

var noteShortcode = {
	tag: 'note',
	fn: function( file, path, templates ) {
		return function( str, params ) {
			if (params.title) {
				return notePanel({content: str, title: params.title});
			} else {
				return noteAlert({content: str});
			}
		}
	}
}


var warningPanel = swig.compile('<div class="panel panel-warning"><div class="panel-heading"><span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> {{ title|safe }}</div><div class="panel-body">{{ content|safe }}</div></div>');
var warningAlert = swig.compile('<div class="alert alert-warning"><span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> {{ content|safe }}</div>');

var warningShortcode = {
	tag: 'warning',
	fn: function( file, path, templates ) {
		return function( str, params ) {
			if (params.title) {
				return warningPanel({content: str, title: params.title});
			} else {
				return warningAlert({content: str});
			}
		}
	}
}


var dangerPanel = swig.compile('<div class="panel panel-danger"><div class="panel-heading"><span class="glyphicon glyphicon-remove-sign" aria-hidden="true"></span>  {{ title|safe }}</div><div class="panel-body">{{ content|safe }}</div></div>');
var dangerAlert = swig.compile('<div class="alert alert-danger"><span class="glyphicon glyphicon-remove-sign" aria-hidden="true"></span> {{ content|safe }}</div>');

var dangerShortcode = {
	tag: 'danger',
	fn: function( file, path, templates ) {
		return function( str, params ) {
			if (params.title) {
				return dangerPanel({content: str, title: params.title});
			} else {
				return dangerAlert({content: str});
			}
		}
	}
}


/**
 * Return node for wikiNav structure.
 *
 * @param {String} file, the new file/path eg, 'index.html'
 * @return {Object}
 */
function createWikiNavNode( file ) {
	return {
		file: file,
		title: "",
		me: {}, // Metalsmith Page object
		parent: null, // Metalsmith Page object
		children: {}
	}
}


function initWikiNavStructure(opts) {
	removeExtension = opts.removeExtension;
	msMetadata = opts.metadata || {};
	return createWikiNavNode( 'index.html' );
}


/**
 * Check whether a file is an HTML file.
 *
 * @param {Object} tree, current tree structure
 * @param {String} path, eg, 'one/two/three'
 * @param {Object} name, the page name
 * @return {Boolean}
 */
function createWikiNodeAndNavigationPath( tree, path, name ) {
	var
		currNode = tree, // 'tree' is wikiNode.children
		nextNode;
	for (var i = 0; i < path.length; i++) {
		var key = path[i]+'.html';
		if (currNode.hasOwnProperty(key)) {
			currNode = currNode[key].children;
		} else {
			currNode[key] = createWikiNavNode( key );
			currNode = currNode[key].children;
		}
	}

	if (!currNode.hasOwnProperty(name)){
		// create node for current item
		// name has '.html'
		currNode[name] = createWikiNavNode( name );
	}
	return currNode[name];
}


/**
 * Recursive function to assign parent to children.
 *
 * @param {WikiNode} p_node, usually the WikiNav root
 */
function linkWikiNavigationNodes( p_node ) {
	each(p_node.children, (function(c_node, name) {
		c_node.parent = p_node.me;
		linkWikiNavigationNodes( c_node );
	}));
}


function loadWikiShortcodes() {
	// console.log("here in loadWikiShortcodes");
}


function processWikiShortcodes( file, path, templates ) {
	// TODO: add user/local templates
	templates = true;
	var cnt = file.contents.toString();

	// process general shortcodes
	cnt = shortcode.parse(cnt);

	// process file-specific shortcodes
	var ctx = {};
	ctx[ childrenShortcode.tag ] = childrenShortcode.fn( file, path, templates );
	ctx[ linkToShortcode.tag ] = linkToShortcode.fn( file, path, templates );
	ctx[ pageInfoShortcode.tag ] = pageInfoShortcode.fn( file, path, templates );

	ctx[ quoteShortcode.tag ] = quoteShortcode.fn( file, path, templates );
	ctx[ tipShortcode.tag ] = tipShortcode.fn( file, path, templates );
	ctx[ noteShortcode.tag ] = noteShortcode.fn( file, path, templates );
	ctx[ warningShortcode.tag ] = warningShortcode.fn( file, path, templates );
	ctx[ dangerShortcode.tag ] = dangerShortcode.fn( file, path, templates );

	file.contents = new Buffer(shortcode.parseInContext(cnt, ctx));
}


module.exports = {
	initWikiNav: initWikiNavStructure,
	createWikiNodeFromPath: createWikiNodeAndNavigationPath,
	linkWikiNodes: linkWikiNavigationNodes,
	loadShortcodes: loadWikiShortcodes,
	processShortcodes: processWikiShortcodes
};


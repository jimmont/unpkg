/*
hit https://unpkg.com/module
=> 301/302
=> 200 https://..../module@version/file.extension
import from "lit-html" => "./lit-html@version/file.extension"
import from "lit-html/anything" => "./lit-html@version/anything"
also import("lit-html")
?all other imports untouched, just retrieve
always quoted 'module' or "module"

module
module@version
htt..../module
htt..../module@version

handle any redirect
save the response to a file with appropriate name
 * */

const https = require('https');
const fs = require('fs');
const pafs = require('path');
const {URL} = require('url');

const options = {
	url: ''
	, origin: 'https://unpkg.com'
	, dest: './unpkg-src'
	, default: 'unpkg.js'
	, max: 5
};

const patterns = {
	, importPattern: /(\bimport\b[^;]*?[\'\"])([^\'\"]+)/g
	// http:// or ./path
	, importPatternStart: /^(?:[a-z]{2,10}:\/\/|\.+\/)/i
	// anything/file.extension
	, importPatternEnd: /\/[^\/]+\.[a-z]+$/i
	, importPatternUrl: /^[a-z]{2,}:\/\/[^\/]{3,}/i
	, namePattern: /^(?:[a-z]+:\/\/[^\/]+)?\/?([^\/]+)(?:\/[^\/]*)?$/i
	// import "bare-module" => import "./bare-module/unpkg-import.js"
	// symlink (later) ./bare-module/unpkg-import.js => ./bare-module@version/real-file.js
	// import "bare-module/path/to/any" => import "./bare-module/path/to/any"
	// symlink (later) ./bare-module/ => ./bare-module@version/
};

process.argv.reduce(function configure(options, arg, i){
	// allow name=value or name:value
	var parts = arg.match(/^-*(?:unpkg-?)?([a-z][a-z0-9]+)(?:[=:]?(.+))?/i);
	if(parts){
		let name = parts[1];
		let value = (parts[2] || '').trim();
		options[ name ] = value;
	}
	return options;
}, options);

console.log(`unpkg usage like:
$ node ./unpkg.js url='https://unpkg.com/lit-element'`);
process.chdir(pafs.resolve(options.dest))
console.log(`unpkg with options in "${ process.cwd() }"
overwrite any option with pattern "name='value'" or "unpkg-name=value"
`, options
);

Object.assign(options, patterns);

function exiting(type){
	// this === process
	console.log('unpkg finished with ', type, this===process);
	this.exit(0);
}

/* SIGINT Control+C (not-windows only); SIGHUP terminal closed (all); 
https://nodejs.org/api/process.html#process_process_exit_code
 * */
'beforeExit SIGHUP SIGINT SIGUSR1 SIGUSR2 uncaughtException SIGTERM'.trim().split(/[,\s]+/).forEach((event)=>process.on(event, exiting));

process.on('beforeExit',function beforeExit(...args){
	console.warn('TODO cleanup work, save session, etc');
	console.log('exiting with',args);
});

const requests = Object.defineProperties({}, {
	pending: {value:new Set()}
	, active: {value:new Set()}
	, queue: {value: new Set(), writable: true}
	, all: {value: {}}
	, imports: {value: {}}
	, alias: {value: []}
});

class Importer{
	constructor(){
		this.tick = this.tick.bind(this);
		this.importable = this.importable.bind(this);
	}
	// setup for writing to destination
	fs(path){
		// translate url patterns to file-system
		// ./the/dir/file => ./the/dir
		return new Promise((resolve, reject)=>{
			var file = pafs.resolve(path);
			var dir = pafs.resolve( path.replace(/\/[^\/]*$/, '') );
			fs.mkdir(dir, {recursive: true}, (err)=>{
				if(err) return reject(err);
				resolve( fs.createWriteStream( file ) );//, {emitClose: true} ) );
			});
		});
	}
	// TODO replace with path utils
	path(base, path){
		return `${ base }/${ path }`.replace(/\/{2,}/g, '/');
	}
	/*
		alias './bare-module' to './bare-module@version'
		alias './bare-module/alias.js' to './bare-module@version/real-file.js'

		allowing these transformations and resolution of them:
		import 'bare-module' => import './bare-module/alias.js'
		import 'bare-module@version' => import './bare-module@version/alias.js'
		TODO all this will be imported relative to the target destination, so all paths relative to ./
		then imported separately from external scripts, all resolving to 'real-file.js'
	 */
	resolve(href){
		var url = new URL(href, options.origin);
		return this.queue(url)
			.then(this.tick.bind(this))
			.then((res)=>{
				requests.alias.forEach((it)=>{
					var src = it[0], dest = it[1];
					src = this.path('.', src + (/\.js/i.test(dest) ? ('/' + options.default):''));
					dest = this.path('.', dest);
					console.log(`alias: ${ src } to "${ dest }"`);
					fs.symlink(pafs.resolve(options.dest, dest), pafs.resolve(options.dest, src), (err)=>{
						if(err) console.error(err);
					});
				});
			});
	}
	queue(url){
		var req, added = [], finish;
		if(url) requests.pending.add(url), req, added = [];
		while(requests.pending.size && requests.active.size < options.max){
			url = requests.pending.values().next().value;
			requests.pending.delete(url);
			req = this.request(url);
			finish = this.next.bind(this, url);
			req
				.then( finish )
				.catch((err)=>{ this.error(err); finish(); })
			;
			requests.queue.add(req);
			requests.active.add(url);
			added.push(url);
		};
		return Promise.resolve(added);
	}
	tick(){
		// process the next set and reset
		var list = Array.from(requests.queue);
		requests.queue = new Set();
		console.log(`tick(list.length})`, list);
		return Promise.all(list)
		.then((done)=>{
			var i = 0, res;
			console.log(`tick(resolved:${ done.length })`, done.length, 'pending/active', requests.pending.size, requests.active.size, requests.queue.size, requests);
			while(res = done[i++]){
				console.log('DONE>', res.req.path, res.req.url.href);
			}
			return requests.queue.size ? this.tick() : Object.entries(requests.all);
		})
		.catch((err)=>{
			this.error(err);
			return this.tick();
		})
		;
	}
	next(url){
		requests.active.delete(url);
		this.queue();
		return url;
	}
	request(url){
		var req = requests.all[ url.pathname ];
		if(!req){
			req = requests.all[ url.pathname ] = new Promise((resolve, reject)=>{
				var req;
				req = https.get(url, (res)=>{
				// res.req.path === url.pathname
				// req.path returned here from https.get()
					requests.all[ url.pathname ].status = 1;
					requests.all[ url.pathname ].req = req;
					resolve( this.response(res) );
				})
				.on('error', (err)=>{
					requests.all[ url.pathname ].status = -1;
					requests.all[ url.pathname ].req = req;
					reject( this.error(err) );
				})
				;
				req.url = url;
			});
		};
		req.status = 0;
		return req;
	}
	error(err, ...args){
		console.error(err, args);
		return err;
	}
	response(res){
		const url = res.req.url;
		const statusCode = res.statusCode;
		const config = options;
		if(statusCode > 300 && statusCode <= 302){
		// assuming these redirects only happen with top-level bare imports
		// so we modify url based on this assumption
			requests.alias.push( [url.pathname, res.headers.location] );
			url.pathname = res.headers.location;
			// continue this active request, only in this case, into the next because we change its url directly
			return this.request(url);
		}
		if(statusCode !== 200){
			throw `${statusCode} for ${ url.href }`;
		}
		// res.req.path === url.pathname
		res.pending = [];
		res.on('data', this.write);
		return Promise.all([
			this.fs( this.path( './', res.req.path ), res )
			,new Promise(function(resolve, reject){
				res.on('end', resolve);
				res.on('error', reject);
			})
		]).then((all)=>{
			return new Promise((resolve, reject)=>{
				const stream = all[0];
				stream.on('error', (err)=>{
					reject( this.error(err) );
				});
				stream.write( this.rewriteImports( res.pending.join(''), url  ) || '' );
				resolve( res );
			});
		})
		;
	}
	// import "bare-module" => import "./bare-module/unpkg-import.js"
	// symlink (later) ./bare-module/unpkg-import.js => ./bare-module@version/real-file.js
	// import "bare-module/path/to/any" => import "./bare-module/path/to/any"
	// symlink (later) ./bare-module/ => ./bare-module@version/
	//
	// rewrite anything that isn't protocol://... or ./path
	importable(all, importing, path){
		var url, config = options;
		if(!config.importPatternStart.test(path)){
			if(!config.importPatternEnd.test(path)){
				url = new URL(config.origin + '/' + path, config.origin);
				this.queue(url);
				path = path + (path.endsWith('/') ? '':'/') + config.default;
				console.log(`~import bare "${path}" from "${ url.href }"`);

			}else{
				// ignore, resolve by symlink later
				console.log(`~import rewrote "${path}"`);
			};
			// fix prefix
			path = './'+path;
		}else if(!config.importPatternUrl.test(path)){
			url = new URL(this.basePath + path, config.origin);
			console.log(`~import "${path}" from "${ url.href }"`);
			this.queue(url);
		}
		return importing + path;
	}
	rewriteImports(str, url){
		this.basePath = url.href.replace(/^(.*\/)[^\/]*$/, '$1');
		console.log(`rewriteImports in "${url.href}"; relative to "${ this.basePath }"`);
		return str.replace(options.importPattern, this.importable);
	}
	write(d){
		this.pending.push( d.toString() );
	}
}

new Importer().resolve(options.url);

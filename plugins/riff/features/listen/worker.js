/* The Listen app's service worker, served at the app's worker/ address (Riff\Listen\Standalone::
 * worker()), which puts what to keep before this file as self.riffWorker: the cache's name, the
 * prefix every cache of this app's starts with, and the addresses: the fonts the app's first paint
 * shows, Riff's stylesheets and its script modules.
 *
 * Those addresses, and only those, are answered from the device, so they are there offline and
 * drawn from the first frame on every launch after the first. Every other request, the pages, the
 * REST API and the music among them, goes to the network as if there were no worker. Each address
 * carries its version (?ver=, or the plugin's own for a font), and a new list is a new cache. */
const {
	cache: CACHE,
	prefix: PREFIX,
	files: FILES,
} = self.riffWorker || { cache: 'riff-app', prefix: 'riff-app', files: [] };
const KEPT = new Set( FILES.map( ( url ) => new URL( url, self.location ).href ) );

// A font is fetched with CORS, as a stylesheet asks for one, so another host's can be kept too.
const request = ( url ) =>
	new Request( url, { mode: 'cors', credentials: 'same-origin' } );

self.addEventListener( 'install', ( event ) => {
	event.waitUntil(
		caches
			.open( CACHE )
			// One address that fails, a host's font gone missing, leaves the rest kept.
			.then( ( cache ) =>
				Promise.allSettled(
					[ ...KEPT ].map( ( url ) => cache.add( request( url ) ) )
				)
			)
			.then( () => self.skipWaiting() )
	);
} );

// Only this app's older caches go: another Listen page's app, on the same site, keeps its own.
self.addEventListener( 'activate', ( event ) => {
	event.waitUntil(
		caches
			.keys()
			.then( ( names ) =>
				Promise.all(
					names
						.filter( ( name ) => name.startsWith( PREFIX ) && name !== CACHE )
						.map( ( name ) => caches.delete( name ) )
				)
			)
			.then( () => self.clients.claim() )
	);
} );

self.addEventListener( 'fetch', ( event ) => {
	if ( event.request.method !== 'GET' || ! KEPT.has( event.request.url ) ) {
		return;
	}
	event.respondWith(
		caches.open( CACHE ).then( ( cache ) =>
			cache
				.match( event.request.url, { ignoreVary: true } )
				.then( ( kept ) => {
					if ( kept ) {
						return kept;
					}
					return fetch( event.request ).then( ( response ) => {
						if ( response.ok ) {
							cache.put( event.request.url, response.clone() );
						}
						return response;
					} );
				} )
		)
	);
} );

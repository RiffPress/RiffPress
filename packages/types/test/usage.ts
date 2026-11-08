// Compiled with tsc --noEmit by types.test.js: what a plugin or an app would write against the
// types, and what they must refuse.
import type { Album, AppViewDefinition, Block, Playlist, RiffActions, RiffFilters, Track } from '../index.js';
import { createClient, RiffError } from '../client.js';
import { renderEmail } from '../examples/email.js';

const riff = createClient( { root: 'https://example.com/wp-json/' } );

async function main(): Promise<void> {
	const albums = await riff.request( 'GET /riff/v1/albums', { search: 'blue', orderby: 'added' } );
	const first: Album | undefined = albums.items[ 0 ];
	first?.name.toUpperCase();

	// Nothing required: params may be left out.
	await riff.request( 'GET /riff/v1/library' );

	const post = await riff.request( 'GET /riff/v1/posts/{id}/blocks', { id: 42 } );
	const walk = ( blocks: Block[] ): Track[] => blocks.flatMap( ( b ) => [ ...( b.track ? [ b.track ] : [] ), ...walk( b.innerBlocks ) ] );
	const seconds: number = walk( post.blocks ).reduce( ( sum, t ) => sum + t.duration, 0 );
	seconds.toFixed();
	renderEmail( post ).trim();

	const list: Playlist = await riff.request( 'POST /riff/v1/users/{user}/playlists/{id}', { user: 'me', id: 7, title: 'Night' } );
	list.tracks.map( ( t ) => t.index + t.title.length );

	// @ts-expect-error The address needs its id.
	await riff.request( 'GET /riff/v1/posts/{id}/blocks', {} );
	// @ts-expect-error No such route.
	await riff.request( 'GET /riff/v1/nowhere' );
	// @ts-expect-error orderby is one of the route's own.
	await riff.request( 'GET /riff/v1/albums', { orderby: 'year' } );

	try {
		await riff.request( 'GET /riff/v1/users/{user}/likes', { user: 'me' } );
	} catch ( e ) {
		if ( e instanceof RiffError ) {
			e.status.toFixed();
		}
	}
}

// window.riff, its events and its hooks.
window.riff?.play( [], 0, { shuffle: true } );
window.riff?.on( 'track', ( detail ) => detail.track.title );
// @ts-expect-error on() takes the action's name without its prefix.
window.riff?.on( 'riff.track', () => {} );
document.addEventListener( 'riff:play', ( e ) => e.detail.track.artist );
document.querySelector( '#riff' )?.addEventListener( 'riff:time', ( e ) => {
	const at: number = ( e as CustomEvent<{ time: number }> ).detail.time;
	return at;
} );

const onPlay: RiffActions[ 'riff.play' ] = ( detail, api ) => api.seek( detail.track.duration / 2 );
const queue: RiffFilters[ 'riff.queue' ] = ( tracks ) => tracks.filter( ( t ) => ! t.locked );
// @ts-expect-error A filter hands back what it was given.
const wrong: RiffFilters[ 'riff.track' ] = () => 'track';

const view: AppViewDefinition = { label: 'Charts', render: 'my_charts_render', nav: [ 'sidebar' ] };

export { main, onPlay, queue, wrong, view };

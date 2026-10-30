/* Listening together: while a signed-in listener plays, what they play is shared with the site's
 * listening room through riff/v1/together, so others see it on Home and can listen along. Shared
 * again on each play, pause, track, queue change and seek, and once a minute while it plays to stay
 * in the room. A pause is shared once and then left: the room lets a row go after a few minutes
 * without word, so whoever stops listening drops out without a request on the way out, and a
 * full-page navigation, which resumes on the next page, doesn't flicker out and back. Loaded on
 * demand, when the first track does, and only where the room is. */

export default function together( P ) {
	const url = P.me?.rest?.together;
	if ( ! url ) {
		return {};
	}
	const { root, audio, video, api } = P;
	const MAX = 100; // As many as the route keeps.
	const STAY = 60000;

	let timer = 0;
	let stay = 0;
	let shared = false; // A track restored paused isn't shared until it plays.
	function share() {
		clearTimeout( timer );
		timer = setTimeout( send, 500 ); // A track and its play arrive together.
	}
	function send() {
		clearInterval( stay );
		const t = P.track();
		const id = Number( t?.id );
		if ( ! Number.isInteger( id ) || id <= 0 ) {
			return;
		}
		// The queue around the track playing, as track IDs and the posts they play from.
		const queue = api.queue();
		const from = Math.max( 0, Math.min( P.pos, queue.length - MAX ) );
		const items = queue
			.slice( from, from + MAX )
			.map( ( q ) => ( {
				id: Number( q?.id ),
				post: Number( q?.post?.id ) || 0,
			} ) );
		const index = P.pos - from;
		const kept = items.filter( ( q ) => Number.isInteger( q.id ) && q.id > 0 );
		const playing = api.playing();
		if ( ! playing && ! shared ) {
			return;
		}
		shared = true;
		fetch( url, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'X-WP-Nonce': P.me.nonce,
			},
			body: JSON.stringify( {
				queue: kept,
				index: kept.indexOf( items[ index ] ),
				at: api.time(),
				playing,
			} ),
		} ).catch( () => {} );
		if ( playing ) {
			stay = setInterval( send, STAY );
		}
	}

	for ( const name of [ 'play', 'pause', 'track', 'queue' ] ) {
		root.addEventListener( `riff:${ name }`, share );
	}
	for ( const m of [ audio, video ] ) {
		m.addEventListener( 'seeked', share );
	}
	share();
	return {};
}
